import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { lintTicket } from "../src/ticket-lint.ts";
import { listTickets, newTicket, ticketRoot } from "../src/ticket-home.ts";
import { parseTicket, promiseBlock, resourceKind } from "../src/ticket.ts";
import { ActiveSchema } from "../src/state.ts";

const scratch = mkdtempSync(join(tmpdir(), "agx-ticket-home-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
const complete = (resource: string, fields = ""): string =>
  `+++\nschema = 2\nwrites = ["src/**"]\nverify = ["true"]\n${fields}\n+++\n${resource}\nDo the work.\n`;

describe("ticket promises and resource metadata", () => {
  test.each([
    ["RESOURCE-CLASS(NONCOMPUTE): CLI and tests", "token"],
    [
      "RESOURCE-ENVELOPE(/tmp/resources.json): agent-resource-run only",
      "compute",
    ],
  ] satisfies [string, "token" | "compute"][])(
    "%s determines kind without using the ticket name",
    (line, kind) => {
      expect(resourceKind(line)).toBe(kind);
      const parsed = parseTicket(
        complete(
          line,
          'name = "proof_thing"\nlabels = ["Opaque", "", "a/b", "Opaque"]',
        ),
      );
      expect(parsed.kind).toBe("ticket");
      if (parsed.kind !== "ticket") return;
      const promise = promiseBlock(
        parsed.ticket,
        scratch,
        "none",
        resourceKind(parsed.prose),
      );
      expect(promise.split("\n").length).toBeLessThanOrEqual(15);
      expect(promise).toContain(`kind: ${kind}`);
      expect(promise).toContain('labels: ["Opaque","","a/b","Opaque"]');
      expect(promise).toContain(join(scratch, "src/**"));
      expect(promise).toContain("360 seconds");
      expect(promise).toContain("Sandbox mode: none (unsandboxed).");
      expect(
        ActiveSchema.safeParse({
          schema: 1,
          run_id: "run",
          pid: 1,
          label: "label",
          choice: "luna-low",
          pick_source: "test",
          started_at: "now",
          cwd: scratch,
          kind,
          labels: parsed.ticket.labels,
        }).success,
      ).toBe(true);
    },
  );

  test("kind cannot be supplied in front matter", () => {
    expect(
      parseTicket(
        complete("RESOURCE-CLASS(NONCOMPUTE): CLI", 'kind = "compute"'),
      ).kind,
    ).toBe("invalid");
  });
});

describe("local lint", () => {
  test("schema, timeout, resource, verify and missing premises are collected together", () => {
    const brief =
      '+++\nschema = 2\ntimeout_s = 3\npremises = ["file:missing.ts"]\n+++\nDo the work.\n';
    const result = lintTicket(brief, scratch);
    expect(result.violations.map((item) => item.rule)).toEqual([
      "verify",
      "schema",
      "resource",
      "premise",
    ]);
    expect(
      result.violations.find((item) => item.rule === "schema")
        ?.why_it_blocks_a_6min_first_return,
    ).toContain("timeout_s");
    for (const violation of result.violations)
      expect(violation.fix.length).toBeGreaterThan(0);
  });

  test("older tickets work, resource declarations and diagnostic alternatives pass", () => {
    expect(
      lintTicket(complete("RESOURCE-CLASS(NONCOMPUTE): CLI"), scratch)
        .violations,
    ).toEqual([]);
    expect(
      lintTicket(
        complete("RESOURCE-ENVELOPE(/tmp/r.json): agent-resource-run only"),
        scratch,
      ).violations,
    ).toEqual([]);
    expect(
      lintTicket(
        "+++\nschema = 1\nwrites = []\nread_only_diagnostic = true\n+++\nRESOURCE-CLASS(NONCOMPUTE): inspection",
        scratch,
      ).violations,
    ).toEqual([]);
  });
});

describe("repository ticket home", () => {
  test("new creates one skeleton with repeated labels; ls joins the latest ledger run", () => {
    const root = join(scratch, "repo");
    mkdirSync(root);
    const labels = ["Exact Case", "Exact Case", "x/y"];
    const path = newTicket(root, "retry", labels, "2026-10-10");
    expect(path).toBe(join(root, ".agents/tickets/261010-retry.md"));
    if (path instanceof Error) return;
    const parsed = parseTicket(readFileSync(path, "utf8"));
    expect(parsed.kind === "ticket" && parsed.ticket.labels).toEqual(labels);
    expect(lintTicket(readFileSync(path, "utf8"), root).violations).toEqual([]);
    expect(newTicket(root, "retry", [], "2026-10-10")).toBeInstanceOf(Error);
    expect(newTicket(root, "../escape", [])).toBeInstanceOf(Error);
    expect(
      listTickets(root, [
        { run_id: "earlier", brief: { path }, worker: { outcome: "timeout" } },
        { run_id: "latest", brief: { path }, worker: { outcome: "returned" } },
      ]),
    ).toEqual([
      {
        name: "261010-retry",
        path,
        kind: "token",
        labels,
        last_run_id: "latest",
        outcome: "returned",
      },
    ]);
  });

  test("root lookup works from a nested directory and absent homes list empty", () => {
    expect(ticketRoot(import.meta.dir)).toBe(
      resolve(import.meta.dir, "../../.."),
    );
    expect(listTickets(scratch, [])).toEqual([]);
  });

  test("lint CLI is offline and reports all fixes with exit 1", () => {
    const path = join(scratch, "bad.md");
    writeFileSync(
      path,
      '+++\nschema = 2\ntimeout_s = 1\npremises = ["file:absent"]\n+++\nMissing declaration',
    );
    const result = Bun.spawnSync(
      [
        process.execPath,
        join(import.meta.dir, "../src/agx.ts"),
        "ticket",
        "lint",
        path,
        "--cd",
        scratch,
      ],
      {
        env: {
          ...process.env,
          TYPESAFE_API_KEY: "",
          DISPATCH_ROSTER_PATH: "/no/roster",
        },
        timeout: 5000,
      },
    );
    expect(result.exitCode).toBe(1);
    const output = result.stdout.toString();
    for (const rule of ["schema", "resource", "verify", "premise"])
      expect(output).toContain(`remand ${rule}:`);
    expect(output.match(/Fix:/gu)).toHaveLength(4);
  });
});
