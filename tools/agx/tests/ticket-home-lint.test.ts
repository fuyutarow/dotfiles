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
import {
  amendTicket,
  importTickets,
  listTickets,
  newTicket,
  newTicketAtHome,
  ticketHome,
  selectTicketHome,
  ticketRoot,
} from "../src/ticket-home.ts";
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
  test("state fallback, explicit state, project isolation and existing local homes", () => {
    const previous = {
      state: process.env.AGX_STATE_DIR,
      home: process.env.AGX_TICKET_HOME,
    };
    using _environment = {
      [Symbol.dispose]: () => {
        if (previous.state === undefined) delete process.env.AGX_STATE_DIR;
        else process.env.AGX_STATE_DIR = previous.state;
        if (previous.home === undefined) delete process.env.AGX_TICKET_HOME;
        else process.env.AGX_TICKET_HOME = previous.home;
      },
    };
    const root = join(scratch, "state-project");
    const nested = join(root, "nested");
    const state = join(scratch, "state-storage");
    mkdirSync(nested, { recursive: true });
    process.env.AGX_STATE_DIR = state;
    delete process.env.AGX_TICKET_HOME;
    expect(selectTicketHome(root, nested)).toEqual({
      path: join(state, "tickets/state-project"),
      rule: "state fallback",
    });
    mkdirSync(join(root, ".agents/tickets"), { recursive: true });
    expect(selectTicketHome(root, nested)).toEqual({
      path: join(root, ".agents/tickets"),
      rule: "repo .agents/tickets",
    });
    writeFileSync(join(root, ".agx.toml"), 'ticket_home = "configured"');
    expect(selectTicketHome(root, nested)).toEqual({
      path: join(root, "configured"),
      rule: ".agx.toml ticket_home",
    });
    process.env.AGX_TICKET_HOME = join(scratch, "environment-home");
    expect(selectTicketHome(root, nested)).toEqual({
      path: process.env.AGX_TICKET_HOME,
      rule: "AGX_TICKET_HOME",
    });
    expect(selectTicketHome(root, nested, "state", "other-project")).toEqual({
      path: join(state, "tickets/other-project"),
      rule: "--home state",
    });
    expect(selectTicketHome(root, nested, "state", "../escape")).toBeInstanceOf(
      Error,
    );
    expect(selectTicketHome(root, nested, "state", ".")).toBeInstanceOf(Error);
  });

  test("import copies bytes, retains ids/history, skips name collisions and stays idempotent across days", async () => {
    const source = join(scratch, "import-source");
    const home = join(scratch, "import-home");
    mkdirSync(source);
    mkdirSync(home);
    const history =
      '+++\nschema = 1\nname = "identity"\n+++\r\nOriginal\r\n\r\n## NEXT\r\nnext\r\n## DECISION\r\ndecided\r\n## CLARIFICATION\r\nanswer\r\n';
    writeFileSync(join(source, "identity.md"), history);
    writeFileSync(join(source, "250101-existing.md"), "collision source");
    writeFileSync(join(home, "261009-existing.md"), "keep existing");
    writeFileSync(join(source, "250101-dated.md"), "dated contents");
    writeFileSync(join(source, "ignore.txt"), "not a ticket");
    expect(await importTickets(source, home, "2026-10-10")).toEqual({
      imported: 2,
      skipped_collision: 1,
    });
    expect(readFileSync(join(home, "261010-identity.md"))).toEqual(
      readFileSync(join(source, "identity.md")),
    );
    expect(readFileSync(join(home, "250101-dated.md"), "utf8")).toBe(
      "dated contents",
    );
    expect(readFileSync(join(home, "261009-existing.md"), "utf8")).toBe(
      "keep existing",
    );
    expect(await importTickets(source, home, "2026-10-11")).toEqual({
      imported: 0,
      skipped_collision: 3,
    });
    writeFileSync(join(source, "different-filename.md"), history);
    expect(await importTickets(source, home, "2026-10-12")).toEqual({
      imported: 0,
      skipped_collision: 4,
    });
    expect(await importTickets(join(source, "absent"), home)).toBeInstanceOf(
      Error,
    );
  });
  test("home precedence and two amendments preserve one file and ticket id", () => {
    const root = join(scratch, "override-repo");
    const nested = join(root, "nested", "deeper");
    const configured = join(root, "configured-tickets");
    const envHome = join(scratch, "env-tickets");
    const cliHome = join(scratch, "cli-tickets");
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(root, ".agx.toml"),
      'ticket_home = "configured-tickets"\n',
    );
    expect(ticketHome(root, nested)).toBe(configured);
    const prior = process.env.AGX_TICKET_HOME;
    process.env.AGX_TICKET_HOME = envHome;
    expect(ticketHome(root, nested)).toBe(envHome);
    expect(ticketHome(root, nested, cliHome)).toBe(cliHome);
    if (prior === undefined) delete process.env.AGX_TICKET_HOME;
    else process.env.AGX_TICKET_HOME = prior;
    const path = newTicketAtHome(configured, "same-id", [], "2026-10-10");
    if (path instanceof Error) {
      expect(path).not.toBeInstanceOf(Error);
      return;
    }
    expect(
      amendTicket(path, "first amendment", "2026-10-10T01:00:00Z"),
    ).toBeUndefined();
    expect(
      amendTicket(path, "second amendment", "2026-10-10T02:00:00Z"),
    ).toBeUndefined();
    const text = readFileSync(path, "utf8");
    expect(text).toContain('name = "same-id"');
    expect(text.match(/^## AMEND /gmu)).toHaveLength(2);
    expect(text).toContain("first amendment");
    expect(text).toContain("second amendment");
  });

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
        name: "retry",
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
