import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DispatchBindingSchema } from "../../shared/src/agx-dispatch-binding.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";

const ENTRY = fileURLToPath(new URL("../src/next/cli.ts", import.meta.url));
const RunRecord = z.looseObject({
  id: z.string(),
  ticket: z.string(),
  cwd: z.string(),
  workspace: z.string(),
  unit: z.string(),
});
const ROSTER_MODULE = fileURLToPath(
  new URL("../../../agents/models/roster.ts", import.meta.url),
);
const RosterObservation = jsonOf(
  z.object({
    path: z.string().nullable(),
    selected: z.string(),
    claude: z.string(),
    codex: z.string(),
  }),
);
async function observation(path: string) {
  const parsed = RosterObservation.safeParse(await Bun.file(path).text());
  expect(parsed.success).toBe(true);
  return parsed.data;
}
const roots: string[] = [];
function inheritedEnv() {
  const env = { ...process.env };
  Reflect.deleteProperty(env, "AGX_NEXT_STATE_DIR");
  return env;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "agx-dispatch-"));
  roots.push(root);
  const repo = join(root, "repo");
  const tickets = join(repo, ".agents", "tickets");
  const bin = join(root, "bin");
  mkdirSync(tickets, { recursive: true });
  mkdirSync(join(repo, ".jj"));
  mkdirSync(bin);
  const ticket = join(tickets, "foo-bar.md");
  writeFileSync(
    ticket,
    `+++\nschema = 2\nname = "foo-bar"\noutcome = "fixture"\n[proposition]\nid = "P1"\nclaim = "fixture"\nrefuted_by = "fixture"\n+++\n`,
  );
  const records = join(root, "records.json");
  const unitArgs = join(root, "unit-args.txt");
  const bindingFile = join(root, "binding.json");
  const wsArgs = join(root, "ws-args.txt");
  const home = join(root, "home");
  mkdirSync(home);
  const rosterCheck = join(root, "roster-check.ts");
  writeFileSync(
    rosterCheck,
    [
      `import { loadRoster } from ${JSON.stringify(ROSTER_MODULE)};`,
      "const loaded = await loadRoster(process.env.DISPATCH_ROSTER_PATH);",
      'if (!loaded.ok) { console.error("cannot read dispatch roster"); process.exit(2); }',
      "console.log(JSON.stringify({ path: process.env.DISPATCH_ROSTER_PATH ?? null, selected: loaded.value.default, claude: process.env.CLAUDE_CODE_SESSION_ID, codex: process.env.CODEX_SESSION_ID }));",
    ].join("\n"),
  );
  const systemdRunner = join(root, "fake-systemd-run.ts");
  writeFileSync(records, "[]\n");
  writeFileSync(
    systemdRunner,
    [
      'import { writeFileSync } from "node:fs";',
      "const args = Bun.argv.slice(2);",
      'writeFileSync(process.env.FAKE_UNIT_ARGS!, args.join("\\n") + "\\n");',
      'if (process.env.FAKE_START_FAIL === "yes") {',
      '  process.stderr.write("fixture unit failure\\n");',
      "  process.exit(1);",
      "}",
      'if (process.env.FAKE_NO_RECORD === "yes") process.exit(0);',
      'const divider = args.indexOf("--");',
      "const command = args.slice(divider + 1);",
      'const bindingIndex = command.indexOf("--dispatch-binding");',
      "const bindingText = command[bindingIndex + 1];",
      "writeFileSync(process.env.FAKE_BINDING!, bindingText!);",
      "const binding = JSON.parse(bindingText!);",
      'if (process.env.FAKE_ROSTER_CHECK === "yes") {',
      "  const env: Record<string, string> = { HOME: process.env.HOME!, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME!, XDG_STATE_HOME: process.env.XDG_STATE_HOME! };",
      "  for (let i = 0; i < divider; i++) {",
      '    if (args[i] !== "-E") continue;',
      "    const entry = args[++i]!;",
      '    const equal = entry.indexOf("=");',
      "    if (equal >= 0) env[entry.slice(0, equal)] = entry.slice(equal + 1);",
      "    else if (process.env[entry] !== undefined) env[entry] = process.env[entry]!;",
      "  }",
      '  if (process.env.FAKE_STALE_ROSTER === "yes") await Bun.write(process.env.DISPATCH_ROSTER_PATH!, "invalid TOML [");',
      '  const child = Bun.spawn([process.execPath, process.env.FAKE_ROSTER_SCRIPT!], { cwd: process.env.HOME!, env, stdout: "pipe", stderr: "pipe", timeout: 5000 });',
      "  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);",
      "  if (code !== 0) { process.stderr.write(err); process.exit(code); }",
      "  writeFileSync(process.env.FAKE_CHILD_ROSTER!, out);",
      "}",
      'const cdIndex = command.indexOf("--cd");',
      "const workspace = command[cdIndex + 1];",
      'const record = JSON.stringify([{ ...binding, state: "running", cwd: workspace }]) + "\\n";',
      'if (process.env.FAKE_LATE_RECORD === "yes") writeFileSync(process.env.FAKE_PENDING_RECORD!, record);',
      "else writeFileSync(process.env.FAKE_RECORDS!, record);",
    ].join("\n"),
  );
  const shim = (name: string, body: string[]) => {
    const path = join(bin, name);
    writeFileSync(path, `#!/bin/sh\n${body.join("\n")}\n`);
    chmodSync(path, 0o755);
  };
  shim("agx-ws", [
    `printf '%s\\n' "$@" > "$FAKE_WS_ARGS"`,
    'if [ "$FAKE_WS_FAIL" = "yes" ]; then echo "ws: /home/fuyu is not a valid local jj workspace" >&2; exit 1; fi',
    'slug="$2"',
    "shift 2",
    "json=no",
    'while [ "$#" -gt 0 ]; do',
    '  if [ "$1" = "--json" ]; then json=yes; fi',
    '  if [ "$1" = "--repo" ]; then repo="$2"; shift 2; else shift; fi',
    "done",
    'if [ "$repo" != "$FAKE_REPO" ]; then echo "ws: /home/fuyu is not a valid local jj workspace" >&2; exit 1; fi',
    'workspace="$(dirname "$repo")/$(basename "$repo").ws/ws_$slug"',
    'mkdir -p "$workspace/.jj"',
    'if [ "$FAKE_WS_CHATTER" = "yes" ]; then',
    '  chatter="30 packages installed …\n/home/fuyu/dotfiles.ws/ws_fleet-line-real\'"',
    '  if [ "$json" = "yes" ]; then printf "%s\\n" "$chatter" >&2; else printf "%s\\n" "$chatter"; exit 0; fi',
    "fi",
    'if [ "$FAKE_WS_INVALID" = "yes" ]; then echo "invalid workspace response"; exit 0; fi',
    'if [ "$json" = "yes" ]; then printf \'{"workspace":"%s"}\\n\' "$workspace"; else printf \'%s\\n\' "$workspace"; fi',
  ]);
  shim("jj", [
    'case " $* " in *" workspace list "*) printf "%s\\n" "default" "recorded"; exit 0 ;; esac',
    'case " $* " in *"--name recorded"*) printf "%s\\n" "${FAKE_REGISTERED_WORKSPACE:-$FAKE_REPO}"; exit 0 ;; esac',
    'case " $* " in *" log "*) printf "%s\\n" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; exit 0 ;; esac',
    'case "$PWD" in',
    '  "$FAKE_REPO".ws/*) printf \'%s\\n\' "${FAKE_WORKSPACE_REPO:-$FAKE_REPO}" ;;',
    "  *) printf '%s\\n' \"$FAKE_REPO\" ;;",
    "esac",
  ]);
  shim("systemctl", [
    'if [ "$FAKE_ACTIVE" = "yes" ]; then exit 0; fi',
    "exit 3",
  ]);
  shim("systemd-run", ['exec bun "$FAKE_SYSTEMD_RUN_SCRIPT" "$@"']);
  shim("agx-worker", [
    'if [ "$1" = "ls" ]; then',
    '  if [ "$FAKE_LATE_RECORD" = "yes" ]; then',
    '    if [ ! -e "$FAKE_LS_MARKER" ]; then touch "$FAKE_LS_MARKER"',
    '    elif [ -s "$FAKE_PENDING_RECORD" ]; then cp "$FAKE_PENDING_RECORD" "$FAKE_RECORDS"; : > "$FAKE_PENDING_RECORD"; fi',
    "  fi",
    '  cat "$FAKE_RECORDS"; exit 0',
    "fi",
    'if [ "$1" = "check" ] && [ "$FAKE_ROSTER_CHECK" = "yes" ]; then exec bun "$FAKE_ROSTER_SCRIPT" > "$FAKE_PREFLIGHT_ROSTER"; fi',
    'if [ "$1" = "check" ]; then if [ "$FAKE_CHECK_FAIL" = "yes" ]; then printf "agx: invalid writes; repair: use relative globs\\nagx: untrusted mise.toml; repair: mise trust\\n" >&2; exit 2; fi; exit 0; fi',
    'echo "unexpected fake agx command: $*" >&2',
    "exit 2",
  ]);
  const env: NodeJS.ProcessEnv = {
    ...inheritedEnv(),
    PATH: `${bin}:${process.env.PATH}`,
    HOME: home,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_STATE_HOME: join(home, "state"),
    AGX_STATE_DIR: join(home, "state", "agx"),
    DISPATCH_ROSTER_PATH: undefined,
    CLAUDE_CODE_SESSION_ID: "fixture-claude",
    CODEX_SESSION_ID: "fixture-codex",
    FAKE_ROSTER_SCRIPT: rosterCheck,
    FAKE_CHILD_ROSTER: join(root, "child-roster.json"),
    FAKE_PREFLIGHT_ROSTER: join(root, "preflight-roster.json"),
    FAKE_REPO: repo,
    FAKE_RECORDS: records,
    FAKE_PENDING_RECORD: join(root, "pending-record.json"),
    FAKE_LS_MARKER: join(root, "ls-marker"),
    FAKE_UNIT_ARGS: unitArgs,
    FAKE_BINDING: bindingFile,
    FAKE_WS_ARGS: wsArgs,
    FAKE_SYSTEMD_RUN_SCRIPT: systemdRunner,
    AGX_DISPATCH_WAIT_MS: "10",
  };
  return {
    root,
    repo,
    ticket,
    records,
    unitArgs,
    bindingFile,
    wsArgs,
    env,
  };
}

