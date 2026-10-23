import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as fs from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { jsonOf, z } from "../../tools/shared/src/zod.ts";

import { DoctorRecord } from "../../tools/shared/src/doctor-record.ts";

setDefaultTimeout(30_000);

const ENTRY = join(import.meta.dir, "../agx-doctor.ts");
const TICKET_CLI = join(import.meta.dir, "../../tools/agx-ticket/src/tkt.ts");
const scratch = mkdtempSync(join(tmpdir(), "agx-doctor-test-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const ticketText = (name: string) =>
  `+++\nschema = 2\nname = "${name}"\noutcome = "${name}"\nwrites = []\nverify = []\n\n[proposition]\nid = "${name}"\nclaim = "claim"\nrefuted_by = "refuted"\n+++\n\n# ${name}\n`;

async function run(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = Bun.spawn(args, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  // Validate the public JSONL shape before comparing the existing inventory oracle.
  const legacy = stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const record = jsonOf(DoctorRecord).safeParse(line);
      if (!record.success) return line; // --json snapshot and other CLI output
      return [
        record.data.tool,
        dirname(record.data.object),
        basename(record.data.object),
        record.data.finding,
        record.data.remedy,
      ].join("\t");
    })
    .join("\n");
  return { stdout: legacy === "" ? "" : legacy + "\n", stderr, exitCode };
}

async function jjOperations(
  repo: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const result = await run(
    [
      "jj",
      "op",
      "log",
      "--ignore-working-copy",
      "--no-graph",
      "-T",
      'self.id().short(12) ++ "\\n"',
    ],
    repo,
    env,
  );
  expect(result.exitCode, result.stderr).toBe(0);
  return result.stdout;
}

async function fixture(name: string) {
  const root = join(scratch, name);
  const home = join(root, "home");
  const workspace = join(home, "Workspace");
  const dotfiles = join(workspace, "dotfiles");
  const repo = join(workspace, "consumer");
  const tickets = join(root, "tickets");
  const bin = join(root, "bin");
  const state = join(root, "agx-state");
  const cache = join(root, "bun-cache");
  const ticketRecords = join(root, "ticket-records.json");
  for (const path of [dotfiles, repo, tickets, bin, state, cache])
    mkdirSync(path, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    // Each fixture owns its dispatch configuration, including state isolation.
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("AGX_")),
    ),
    HOME: home,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    JJ_CONFIG: "",
    JJ_USER: "Fixture",
    JJ_EMAIL: "fixture@example.test",
    AGX_REPOS_ROOT: workspace,
    XDG_STATE_HOME: join(home, "state"),
    AGX_STATE_DIR: state,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: cache,
    DOCTOR_TICKET_RECORDS: ticketRecords,
    DOCTOR_CALLS: join(root, "doctor-calls"),
  };
  for (const path of [dotfiles, repo]) {
    expect((await run(["jj", "git", "init", path], root, env)).exitCode).toBe(
      0,
    );
    writeFileSync(join(path, "base.txt"), "base\n");
    writeFileSync(
      join(path, ".ws.toml"),
      'trunk = "main"\nkeep = ["ws_kept"]\n',
    );
    writeFileSync(join(path, ".agx.toml"), 'tickets = "' + tickets + '"\n');
    expect(
      (await run(["jj", "file", "track", "base.txt"], path, env)).exitCode,
    ).toBe(0);
    expect(
      (await run(["jj", "commit", "-m", "base"], path, env)).exitCode,
    ).toBe(0);
    expect(
      (await run(["jj", "bookmark", "create", "main", "-r", "@-"], path, env))
        .exitCode,
    ).toBe(0);
  }
  for (const [binName, source] of [
    ["agx-worker", "agx-worker/src/next/cli.ts"],
    ["agx-ws", "agx-ws/src/ws.ts"],
    ["agx-ticket", "agx-ticket/src/tkt.ts"],
  ]) {
    await fs.symlink(
      join(import.meta.dir, "../../tools", source!),
      join(bin, binName!),
    );
  }
  const fakeAgx = join(bin, "agx");
  writeFileSync(
    fakeAgx,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "$DOCTOR_CALLS"\ncat "$DOCTOR_TICKET_RECORDS"\n`,
  );
  chmodSync(fakeAgx, 0o755);
  // Resolve suite commands through a fixture mise while retaining the owner oracles.
  const mise = join(bin, "mise");
  writeFileSync(
    mise,
    `#!${process.execPath}
const args = process.argv.slice(2);
if (JSON.stringify(args.slice(0, 4)) !== ${JSON.stringify(JSON.stringify(["-C", join(import.meta.dir, "../.."), "exec", "--"]))}) process.exit(2);
const child = Bun.spawn(args.slice(4), { stdin: "ignore", stdout: "inherit", stderr: "inherit" });
process.exitCode = await child.exited;
`,
  );
  chmodSync(mise, 0o755);
  writeFileSync(ticketRecords, "[]\n");
  return {
    root,
    home,
    dotfiles,
    workspace,
    repo,
    tickets,
    state,
    env,
    cache,
    ticketRecords,
  };
}

test("agx worker doctor clean fixture is silent on stdout and exits zero", async () => {
  const f = await fixture("clean");
  const before = await Promise.all([
    jjOperations(f.dotfiles, f.env),
    jjOperations(f.repo, f.env),
  ]);
  const result = await run([process.execPath, ENTRY], f.dotfiles, f.env);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("agx worker doctor: 0 finding(s)\n");
  // Ticket doctor reads global history once across both repositories.
  expect(
    (await Bun.file(f.env.DOCTOR_CALLS!).text())
      .trim()
      .split("\n")
      .filter((line) => line === "worker ls --json --all"),
  ).toEqual(["worker ls --json --all"]);
  expect(await Bun.file(join(f.state, "records.jsonl")).exists()).toBe(false);
  expect(
    await Promise.all([
      jjOperations(f.dotfiles, f.env),
      jjOperations(f.repo, f.env),
    ]),
  ).toEqual(before);
}, 30_000);

test("outside-home ignores 199 finished historical paths, but retains active, unjudged, and existing stray tickets", async () => {
  const f = await fixture("actionable-outside-home");
  const record = (id: string, extra: object = {}) => ({
    id,
    ticket: id,
    started_at: "2026-10-16T00:00:00Z",
    state: "ended",
    judgment: { decision: "accept" },
    cwd: f.repo,
    workspace: f.repo,
    ticket_path: join(f.root, id + ".md"),
    ...extra,
  });
  writeFileSync(
    f.ticketRecords,
    JSON.stringify([
      ...Array.from({ length: 199 }, (_, i) => record("historical-" + i)),
      record("active", { state: "running", judgment: null }),
      record("unjudged", { judgment: null }),
      record("other-home", {
        state: "running",
        judgment: null,
        ticket_path: join(f.dotfiles, ".agents/tickets/valid.md"),
      }),
    ]),
  );
  writeFileSync(join(f.repo, "still-present.md"), ticketText("still-present"));
  const result = await runTicketDoctor(f.dotfiles, f.env);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(result.stdout).not.toContain("historical-");
  expect(result.stdout).not.toContain("other-home");
  expect(
    result.stdout
      .trim()
      .split("\n")
      .map((line) => line.split("\t")[2])
      .toSorted((a, b) => (a ?? "").localeCompare(b ?? "")),
  ).toEqual(["active", "still-present", "unjudged"]);
}, 15_000);
async function runTicketDoctor(cwd: string, env: NodeJS.ProcessEnv) {
  return run([process.execPath, TICKET_CLI, "doctor"], cwd, env);
}

test("outside-home scanning ignores symlink files and symlink directories", async () => {
  const f = await fixture("scan-symlinks");
  const external = join(f.root, "external");
  await fs.mkdir(external);
  await fs.writeFile(join(external, "hidden.md"), ticketText("hidden"));
  await fs.symlink(external, join(f.repo, "external"));
  await fs.symlink(join(external, "hidden.md"), join(f.repo, "alias.md"));
  const result = await runTicketDoctor(f.dotfiles, f.env);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toBe("");
});

test("header scan retains hidden, ignored, CRLF and spaced paths, but excludes dependency trees", async () => {
  const f = await fixture("scan-headers");
  await fs.mkdir(join(f.repo, ".hidden"));
  await fs.mkdir(join(f.repo, "node_modules"));
  await fs.mkdir(join(f.repo, ".ws"));
  await fs.writeFile(join(f.repo, ".gitignore"), "*.md\n");
  await fs.writeFile(
    join(f.repo, ".hidden/crlf.md"),
    ticketText("crlf").replaceAll("\n", "\r\n"),
  );
  await fs.writeFile(join(f.repo, "with space.md"), ticketText("with-space"));
  await fs.writeFile(
    join(f.repo, "node_modules/excluded.md"),
    ticketText("excluded"),
  );
  await fs.writeFile(join(f.repo, ".ws/excluded.md"), ticketText("excluded"));
  await fs.writeFile(
    join(f.repo, "documentation.md"),
    "# Documentation\n" + ticketText("not-a-ticket"),
  );
  const result = await runTicketDoctor(f.dotfiles, f.env);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(
    result.stdout
      .trim()
      .split("\n")
      .map((line) => line.split("\t")[2])
      .toSorted((a, b) => (a ?? "").localeCompare(b ?? "")),
  ).toEqual(["crlf", "with space"]);
});

test("invalid run history remains a failure and cannot publish a complete snapshot", async () => {
  const f = await fixture("history-failure");
  await fs.writeFile(f.ticketRecords, "invalid history");
  const result = await run(
    [process.execPath, ENTRY, "--json"],
    f.dotfiles,
    f.env,
  );
  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain("invalid agx worker ls --json");
  expect(result.stdout).toContain('"complete":false');
  expect(await Bun.file(join(f.state, "doctor.json")).text()).toContain(
    '"complete":false',
  );
});

const doctorOwners = [
  ["agx-worker", "agx-worker/src/next/cli.ts"],
  ["agx-ws", "agx-ws/src/ws.ts"],
  ["agx-ticket", "agx-ticket/src/tkt.ts"],
] as const;

for (const [tool, source] of doctorOwners) {
  const entry = join(import.meta.dir, "../../tools", source);
  test(`${tool} doctor --quiet suppresses only the summary and is documented`, async () => {
    const f = await fixture(`quiet-${tool}`);
    const normal = await run(
      [process.execPath, entry, "doctor"],
      f.dotfiles,
      f.env,
    );
    const quiet = await run(
      [process.execPath, entry, "doctor", "--quiet"],
      f.dotfiles,
      f.env,
    );
    expect(normal.exitCode, normal.stderr).toBe(0);
    expect(normal.stderr).toContain("0 finding(s)");
    expect(quiet.exitCode, quiet.stderr).toBe(normal.exitCode);
    expect(quiet.stdout).toBe(normal.stdout);
    expect(quiet.stderr).toBe("");
    const help = await run(
      [process.execPath, entry, "doctor", "--help"],
      f.dotfiles,
      f.env,
    );
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("--quiet");
  });

  test.each(["1", "0", ""])(
    `${tool} doctor rejects retired quiet environment value %j`,
    async (value) => {
      const result = await run(
        [process.execPath, entry, "doctor", "--quiet"],
        scratch,
        {
          ...process.env,
          AGX_DOCTOR_QUIET: value,
        },
      );
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim().split("\n")).toHaveLength(1);
      expect(result.stderr).toContain("AGX_DOCTOR_QUIET");
      expect(result.stderr).toContain("--quiet");
    },
  );
}

test("composed doctor rejects the retired environment variable with one diagnostic", async () => {
  const result = await run([process.execPath, ENTRY], scratch, {
    ...process.env,
    AGX_DOCTOR_QUIET: "1",
  });
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim().split("\n")).toHaveLength(1);
  expect(result.stderr).toContain("--quiet");
});

test.each(["pass", "findings", "failure", "missing"])(
  "mise routing: %s preserves aggregation and the snapshot without suite bins on PATH",
  async (mode) => {
    const root = join(scratch, `mise-${mode}`);
    const bin = join(root, "bin");
    const state = join(root, "state");
    const calls = join(root, "calls");
    await fs.mkdir(bin, { recursive: true });
    const finding = JSON.stringify({
      tool: "agx-ws",
      object: "/fixture/workspace",
      finding: "stale",
      remedy: "agx ws refresh stale",
    });
    if (mode !== "missing") {
      const mise = join(bin, "mise");
      await fs.writeFile(
        mise,
        `#!${process.execPath}
import { appendFile } from "node:fs/promises";
const args = process.argv.slice(2);
await appendFile(${JSON.stringify(calls)}, JSON.stringify(args) + "\\n");
if (args[4] === "agx-ws") {
  if (${JSON.stringify(mode)} === "findings") {
    process.stdout.write(${JSON.stringify(finding + "\n")});
    process.exit(1);
  }
  if (${JSON.stringify(mode)} === "failure") {
    process.stderr.write("fixture doctor failed\\n");
    process.exit(2);
  }
}
`,
      );
      await fs.chmod(mise, 0o755);
    }
    const result = await run([process.execPath, ENTRY, "--json"], root, {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("AGX_")),
      ),
      PATH: bin,
      AGX_STATE_DIR: state,
    });
    const expectedExit = { pass: 0, findings: 1, failure: 2, missing: 2 };
    expect(result.exitCode, result.stderr).toBe(expectedExit[mode]);
    const decoded = jsonOf(
      z.object({
        complete: z.boolean(),
        total: z.number(),
        findings: z.array(z.string()),
        kinds: z.record(z.string(), z.number()),
      }),
    ).safeParse(result.stdout);
    expect(decoded.success).toBe(true);
    if (!decoded.success) return;
    const snapshot = decoded.data;
    expect(snapshot.complete).toBe(mode === "pass" || mode === "findings");
    expect(snapshot.total).toBe(mode === "findings" ? 1 : 0);
    expect(snapshot.findings).toEqual(mode === "findings" ? [finding] : []);
    expect(snapshot.kinds).toEqual(mode === "findings" ? { stale: 1 } : {});
    expect(await Bun.file(join(state, "doctor.json")).text()).toBe(
      result.stdout.trim(),
    );
    if (mode === "missing") {
      expect(result.stderr).toContain("mise");
      expect(result.stderr).toContain("incomplete doctor output");
    } else {
      const actual = (await Bun.file(calls).text())
        .trim()
        .split("\n")
        .toSorted();
      expect(actual).toEqual(
        ["agx-worker", "agx-ws", "agx-ticket"]
          .map((target) =>
            JSON.stringify([
              "-C",
              join(import.meta.dir, "../.."),
              "exec",
              "--",
              target,
              "doctor",
              "--quiet",
            ]),
          )
          .toSorted(),
      );
      if (mode === "failure")
        expect(result.stderr).toContain("fixture doctor failed");
    }
  },
);

test.each(["-V", "--version"])(
  "composed doctor owns its version via %s",
  async (flag) => {
    const result = await run([process.execPath, ENTRY, flag], scratch, {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("AGX_")),
      ),
      PATH: scratch,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe("agx-doctor 1.0.0\n");
  },
);
