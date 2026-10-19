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
const roots: string[] = [];
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
      'const cdIndex = command.indexOf("--cd");',
      "const workspace = command[cdIndex + 1];",
      "writeFileSync(",
      "  process.env.FAKE_RECORDS!,",
      '  JSON.stringify([{ ...binding, state: "running", cwd: workspace }]) + "\\n",',
      ");",
    ].join("\n"),
  );
  const shim = (name: string, body: string[]) => {
    const path = join(bin, name);
    writeFileSync(path, `#!/bin/sh\n${body.join("\n")}\n`);
    chmodSync(path, 0o755);
  };
  shim("ws", [
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
    'if [ "$1" = "ls" ]; then cat "$FAKE_RECORDS"; exit 0; fi',
    'if [ "$1" = "check" ]; then if [ "$FAKE_CHECK_FAIL" = "yes" ]; then printf "agx: invalid writes; repair: use relative globs\\nagx: untrusted mise.toml; repair: mise trust\\n" >&2; exit 2; fi; exit 0; fi',
    'echo "unexpected fake agx command: $*" >&2',
    "exit 2",
  ]);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    FAKE_REPO: repo,
    FAKE_RECORDS: records,
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
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

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
  expect(result.stderr).toContain("no matching run record appeared");
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
    "ws add failed: ws: /home/fuyu is not a valid local jj workspace",
  ],
  ["FAKE_WS_INVALID", "ws add returned an invalid workspace"],
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