async function invoke(f: ReturnType<typeof fixture>, ...args: string[]) {
  const child = Bun.spawn(
    [process.execPath, ENTRY, "dispatch", f.ticket, ...args],
    {
      cwd: f.env.FAKE_CALLER_CWD ?? f.repo,
      env: f.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: Number(f.env.FAKE_INVOKE_TIMEOUT_MS ?? 5000),
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

function priorRun(
  f: ReturnType<typeof fixture>,
  workspace: string,
  fallback = false,
) {
  mkdirSync(join(workspace, ".jj"), { recursive: true });
  writeFileSync(
    f.records,
    JSON.stringify([
      {
        id: "prior-run",
        ticket: "foo-bar",
        state: "ended",
        cwd: workspace,
        ...(fallback ? {} : { workspace }),
      },
    ]),
  );
  f.env.FAKE_REGISTERED_WORKSPACE = workspace;
  return workspace;
}

test.each(["foo-bar", "foo-bar-2", "another-ticket"])(
  "continuation keeps recorded workspace %s without creating one",
  async (slug) => {
    const f = fixture();
    const workspace = priorRun(f, join(`${f.repo}.ws`, `ws_${slug}`));
    const result = await invoke(f, "--continue", "prior-run");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(await Bun.file(f.unitArgs).text()).toContain(`--cd\n${workspace}\n`);
    expect(await Bun.file(f.unitArgs).text()).toContain(
      "--continue\nprior-run\n",
    );
    expect(await Bun.file(f.wsArgs).exists()).toBe(false);
  },
);

test.each([undefined, ""])(
  "continuation of a run --cd falls back to recorded cwd (%s)",
  async (recordedWorkspace) => {
    const f = fixture();
    const workspace = priorRun(f, join(`${f.repo}.ws`, "ws_other"), true);
    writeFileSync(
      f.records,
      JSON.stringify([
        {
          id: "prior-run",
          ticket: "foo-bar",
          state: "ended",
          cwd: workspace,
          workspace: recordedWorkspace,
        },
      ]),
    );
    const result = await invoke(f, "--continue", "prior-run");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(await Bun.file(f.unitArgs).text()).toContain(`--cd\n${workspace}\n`);
    expect(await Bun.file(f.wsArgs).exists()).toBe(false);
  },
);

test("recorded workspace takes precedence over a different cwd", async () => {
  const f = fixture();
  const workspace = priorRun(f, join(`${f.repo}.ws`, "ws_other"));
  writeFileSync(
    f.records,
    JSON.stringify([
      {
        id: "prior-run",
        ticket: "foo-bar",
        state: "ended",
        cwd: f.repo,
        workspace,
      },
    ]),
  );
  const result = await invoke(f, "--continue", "prior-run");
  expect(result.exitCode, result.stderr).toBe(0);
  expect(await Bun.file(f.unitArgs).text()).toContain(`--cd\n${workspace}\n`);
  expect(await Bun.file(f.wsArgs).exists()).toBe(false);
});

test("continuation accepts --ws only when it names the recorded workspace", async () => {
  const f = fixture();
  const workspace = priorRun(f, join(`${f.repo}.ws`, "ws_other"));
  const result = await invoke(f, "--continue", "prior-run", "--ws", "other");
  expect(result.exitCode, result.stderr).toBe(0);
  expect(await Bun.file(f.unitArgs).text()).toContain(`--cd\n${workspace}\n`);
  expect(await Bun.file(f.wsArgs).exists()).toBe(false);
});

test.each(["conflict", "missing", "unregistered", "foreign", "file"])(
  "continuation refuses %s recorded workspace without starting or creating",
  async (kind) => {
    const f = fixture();
    const workspace = priorRun(f, join(`${f.repo}.ws`, "ws_other"));
    if (kind === "missing") rmSync(workspace, { recursive: true });
    if (kind === "unregistered" || kind === "foreign")
      f.env.FAKE_REGISTERED_WORKSPACE = f.repo;
    if (kind === "foreign") f.env.FAKE_WORKSPACE_REPO = join(f.root, "foreign");
    if (kind === "file") {
      rmSync(workspace, { recursive: true });
      writeFileSync(workspace, "not a directory");
    }
    const result = await invoke(
      f,
      "--continue",
      "prior-run",
      ...(kind === "conflict" ? ["--ws", "foo-bar"] : []),
    );
    expect(result.exitCode, result.stderr).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain(workspace);
    expect(result.stderr).toContain("repair:");
    expect(result.stderr).toContain(
      kind === "conflict" ? "different workspace" : "agx ws add",
    );
    expect(await Bun.file(f.wsArgs).exists()).toBe(false);
    expect(await Bun.file(f.unitArgs).exists()).toBe(false);
  },
);

test("dispatch records its one ticket-derived binding", async () => {
  const f = fixture();
  const result = await invoke(f);
  const workspace = join(`${f.repo}.ws`, "ws_foo-bar");
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  const recordResult = jsonOf(z.array(RunRecord)).safeParse(
    await Bun.file(f.records).text(),
  );
  const bindingResult = jsonOf(DispatchBindingSchema).safeParse(
    await Bun.file(f.bindingFile).text(),
  );
  expect(recordResult.success).toBe(true);
  expect(bindingResult.success).toBe(true);
  if (!recordResult.success || !bindingResult.success) return;
  const [record] = recordResult.data;
  expect(result.stdout).toBe(`${bindingResult.data.id}\n`);
  expect(bindingResult.data).toMatchObject({
    ticket: "foo-bar",
    workspace,
    unit: "agt_foo-bar",
  });
  expect(record).toMatchObject({ ...bindingResult.data, cwd: workspace });
  const args = await Bun.file(f.unitArgs).text();
  expect(args).toContain("--unit=agt_foo-bar\n");
  expect(args).toContain(`${f.ticket}\n--cd\n${workspace}\n`);
  expect(args).toContain("KillMode=mixed\n-p\nTimeoutStopSec=60\n");
  expect(await Bun.file(f.wsArgs).text()).toContain("--reuse");
});

test("workspace and unit overrides are honored even when they differ from the ticket", async () => {
  const f = fixture();
  const result = await invoke(f, "--ws", "other", "--unit", "agt_other-2");
  const workspace = join(`${f.repo}.ws`, "ws_other");
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  const parsed = jsonOf(z.array(RunRecord)).safeParse(
    await Bun.file(f.records).text(),
  );
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  expect(parsed.data[0]).toMatchObject({
    id: result.stdout.trim(),
    ticket: "foo-bar",
    workspace,
    cwd: workspace,
    unit: "agt_other-2",
  });
  expect(await Bun.file(f.unitArgs).text()).toContain("--unit=agt_other-2\n");
  expect(await Bun.file(f.wsArgs).text()).toContain("other\n");
});

test("dispatch refuses an already-active overridden unit by its name", async () => {
  const f = fixture();
  f.env.FAKE_ACTIVE = "yes";
  const result = await invoke(f, "--unit", "agt_other-2");
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("agt_other-2.service is already running");
});

test("dispatch reports the cause when a unit does not start", async () => {
  const f = fixture();
  f.env.FAKE_START_FAIL = "yes";
  const result = await invoke(f);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("agt_foo-bar.service did not start");
  expect(result.stderr).toContain("fixture unit failure");
});

test("dispatch refuses success when no run record appears", async () => {
  const f = fixture();
  f.env.FAKE_NO_RECORD = "yes";
  const result = await invoke(f);
  expect(result.exitCode).not.toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("agt_foo-bar.service");
  expect(result.stderr).toContain(
    "no matching run record appeared within 10ms",
  );
});

test("dispatch finds a run record that appears after the first read", async () => {
  const f = fixture();
  f.env.FAKE_LATE_RECORD = "yes";
  f.env.AGX_DISPATCH_WAIT_MS = "1000";
  const result = await invoke(f);
  expect(result.exitCode, result.stderr).toBe(0);
  const parsedBinding = jsonOf(DispatchBindingSchema).safeParse(
    await Bun.file(f.bindingFile).text(),
  );
  expect(parsedBinding.success).toBe(true);
  if (!parsedBinding.success) return;
  expect(result.stdout).toBe(`${parsedBinding.data.id}\n`);
  expect(result.stderr).toBe("");
});

test("dispatch refuses a ticket and workspace from different repositories", async () => {
  const f = fixture();
  const otherRepo = join(f.root, "other-repo");
  f.env.FAKE_WORKSPACE_REPO = otherRepo;
  const result = await invoke(f);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain(`ticket repository ${f.repo}`);
  expect(result.stderr).toContain(`workspace repository ${otherRepo}`);
  expect(result.stdout).toBe("");
});

test("dispatch resolves the ticket repository from an unrelated caller cwd", async () => {
  const f = fixture();
  f.env.FAKE_CALLER_CWD = f.root;
  const result = await invoke(f);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout.trim()).not.toBe("");
  expect(await Bun.file(f.wsArgs).text()).toContain(`--repo\n${f.repo}\n`);
  expect(await Bun.file(f.records).text()).toContain(result.stdout.trim());
});

test("dispatch uses machine output when readiness prints the reported install chatter and stray quote", async () => {
  const f = fixture();
  f.env.FAKE_WS_CHATTER = "yes";
  const result = await invoke(f);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout.trim()).not.toBe("");
  expect(await Bun.file(f.wsArgs).text()).toContain("--json\n");
  expect(await Bun.file(f.records).text()).toContain(result.stdout.trim());
  expect(await Bun.file(f.unitArgs).text()).toContain(
    `${f.repo}.ws/ws_foo-bar\n`,
  );
});

test.each([
  [
    "FAKE_WS_FAIL",
    "agx ws add failed: ws: /home/fuyu is not a valid local jj workspace",
  ],
  ["FAKE_WS_INVALID", "agx ws add returned an invalid workspace"],
])(
  "dispatch names the cause and fails without starting a unit: %s",
  async (flag, cause) => {
    const f = fixture();
    f.env[flag] = "yes";
    const result = await invoke(f);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(cause);
    expect(result.stdout).toBe("");
    expect(await Bun.file(f.unitArgs).exists()).toBe(false);
    expect(await Bun.file(f.records).text()).toBe("[]\n");
  },
);

test("dispatch reports service and all check failures before starting a unit", async () => {
  const f = fixture();
  f.env.FAKE_ACTIVE = "yes";
  f.env.FAKE_CHECK_FAIL = "yes";
  const result = await invoke(f);
  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain("already running");
  expect(result.stderr).toContain("invalid writes; repair:");
  expect(result.stderr).toContain("untrusted mise.toml; repair:");
  expect(await Bun.file(f.unitArgs).exists()).toBe(false);
});

function explicitRoster(f: ReturnType<typeof fixture>) {
  const path = join(f.repo, "explicit roster.toml");
  writeFileSync(
    path,
    `schema = 1
as_of = "2026-10-22"
default = "fixture-high"
[auto]
max_task_chars = 2400
timeout_ms = 100
no_egress = []
pick_temperature = 0
[auto.jev]
api = "reseller"
url = "http://127.0.0.1:1"
[claude_run]
max_budget_usd = 1
max_turns = 1
reason = "isolated dispatch fixture only"
[sources]
[[choice]]
id = "fixture-high"
route = "codex"
model = "fixture"
effort = "high"
use_for = "fixture"
`,
  );
  f.env.FAKE_ROSTER_CHECK = "yes";
  f.env.DISPATCH_ROSTER_PATH = path;
  return path;
}

test.each([false, true])(
  "explicit roster reaches the bound child with naming overrides (relative=%s)",
  async (relative) => {
    const f = fixture();
    const path = explicitRoster(f);
    if (relative) f.env.DISPATCH_ROSTER_PATH = "explicit roster.toml";
    const result = await invoke(f, "--ws", "roster", "--unit", "agt_roster");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(await observation(f.env.FAKE_CHILD_ROSTER!)).toEqual({
      path,
      selected: "fixture-high",
      claude: "fixture-claude",
      codex: "fixture-codex",
    });
    expect(await observation(f.env.FAKE_PREFLIGHT_ROSTER!)).toEqual(
      await observation(f.env.FAKE_CHILD_ROSTER!),
    );
    const parsedBinding = jsonOf(DispatchBindingSchema).safeParse(
      await Bun.file(f.bindingFile).text(),
    );
    expect(parsedBinding.success).toBe(true);
    if (!parsedBinding.success) return;
    const binding = parsedBinding.data;
    expect(binding).toMatchObject({
      id: result.stdout.trim(),
      workspace: join(f.repo + ".ws", "ws_roster"),
      unit: "agt_roster",
      ticket: "foo-bar",
    });
    expect(
      jsonOf(z.array(RunRecord)).safeParse(await Bun.file(f.records).text())
        .data,
    ).toEqual([{ ...binding, state: "running", cwd: binding.workspace }]);
  },
);

test("absent roster override keeps the normal loader default", async () => {
  const f = fixture();
  f.env.FAKE_ROSTER_CHECK = "yes";
  const result = await invoke(f);
  expect(result.exitCode, result.stderr).toBe(0);
  const { loadRoster } = await import("../../../agents/models/roster.ts");
  const normal = await loadRoster();
  expect(normal.ok).toBe(true);
  if (normal.ok)
    expect(await observation(f.env.FAKE_CHILD_ROSTER!)).toMatchObject({
      path: null,
      selected: normal.value.default,
    });
  expect(await Bun.file(f.unitArgs).text()).not.toContain(
    "DISPATCH_ROSTER_PATH",
  );
});

test.each(["malformed", "unavailable", "empty", "stale"])(
  "explicit %s roster cannot become default success",
  async (kind) => {
    const f = fixture();
    const path = explicitRoster(f);
    if (kind === "malformed") writeFileSync(path, "invalid TOML [");
    if (kind === "unavailable")
      f.env.DISPATCH_ROSTER_PATH = join(f.root, "missing.toml");
    if (kind === "empty") f.env.DISPATCH_ROSTER_PATH = "";
    if (kind === "stale") f.env.FAKE_STALE_ROSTER = "yes";
    const result = await invoke(f, "--ws", "roster", "--unit", "agt_roster");
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("cannot read dispatch roster");
    expect(await Bun.file(f.records).text()).toBe("[]\n");
    if (kind !== "stale")
      expect(await Bun.file(f.unitArgs).exists()).toBe(false);
  },
);

test("preflight refusal identifies the checked tree, revision and child exit", async () => {
  const f = fixture();
  priorRun(f, join(`${f.repo}.ws`, "ws_foo-bar"));
  f.env.FAKE_CHECK_FAIL = "yes";
  const result = await invoke(
    f,
    "--continue",
    "prior-run",
    "--sandbox",
    "none",
  );
  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain(`--cd ${f.repo}.ws/ws_foo-bar`);
  expect(result.stderr).toContain("@/base_rev=");
  expect(result.stderr).toContain("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  expect(result.stderr).toContain("check exit=2");
  expect(result.stderr).toContain("invalid writes");
});

test("a silent preflight refusal still identifies its child exit and tree", async () => {
  const f = fixture();
  writeFileSync(join(f.root, "bin/agx-worker"), "#!/bin/sh\nexit 7\n");
  const result = await invoke(f);
  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain("check exit=7");
  expect(result.stderr).toContain("no stderr");
  expect(result.stderr).toContain(`--cd ${f.repo}.ws/ws_foo-bar`);
});

test("preflight can finish beyond the former 30000ms subprocess deadline", async () => {
  const f = fixture();
  writeFileSync(
    join(f.root, "bin/agx-worker"),
    `#!/usr/bin/env bun
if (Bun.argv[2] === "check") {
  await Bun.sleep(30_100);
  console.error("fixture slow check refusal");
  process.exit(2);
}
process.exit(1);
`,
  );
  const child = Bun.spawn([process.execPath, ENTRY, "dispatch", f.ticket], {
    cwd: f.repo,
    env: f.env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 40_000,
  });
  const [code, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  expect(code).toBe(2);
  expect(stderr).toContain("fixture slow check refusal");
  expect(stderr).toContain("check exit=2");
  expect(await Bun.file(f.unitArgs).exists()).toBe(false);
}, 45_000);

test.each([
  ["foo-bar", false],
  ["foo-bar-2", false],
  ["another-ticket", false],
  ["foo-bar-2", true],
] as const)(
  "real jj continued workspace %s agrees with check (missing premise=%s)",
  async (workspaceName, missingPremise) => {
    const f = fixture();
    f.env.AGX_DISPATCH_WAIT_MS = "1000";
    f.env.FAKE_INVOKE_TIMEOUT_MS = "45000";
    const jj = Bun.which("jj");
    expect(jj).not.toBeNull();
    if (jj === null) return;
    rmSync(join(f.repo, ".jj"), { recursive: true });
    f.env.JJ_CONFIG = "";
    f.env.JJ_USER = "Fixture";
    f.env.JJ_EMAIL = "fixture@example.invalid";
    f.env.DISPATCH_ROSTER_PATH = fileURLToPath(
      new URL("../../../agents/models/dispatch-roster.toml", import.meta.url),
    );
    const jjCommand = async (...args: string[]) => {
      const child = Bun.spawn([jj, ...args], {
        cwd: f.repo,
        env: f.env,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, out, err] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(code, err).toBe(0);
      return out.trim();
    };
    await jjCommand("git", "init", ".");
    await jjCommand(
      "config",
      "set",
      "--repo",
      'revset-aliases."trunk()"',
      "bookmarks(main)",
    );
    writeFileSync(
      join(f.repo, "agx.toml"),
      'schema = 1\ntickets = ".agents/tickets"\n',
    );
    writeFileSync(join(f.repo, "main-only"), "present only in main checkout\n");
    await jjCommand("new", "-m", "Fixture policy");
    await jjCommand("bookmark", "create", "main", "-r", "@-");
    const workspace = join(`${f.repo}.ws`, `ws_${workspaceName}`);
    mkdirSync(`${f.repo}.ws`, { recursive: true });
    await jjCommand(
      "workspace",
      "add",
      "--name",
      workspaceName,
      "-r",
      "root()",
      workspace,
    );
    writeFileSync(join(f.root, "bin/jj"), `#!/bin/sh\nexec '${jj}' "$@"\n`);
    writeFileSync(
      f.ticket,
      `+++\nschema = 2\nname = "foo-bar"\noutcome = "fixture"\npremises = ${missingPremise ? '["file:main-only"]' : "[]"}\n[proposition]\nid = "P1"\nclaim = "fixture"\nrefuted_by = "fixture"\n+++\n`,
    );
    const state = f.env.AGX_STATE_DIR!;
    mkdirSync(state, { recursive: true });
    writeFileSync(
      join(state, "records.jsonl"),
      [
        {
          kind: "started",
          id: "prior-run",
          at: "2026-10-14T01:00:00Z",
          ticket: "foo-bar",
          ticket_path: f.ticket,
          writes: [],
          cwd: workspace,
          workspace,
          row: "terra-high",
          dispatcher_session: null,
          vendor_session: null,
          pid: 0,
        },
        {
          kind: "ended",
          id: "prior-run",
          at: "2026-10-14T01:10:00Z",
          exit: 0,
          report_path: null,
          vendor_session: "fixture-session",
          verify: [],
        },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
    writeFileSync(
      f.records,
      JSON.stringify([
        {
          id: "prior-run",
          ticket: "foo-bar",
          state: "ended",
          cwd: workspace,
          workspace,
        },
      ]),
    );
    const checkArgs = [
      "check",
      f.ticket,
      "--cd",
      workspace,
      "--sandbox",
      "none",
      "--continue",
      "prior-run",
    ];
    const checked = async (args: string[]) => {
      const child = Bun.spawn([process.execPath, ENTRY, ...args], {
        cwd: f.repo,
        env: f.env,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, out, err] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { code, out, err };
    };
    const main = await checked([
      "check",
      f.ticket,
      "--cd",
      f.repo,
      "--sandbox",
      "none",
      "--continue",
      "prior-run",
    ]);
    expect(main.code, main.err).toBe(0);
    const direct = await checked(checkArgs);
    expect(direct.code, direct.err).toBe(missingPremise ? 2 : 0);
    const checkArgv = join(f.root, "check-argv.json");
    writeFileSync(
      join(f.root, "bin/agx-worker"),
      `#!/usr/bin/env bun
const args = Bun.argv.slice(2);
if (args[0] === "check") {
  await Bun.write(${JSON.stringify(checkArgv)}, JSON.stringify(args));
  const child = Bun.spawn([process.execPath, ${JSON.stringify(ENTRY)}, ...args], { stdout: "inherit", stderr: "inherit" });
  process.exit(await child.exited);
}
console.log(await Bun.file(${JSON.stringify(f.records)}).text());
`,
    );
    const before = await jjCommand(
      "--ignore-working-copy",
      "log",
      "-r",
      `${workspaceName}@`,
      "--no-graph",
      "-T",
      "commit_id",
    );
    const result = await invoke(
      f,
      "--sandbox",
      "none",
      "--continue",
      "prior-run",
    );
    expect(result.exitCode, result.stderr).toBe(direct.code);
    const observedArgs = jsonOf(z.array(z.string())).safeParse(
      await Bun.file(checkArgv).text(),
    );
    expect(observedArgs.success).toBe(true);
    expect(observedArgs.data).toEqual(checkArgs);
    expect(await Bun.file(join(workspace, ".agx.toml")).exists()).toBe(false);
    expect(await Bun.file(join(workspace, "agx.toml")).exists()).toBe(false);
    expect(
      await jjCommand(
        "--ignore-working-copy",
        "log",
        "-r",
        `${workspaceName}@`,
        "--no-graph",
        "-T",
        "commit_id",
      ),
    ).toBe(before);
    if (missingPremise) {
      expect(result.stderr).toContain(`--cd ${workspace} @/base_rev=${before}`);
      expect(result.stderr).toContain("check exit=2");
      expect(result.stderr).toContain("file:main-only: file does not exist");
      expect(await Bun.file(f.unitArgs).exists()).toBe(false);
    }
  },
  60_000,
);

test.each(["check", "ls"])(
  "dispatch propagates temporary %s failure without a verdict",
  async (command) => {
    const f = fixture();
    writeFileSync(
      join(f.root, "bin/agx-worker"),
      `#!/bin/sh
if [ "$1" = "${command}" ]; then
  echo 'inspection timeout TEST_INSPECTION_MS=60000ms; command=["agx-worker","${command}"]; cwd=${f.repo}' >&2
  exit 75
fi
if [ "$1" = "check" ]; then exit 0; fi
cat "$FAKE_RECORDS"
`,
    );
    const result = await invoke(f);
    expect(result.exitCode).toBe(75);
    expect(result.stderr).toContain("TEST_INSPECTION_MS=60000ms");
    expect(result.stderr).not.toContain("preflight failed");
    expect(await Bun.file(f.unitArgs).exists()).toBe(false);
  },
);

test("dispatch check deadline is an operational timeout with exit 75", async () => {
  const f = fixture();
  writeFileSync(
    join(f.root, "bin/agx-worker"),
    `#!/usr/bin/env bun
if (Bun.argv[2] === "check") {
  await Bun.sleep(65_000);
  console.error("late check verdict");
  process.exit(2);
}
process.exit(1);
`,
  );
  const child = Bun.spawn([process.execPath, ENTRY, "dispatch", f.ticket], {
    cwd: f.repo,
    env: f.env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 70_000,
  });
  const [code, err] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  expect(code, err).toBe(75);
  expect(err).toContain("DISPATCH_CHECK_TIMEOUT_MS=60000ms");
  expect(err).toContain('"agx-worker","check"');
  expect(err).toContain(`cwd=${f.repo}`);
  expect(err).not.toContain("preflight failed");
  expect(err).not.toContain("late check verdict");
  expect(err.trim().split("\n")).toHaveLength(1);
  expect(await Bun.file(f.unitArgs).exists()).toBe(false);
}, 75_000);

test("dispatch inspection helpers distinguish expiry from a completed failure", async () => {
  const { invoke: inspect, invokeReadonly } =
    await import("../src/dispatch.ts");
  const f = fixture();
  const slow = [process.execPath, "-e", "await Bun.sleep(5000)"];
  const expiredList = await inspect(
    slow,
    f.repo,
    f.env,
    20,
    "DISPATCH_LIST_TIMEOUT_MS",
  );
  expect(expiredList.code).toBe(75);
  expect(expiredList.err).toContain("DISPATCH_LIST_TIMEOUT_MS=20ms");
  const expiredTree = await invokeReadonly(slow, f.repo, f.env, 20);
  expect(expiredTree.code).toBe(75);
  expect(expiredTree.err).toContain("DISPATCH_TREE_READ_TIMEOUT_MS=20ms");
  const completed = await inspect(
    [
      process.execPath,
      "-e",
      'console.error("completed refusal"); process.exit(2)',
    ],
    f.repo,
    f.env,
    2000,
    "DISPATCH_CHECK_TIMEOUT_MS",
  );
  expect(completed.code).toBe(2);
  expect(completed.err).toContain("completed refusal");
});
