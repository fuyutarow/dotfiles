// bun test for scripts/render-home.ts — the generator of $HOME's rendered half: settings.json
// (so `autoMode`, user-scope-only and machine-specific, stays effective without publishing a
// private project's structure through this public repo), codex hooks.json and CLAUDE.md.
// Every fixture is a throwaway tmp tree passed via env; the real $HOME is never touched.
// The cases that matter are the failure modes: this file carries every security hook, so a
// truncated render or a silently-dropped private rule is the damage to prevent.
import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import { brewPrefix } from "../core-tools.ts";
import { resolveRole } from "../config-registry.ts";
import {
  type HooksConfig,
  HooksConfigSchema,
  loadRegistry,
  wire,
} from "../hook-registry.ts";
import {
  isolatedTestEnv,
  TEST_TMPDIR,
  testPathWithStub,
} from "./support/test-isolation.ts";

const ROOT = realpathSync(resolve(import.meta.dir, "../.."));
const CLI_HOME = mkdtempSync(join(TEST_TMPDIR, "render-home-cli-"));
afterAll(() => {
  rmSync(CLI_HOME, { recursive: true, force: true });
});
const SCRIPT = join(ROOT, "scripts/render-home.ts");
function run(
  env: Record<string, string>,
  preload?: string,
): { out: string; code: number } {
  const dotfiles = env["DOTFILES"] ?? ROOT;
  const home = env["HOME"] ?? CLI_HOME;
  const path = env["PATH"] ?? testPathWithStub(join(dotfiles, "bin"));
  const proc = Bun.spawnSync(
    [
      process.execPath,
      ...(preload === undefined ? [] : ["--preload", preload]),
      SCRIPT,
    ],
    {
      cwd: ROOT,
      env: isolatedTestEnv(home, path, {
        DOTFILES: dotfiles,
        ...env,
      }),
      maxBuffer: 4 * 1024 * 1024,
      timeout: 25_000,
    },
  );
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

/** The other inputs render-home.ts reads, as minimal fixtures: an empty-hooks codex file, a
 * CLAUDE.md with empty legacy markers and a one-hook registry. */
function writeOtherInputs(dir: string, productionCli = false): void {
  mkdirSync(join(dir, "roles"), { recursive: true });
  writeFileSync(
    join(dir, "roles/roles.toml"),
    readFileSync(join(ROOT, "roles/roles.toml")),
  );
  mkdirSync(join(dir, "agents", "agx"), { recursive: true });
  writeFileSync(
    join(dir, "agents", "agx", "agx.toml"),
    readFileSync(join(ROOT, "agents", "agx", "agx.toml")),
  );
  mkdirSync(join(dir, "agents", "codex"), { recursive: true });
  writeFileSync(
    join(dir, "agents", "codex", "hooks.json"),
    '{ "hooks": {} }\n',
  );
  writeFileSync(
    join(dir, "agents", "claude", "CLAUDE.md"),
    "# policy\n\n<!-- roster:begin -->\n<!-- roster:end -->\n",
  );
  if (productionCli) {
    for (const path of [
      "tools/shared/src",
      "tools/shared/package.json",
      "package.json",
      "bun.lock",
    ]) {
      const target = join(dir, path);
      mkdirSync(join(target, ".."), { recursive: true });
      cpSync(join(ROOT, path), target, {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
    }
  } else {
    writeRosterCli(dir, 'throw new Error("render must not call agx");');
  }
  writeMiseCli(dir);
  mkdirSync(join(dir, "agents", "hooks"), { recursive: true });
  writeFileSync(join(dir, "agents", "hooks", "gate.ts"), "// fixture\n");
  writeFileSync(
    join(dir, "agents", "hooks", "hooks.toml"),
    '[[hook]]\nslug = "gate"\nscript = "gate.ts"\nevent = "PreToolUse"\nposition = 0\nmatcher = "Bash"\nfail_closed = true\nvendors = ["claude", "codex"]\n',
  );
}

test("role bindings resolve exact hosts and unknown hosts safely", () => {
  expect(resolveRole("sol.cc.uec.ac.jp")).toEqual({
    role: "shared-light",
    bound: true,
  });
  expect(resolveRole("sol")).toEqual({ role: "shared-light", bound: true });
  expect(resolveRole("R99")).toEqual({ role: "workstation", bound: true });
  expect(resolveRole("unknown.example")).toEqual({
    role: "workstation",
    bound: false,
  });
  expect(resolveRole("sol.other.example")).toEqual({
    role: "workstation",
    bound: false,
  });
});

test("Linux role environment renders safely without touching a linked directory", () => {
  const dotfiles = makeDotfiles({});
  const home = makeHome();
  const preload = join(home, "linux.ts");
  const setHost = (host: string) => {
    writeFileSync(
      preload,
      `import * as os from "node:os"; import { mock } from "bun:test"; Object.defineProperty(process, "platform", { value: "linux" }); mock.module("node:os", () => ({ ...os, hostname: () => ${JSON.stringify(host)} }));\n`,
    );
  };
  const path = join(home, ".config/environment.d/60-dotfiles-role.conf");
  const cpuProbe = Bun.spawnSync(["/usr/bin/getconf", "_NPROCESSORS_ONLN"]);
  expect(cpuProbe.exitCode).toBe(0);
  const cpus = Number(cpuProbe.stdout.toString().trim());
  expect(cpus).toBeGreaterThan(0);
  writeFileSync(
    join(dotfiles, "roles/roles.toml"),
    `[workstation]\ntokio_worker_threads = ""\nrustc_wrapper = "sccache"\n[shared-light]\ntokio_worker_threads = ${cpus + 1}\nrustc_wrapper = "none"\n`,
  );
  setHost("sol.cc.uec.ac.jp");
  let result = run({ DOTFILES: dotfiles, HOME: home }, preload);
  expect(result.code, result.out).toBe(0);
  expect(readFileSync(path, "utf8")).toBe(`TOKIO_WORKER_THREADS=${cpus}\n`);
  expect(lstatSync(path).isFile()).toBe(true);
  writeFileSync(
    join(dotfiles, "roles/roles.toml"),
    '[workstation]\ntokio_worker_threads = ""\nrustc_wrapper = "sccache"\n[shared-light]\ntokio_worker_threads = 1\nrustc_wrapper = "none"\n',
  );
  result = run({ DOTFILES: dotfiles, HOME: home }, preload);
  expect(result.code, result.out).toBe(0);
  expect(readFileSync(path, "utf8")).toBe("TOKIO_WORKER_THREADS=1\n");
  setHost("unknown.example");
  result = run({ DOTFILES: dotfiles, HOME: home }, preload);
  expect(result.code, result.out).toBe(0);
  expect(readFileSync(path, "utf8")).toBe("RUSTC_WRAPPER=sccache\n");
  const linkedHome = makeHome();
  mkdirSync(join(linkedHome, ".config"), { recursive: true });
  symlinkSync(
    join(dotfiles, "roles"),
    join(linkedHome, ".config/environment.d"),
  );
  result = run({ DOTFILES: dotfiles, HOME: linkedHome }, preload);
  expect(result.code).toBe(1);
  expect(result.out).toContain("is a symlink; refusing");
  expect(existsSync(join(dotfiles, "roles/60-dotfiles-role.conf"))).toBe(false);
  expect(existsSync(join(linkedHome, ".config/dotfiles/role.env"))).toBe(false);
  writeFileSync(
    preload,
    'Object.defineProperty(process, "platform", { value: "darwin" });\n',
  );
  writeFileSync(path, "mac sentinel\n");
  result = run({ DOTFILES: dotfiles, HOME: home }, preload);
  expect(result.code, result.out).toBe(0);
  expect(readFileSync(path, "utf8")).toBe("mac sentinel\n");
  cleanup(dotfiles, home, linkedHome);
});

test("role render is data only and invalid defaults leave outputs untouched", () => {
  const dotfiles = makeDotfiles({});
  const home = makeHome();
  const result = run({ DOTFILES: dotfiles, HOME: home });
  expect(result.code, result.out).toBe(0);
  const path = join(home, ".config/dotfiles/role.env");
  const before = readFileSync(path, "utf8");
  expect(before).toMatch(
    /^DOTFILES_ROLE=(workstation|shared-light)\nDOTFILES_ROLE_TOKIO_WORKER_THREADS=(|[1-9][0-9]*)\nDOTFILES_ROLE_RUSTC_WRAPPER=(sccache|none)\n$/u,
  );
  writeFileSync(
    join(dotfiles, "roles/roles.toml"),
    '[workstation]\ntokio_worker_threads = -1\nrustc_wrapper = "none"\n',
  );
  expect(run({ DOTFILES: dotfiles, HOME: home }).code).toBe(1);
  expect(readFileSync(path, "utf8")).toBe(before);
  cleanup(dotfiles, home);
});

function writeRosterCli(dir: string, code: string): void {
  const path = join(dir, "bin/agx");
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    `#!${process.execPath}\n` +
      `if (JSON.stringify(process.argv.slice(2)) !== '["worker","roster","--json"]') throw new Error("unexpected roster arguments");\n` +
      `if (process.env.AGX_CONFIG !== process.cwd() + "/agents/agx/agx.toml" || process.env.DISPATCH_ROSTER_PATH !== undefined) throw new Error("unexpected roster environment");\n` +
      code,
  );
  chmodSync(path, 0o755);
}

function writeAgxFailureSentinel(dir: string, marker: string): void {
  const path = join(dir, "bin/agx");
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(
    path,
    `#!/bin/sh\nprintf called > ${JSON.stringify(marker)}\nexit 97\n`,
  );
  chmodSync(path, 0o755);
}

function writeMiseCli(dir: string): void {
  const path = join(dir, "bin/mise");
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    "#!/bin/sh\n" +
      'if [ -n "${MISE_ARGS-}" ]; then printf \'%s\\n\' "$@" > "$MISE_ARGS"; fi\n' +
      'if [ -n "${MISE_CONTEXT-}" ]; then printf \'%s\\n%s\\n%s\\n\' "$PWD" "${AGX_CONFIG-}" "${DISPATCH_ROSTER_PATH-}" > "$MISE_CONTEXT"; fi\n' +
      "shift 4\n" +
      'exec "$@"\n',
  );
  chmodSync(path, 0o755);
}

const GATE = {
  matcher: "Bash",
  hooks: [
    {
      type: "command",
      command:
        "HOOK_SLUG=dotfiles:gate sh ~/.agents/hooks/run.sh --fail-closed gate.ts",
    },
  ],
};

/** A dotfiles fixture: the committed base settings plus the other inputs. */
function makeDotfiles(base: object, productionCli = false): string {
  const dir = mkdtempSync(join(TEST_TMPDIR, "render-settings-dotfiles-"));
  mkdirSync(join(dir, "agents", "claude"), { recursive: true });
  writeFileSync(
    join(dir, "agents", "claude", "settings.json"),
    `${JSON.stringify(base, null, 2)}\n`,
  );
  writeOtherInputs(dir, productionCli);
  return dir;
}

function makeHome(): string {
  const home = mkdtempSync(join(TEST_TMPDIR, "render-settings-home-"));
  mkdirSync(join(home, ".bun", "bin"), { recursive: true });
  writeFileSync(join(home, ".bun", "bin", "statusline"), "#!/bin/sh\n");
  return home;
}

function dest(home: string): string {
  return join(home, ".claude", "settings.json");
}

const JsonObject = z.record(z.string(), z.unknown());

/** A JSON object file, decoded with safeParse; a decode failure fails the test right here. */
function readObject(path: string): Record<string, unknown> {
  const r = jsonOf(JsonObject).safeParse(readFileSync(path, "utf8"));
  expect(r.error).toBeUndefined();
  return r.success ? r.data : {};
}

function readDest(home: string): Record<string, unknown> {
  return readObject(dest(home));
}

function cleanup(...dirs: string[]): void {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

function assertHookCommand(command: string): void {
  if (command.includes("herdr-agent-state.sh"))
    expect(command).toStartWith("sh ");
  else expect(command).toMatch(/^HOOK_SLUG=dotfiles:[a-z][a-z0-9:-]* sh /u);
  expect(command).not.toContain("dotfiles:dotfiles:");
}

describe("render-home: base only", () => {
  test("retains Claude-written modelSettings while rendering other keys from declarations", () => {
    const dotfiles = makeDotfiles({ model: "opus", declared: true });
    const home = makeHome();
    mkdirSync(join(home, ".claude"), { recursive: true });
    const modelSettings = {
      "claude-opus-5-5": { autoCompactWindow: 400000, extra: [null, false] },
      another: { autoCompactWindow: 123456 },
    };
    writeFileSync(
      dest(home),
      JSON.stringify({ modelSettings, model: "old", runtimeOnly: true }),
    );
    const result = run({ HOME: home, DOTFILES: dotfiles });
    expect(result.code, result.out).toBe(0);
    expect(readDest(home)).toEqual({
      model: "opus",
      declared: true,
      modelSettings,
      hooks: { PreToolUse: [GATE] },
    });
    expect(run({ HOME: home, DOTFILES: dotfiles }).out).toContain(
      `current: ${dest(home)}`,
    );
    cleanup(dotfiles, home);
  });

  test("overwrites malformed deployed settings as before", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(dest(home), "{ malformed");
    const result = run({ HOME: home, DOTFILES: dotfiles });
    expect(result.code, result.out).toBe(0);
    expect(readDest(home)).toEqual({
      model: "opus",
      hooks: { PreToolUse: [GATE] },
    });
    cleanup(dotfiles, home);
  });
  test("real Claude settings retain transcripts for 100 years", () => {
    const home = makeHome();
    const result = run({
      HOME: home,
      DOTFILES: ROOT,
      DOTFILES_RENDER_FROM_WORKING_COPY: "1",
      CLAUDE_SETTINGS_PRIVATE: join(home, "missing-overlay.json"),
    });
    const rendered = result.code === 0 ? readDest(home) : {};
    cleanup(home);
    expect(result.code, result.out).toBe(0);
    // The reference states no maximum (default 30 days, minimum 1).
    // Use 36500 days (100 years) to effectively disable transcript cleanup.
    // https://code.claude.com/docs/en/settings-reference#cleanupperioddays
    expect(rendered["cleanupPeriodDays"]).toBe(36500);
  });

  test("real Claude settings render agx:snapshot on the same events as sys-snapshot", async () => {
    const base = jsonOf(JsonObject).safeParse(
      await Bun.file(join(ROOT, "agents/claude/settings.json")).text(),
    );
    expect(base.success).toBe(true);
    if (!base.success) return;
    const dotfiles = makeDotfiles(base.data);
    const home = makeHome();
    const result = run({ HOME: home, DOTFILES: dotfiles });
    expect(result.code, result.out).toBe(0);
    const hooks = HooksConfigSchema.safeParse(readDest(home)["hooks"]);
    expect(hooks.success).toBe(true);
    if (!hooks.success) return;
    for (const event of ["Stop", "PostToolUse"]) {
      const groups = hooks.data[event] ?? [];
      const agx = groups.filter((group) =>
        group.hooks.some(
          (hook) =>
            hook["command"] ===
            "HOOK_SLUG=dotfiles:agx:snapshot sh ~/.claude/hooks/run.sh log-agx-snapshot.ts",
        ),
      );
      const sys = groups.filter((group) =>
        group.hooks.some(
          (hook) =>
            hook["command"] ===
            "HOOK_SLUG=dotfiles:sys-snapshot sh ~/.claude/hooks/run.sh log-sys-snapshot.ts",
        ),
      );
      expect(agx).toHaveLength(1);
      expect(sys).toHaveLength(1);
      expect(agx[0]?.["matcher"]).toBe(sys[0]?.["matcher"]);
      expect(agx[0]?.["hooks"][0]?.["timeout"]).toBe(5);
    }
    cleanup(dotfiles, home);
  });

  test("strips the retired dotfiles marketplace and plugin entries", () => {
    const dotfiles = makeDotfiles({
      extraKnownMarketplaces: {
        dotfiles: { source: { source: "directory", path: "/old/dotfiles" } },
        retained: { source: { source: "github", repo: "example/marketplace" } },
      },
      enabledPlugins: {
        "dotfiles@dotfiles": true,
        "other@marketplace": false,
      },
    });
    const home = makeHome();
    const { code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(0);
    expect(readDest(home)).toEqual({
      extraKnownMarketplaces: {
        retained: { source: { source: "github", repo: "example/marketplace" } },
      },
      enabledPlugins: { "other@marketplace": false },
      hooks: { PreToolUse: [GATE] },
    });
    cleanup(dotfiles, home);
  });

  test("every real rendered owned command starts with its namespace and retired hook is absent", () => {
    const home = makeHome();
    const r = run({
      HOME: home,
      DOTFILES: ROOT,
      DOTFILES_RENDER_FROM_WORKING_COPY: "1",
      CLAUDE_SETTINGS_PRIVATE: join(home, "missing-overlay.json"),
    });
    expect(r.code).toBe(0);
    for (const path of [
      join(home, ".claude/settings.json"),
      join(home, ".codex/hooks.json"),
    ]) {
      const text = readFileSync(path, "utf8");
      expect(text).not.toContain("detect-ccc-gpu-hold");
      const commands = [...text.matchAll(/"command": "([^"\n]+)"/gu)]
        .map((m) => m[1] ?? "")
        .filter((c) => c.includes("hooks/") || c.includes("herdr-agent-state"));
      expect(commands.length).toBeGreaterThan(0);
      commands.forEach((command) => {
        assertHookCommand(command);
      });
    }
    cleanup(home);
  });
  test("reference render validates commands in live HOME and writes only scratch HOME", () => {
    const dotfiles = makeDotfiles({
      statusLine: { type: "command", command: "~/.bun/bin/statusline" },
    });
    const live = makeHome();
    const scratch = mkdtempSync(join(TEST_TMPDIR, "render-reference-"));
    expect(run({ HOME: scratch, DOTFILES: dotfiles }).code).toBe(1);
    const r = run({
      HOME: scratch,
      DOTFILES: dotfiles,
      COMMAND_TARGET_HOME: live,
    });
    expect(r.code).toBe(0);
    expect(readDest(scratch)["statusLine"]).toEqual({
      type: "command",
      command: "~/.bun/bin/statusline",
    });
    expect(existsSync(dest(live))).toBe(false);
    expect(
      readFileSync(join(scratch, ".config/dotfiles/brew-prefix"), "utf8"),
    ).toBe(`${brewPrefix(live)}\n`);
    expect(existsSync(join(live, ".config/dotfiles/brew-prefix"))).toBe(false);
    expect(readFileSync(join(live, ".bun/bin/statusline"), "utf8")).toBe(
      "#!/bin/sh\n",
    );
    cleanup(dotfiles, live, scratch);
  });
  test("renders the committed base verbatim when no overlay exists", () => {
    const dotfiles = makeDotfiles({ model: "opus", hooks: { PreToolUse: [] } });
    const home = makeHome();
    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(0);
    expect(out).toContain("(no private overlay)");
    // The registry's gate is wired into the rendered copy, never into the base.
    expect(readDest(home)).toEqual({
      model: "opus",
      hooks: { PreToolUse: [GATE] },
    });
    // A real file, never a symlink — the whole point of the change.
    expect(lstatSync(dest(home)).isSymbolicLink()).toBe(false);
    const policy = readFileSync(join(home, ".claude", "CLAUDE.md"), "utf8");
    expect(policy).toBe(
      "# policy\n\n<!-- roster:begin -->\n<!-- roster:end -->\n",
    );
    cleanup(dotfiles, home);
  });

  test("second run reports current and rewrites nothing", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    run({ HOME: home, DOTFILES: dotfiles });
    const firstMtime = lstatSync(dest(home)).mtimeMs;
    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(0);
    expect(out).toContain(`current: ${dest(home)}`);
    expect(lstatSync(dest(home)).mtimeMs).toBe(firstMtime);
    cleanup(dotfiles, home);
  });
});

describe("render-home: private overlay", () => {
  test("an overlay key is merged in and reported by name", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    const overlay = join(home, "private.json");
    writeFileSync(
      overlay,
      JSON.stringify({ autoMode: { allow: ["$defaults"] } }),
    );

    const { out, code } = run({
      HOME: home,
      DOTFILES: dotfiles,
      CLAUDE_SETTINGS_PRIVATE: overlay,
    });
    expect(code).toBe(0);
    expect(out).toContain("[autoMode]");
    expect(readDest(home)).toEqual({
      model: "opus",
      autoMode: { allow: ["$defaults"] },
      hooks: { PreToolUse: [GATE] },
    });
    cleanup(dotfiles, home);
  });

  test("an overlay key REPLACES the base key outright — no deep merge", () => {
    // Deep-merging `hooks` has no defensible semantics, so the contract is replacement. Pinned
    // here because a future "helpful" deep merge would silently reorder security hooks.
    const dotfiles = makeDotfiles({
      permissions: { defaultMode: "auto", allow: ["a", "b"] },
    });
    const home = makeHome();
    const overlay = join(home, "private.json");
    writeFileSync(overlay, JSON.stringify({ permissions: { allow: ["z"] } }));

    const { code } = run({
      HOME: home,
      DOTFILES: dotfiles,
      CLAUDE_SETTINGS_PRIVATE: overlay,
    });
    expect(code).toBe(0);
    expect(readDest(home)).toEqual({
      permissions: { allow: ["z"] },
      hooks: { PreToolUse: [GATE] },
    });
    cleanup(dotfiles, home);
  });
});

describe("render-home: the legacy symlink", () => {
  test("replaces a symlink into the repo with a real file, and says so", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    mkdirSync(join(home, ".claude"), { recursive: true });
    symlinkSync(
      join(dotfiles, "agents", "claude", "settings.json"),
      dest(home),
    );

    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(0);
    expect(out).toContain("replaced the old symlink into the repo");
    expect(lstatSync(dest(home)).isSymbolicLink()).toBe(false);
    // The repo-side base must be untouched — writing THROUGH the old link would have edited it.
    expect(
      readObject(join(dotfiles, "agents", "claude", "settings.json")),
    ).toEqual({ model: "opus" });
    cleanup(dotfiles, home);
  });
});

describe("render-home: failure modes", () => {
  test("a present statusLine target renders with its declared command unchanged", () => {
    const dotfiles = makeDotfiles({
      statusLine: { type: "command", command: "~/.bun/bin/statusline" },
    });
    const home = makeHome();

    const { code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(0);
    expect(readDest(home)["statusLine"]).toEqual({
      type: "command",
      command: "~/.bun/bin/statusline",
    });
    cleanup(dotfiles, home);
  });

  test("a missing statusLine target refuses the render and preserves deployed bytes", () => {
    const dotfiles = makeDotfiles({
      statusLine: { type: "command", command: "~/.bun/bin/missing" },
    });
    const home = makeHome();
    mkdirSync(join(home, ".claude"), { recursive: true });
    const previous = "previous deployed settings, byte for byte\n";
    writeFileSync(dest(home), previous);

    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(1);
    expect(out).toContain('"~/.bun/bin/missing"');
    expect(out).toContain(join(home, ".bun", "bin", "missing"));
    expect(out).toContain("run `mise run deps` first");
    expect(readFileSync(dest(home), "utf8")).toBe(previous);
    cleanup(dotfiles, home);
  });

  test("a missing Bun hook script target refuses before any output is written", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    writeFileSync(
      join(dotfiles, "agents", "codex", "hooks.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                { type: "command", command: "bun ~/.bun/bin/missing-hook" },
              ],
            },
          ],
        },
      }),
    );
    const home = makeHome();

    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(1);
    expect(out).toContain("bun ~/.bun/bin/missing-hook");
    expect(out).toContain(join(home, ".bun", "bin", "missing-hook"));
    expect(existsSync(dest(home))).toBe(false);
    expect(existsSync(join(home, ".codex", "hooks.json"))).toBe(false);
    cleanup(dotfiles, home);
  });

  test("a malformed overlay aborts and leaves the existing settings untouched", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    run({ HOME: home, DOTFILES: dotfiles }); // establish a good render first
    const before = readFileSync(dest(home), "utf8");

    const overlay = join(home, "private.json");
    writeFileSync(overlay, "{ not json");
    const { out, code } = run({
      HOME: home,
      DOTFILES: dotfiles,
      CLAUDE_SETTINGS_PRIVATE: overlay,
    });
    expect(code).toBe(1);
    expect(out).toContain("not readable JSON");
    expect(out).toContain("silently drop the private rules");
    expect(readFileSync(dest(home), "utf8")).toBe(before);
    cleanup(dotfiles, home);
  });

  test("a missing base aborts rather than writing an empty settings file", () => {
    const dotfiles = mkdtempSync(join(TEST_TMPDIR, "render-settings-nobase-"));
    const home = makeHome();
    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(1);
    expect(out).toContain("cannot read base settings");
    expect(existsSync(dest(home))).toBe(false);
    cleanup(dotfiles, home);
  });

  test("a base that is not a JSON object aborts", () => {
    const dotfiles = mkdtempSync(join(TEST_TMPDIR, "render-settings-arr-"));
    mkdirSync(join(dotfiles, "agents", "claude"), { recursive: true });
    writeFileSync(
      join(dotfiles, "agents", "claude", "settings.json"),
      "[1,2,3]\n",
    );
    const home = makeHome();
    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(1);
    expect(out).toContain("not a JSON object");
    cleanup(dotfiles, home);
  });

  test("leaves no .rendering temp file behind on success", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    run({ HOME: home, DOTFILES: dotfiles });
    expect(existsSync(`${dest(home)}.rendering`)).toBe(false);
    cleanup(dotfiles, home);
  });
});

describe("render-home: the time zone from zsh/timezone", () => {
  /** A dotfiles fixture whose zsh/timezone holds `zone`. "UTC" exists in every zone database. */
  function withZone(base: object, zone: string): string {
    const dotfiles = makeDotfiles(base);
    mkdirSync(join(dotfiles, "zsh"), { recursive: true });
    writeFileSync(join(dotfiles, "zsh", "timezone"), `${zone}\n`);
    return dotfiles;
  }

  test("the zone is rendered into env.TZ beside the base's other env keys", () => {
    const dotfiles = withZone({ env: { FOO: "1" } }, "UTC");
    const home = makeHome();
    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(0);
    expect(out).toContain("env.TZ=UTC");
    expect(readDest(home)).toEqual({
      env: { FOO: "1", TZ: "UTC" },
      hooks: { PreToolUse: [GATE] },
    });
    cleanup(dotfiles, home);
  });

  test("an env.TZ already in the overlay wins over the file", () => {
    const dotfiles = withZone({ model: "opus" }, "UTC");
    const home = makeHome();
    const overlay = join(home, "private.json");
    writeFileSync(overlay, JSON.stringify({ env: { TZ: "Europe/Paris" } }));
    const { out, code } = run({
      HOME: home,
      DOTFILES: dotfiles,
      CLAUDE_SETTINGS_PRIVATE: overlay,
    });
    expect(code).toBe(0);
    expect(out).toContain('env.TZ kept: "Europe/Paris"');
    expect(readDest(home)).toEqual({
      model: "opus",
      env: { TZ: "Europe/Paris" },
      hooks: { PreToolUse: [GATE] },
    });
    cleanup(dotfiles, home);
  });

  test("a name the zone database does not know aborts and leaves the settings untouched", () => {
    const dotfiles = withZone({ model: "opus" }, "UTC");
    const home = makeHome();
    run({ HOME: home, DOTFILES: dotfiles });
    const before = readFileSync(dest(home), "utf8");
    writeFileSync(join(dotfiles, "zsh", "timezone"), "Nowhere/Fake\n");
    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(1);
    expect(out).toContain("must hold one IANA zone name");
    expect(readFileSync(dest(home), "utf8")).toBe(before);
    cleanup(dotfiles, home);
  });
});

describe("render-home: the rest of the rendered half", () => {
  test("codex hooks.json gets the registry gate beside its own entries", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    const { code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(0);
    expect(readObject(join(home, ".codex", "hooks.json"))).toEqual({
      hooks: { PreToolUse: [GATE] },
    });
    cleanup(dotfiles, home);
  });

  test("an overlay that replaces `hooks` still gets the registry gate", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    const overlay = join(home, "private.json");
    const mine = { hooks: [{ type: "command", command: "sh -c mine" }] };
    writeFileSync(overlay, JSON.stringify({ hooks: { Stop: [mine] } }));
    run({ HOME: home, DOTFILES: dotfiles, CLAUDE_SETTINGS_PRIVATE: overlay });
    expect(readDest(home)["hooks"]).toEqual({
      Stop: [mine],
      PreToolUse: [GATE],
    });
    cleanup(dotfiles, home);
  });

  test("an invalid registry aborts before ANY output is written", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    writeFileSync(
      join(dotfiles, "agents", "hooks", "hooks.toml"),
      '[[hook]]\nscript = "missing.ts"\nevent = "PreToolUse"\nfail_closed = true\nvendors = ["claude"]\n',
    );
    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(1);
    expect(out).toContain("missing.ts is not in agents/hooks");
    expect(existsSync(dest(home))).toBe(false);
    expect(existsSync(join(home, ".codex", "hooks.json"))).toBe(false);
    expect(existsSync(join(home, ".claude", "CLAUDE.md"))).toBe(false);
    cleanup(dotfiles, home);
  });
});

describe("render-home: committed jj inputs", () => {
  function committedFixture() {
    const dotfiles = makeDotfiles({ model: "committed-model" }, true);
    const home = makeHome();
    writeFileSync(join(dotfiles, ".gitignore"), "node_modules/\n");
    const config = join(home, "jj-config.toml");
    writeFileSync(
      config,
      '[user]\nname = "Render Test"\nemail = "render@example.test"\n',
    );
    const env = { HOME: home, DOTFILES: dotfiles, JJ_CONFIG: config };
    mkdirSync(join(dotfiles, "scripts"));
    for (const path of [
      "scripts/render-home.ts",
      "scripts/render-source.ts",
      "scripts/config-registry.ts",
      "scripts/core-tools.ts",
      "scripts/hook-registry.ts",
      "agents/hooks/attempt.ts",
      "agents/hooks/agx-roster.ts",
      "agents/hooks/narrow.ts",
      "agents/hooks/slugs.ts",
      "agents/hooks/zod.ts",
      "agents/hooks/vendor/deps.js",
      "tools/shared/src/attempt.ts",
      "tools/shared/src/narrow.ts",
      "tools/shared/src/zod.ts",
      "tools/tool-tiers/src/tool-tiers.ts",
      "tools/tool-tiers/src/tool-commands.ts",
      "tools/tool-tiers/src/tool-commands.tsv",
      "Brewfile.core",
    ]) {
      const target = join(dotfiles, path);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, readFileSync(join(ROOT, path)));
    }
    writeFileSync(join(dotfiles, "scripts/link-dots.ts"), "// root fixture\n");
    function jj(args: string[]): string {
      const result = Bun.spawnSync(["jj", "--no-pager", ...args], {
        cwd: dotfiles,
        env: isolatedTestEnv(
          home,
          testPathWithStub(join(dotfiles, "bin")),
          env,
        ),
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      });
      expect(result.exitCode, result.stderr.toString()).toBe(0);
      return result.stdout.toString().trim();
    }
    jj(["git", "init", "--colocate"]);
    jj(["commit", "-m", "committed render inputs"]);
    jj(["bookmark", "set", "alpha", "-r", "@-"]);
    const commit = jj(["log", "--no-graph", "-r", "alpha", "-T", "commit_id"]);
    return { dotfiles, home, env, jj, commit };
  }

  test("a pinned landed commit renders its bytes even after clean alpha advances", () => {
    const f = committedFixture();
    const original = run(f.env);
    expect(original.code, original.out).toBe(0);
    const originalPolicy = readFileSync(join(f.home, ".claude/CLAUDE.md"));
    writeFileSync(
      join(f.dotfiles, "agents/claude/settings.json"),
      '{"model":"newer-model"}\n',
    );
    const renderer = join(f.dotfiles, "scripts/render-home.ts");
    writeFileSync(
      renderer,
      readFileSync(renderer, "utf8").replace(
        "text: md.value.replace",
        'text: "Newer renderer:" + md.value.replace',
      ),
    );
    writeFileSync(
      join(f.dotfiles, "agents/claude/CLAUDE.md"),
      "# newer policy\n",
    );
    f.jj(["commit", "-m", "newer alpha inputs"]);
    f.jj(["bookmark", "set", "alpha", "-r", "@-"]);
    const result = run({ ...f.env, DOTFILES_RENDER_REV: f.commit });
    expect(result.code, result.out).toBe(0);
    expect(readFileSync(join(f.home, ".claude/CLAUDE.md"))).toEqual(
      originalPolicy,
    );
    expect(result.out).toContain(`render source: commit ${f.commit}`);
    expect(readDest(f.home)["model"]).toBe("committed-model");
    expect(readFileSync(join(f.home, ".claude/CLAUDE.md"), "utf8")).toBe(
      "# policy\n\n<!-- roster:begin -->\n<!-- roster:end -->\n",
    );
    const latest = run(f.env);
    expect(latest.code, latest.out).toBe(0);
    expect(readDest(f.home)["model"]).toBe("newer-model");
    expect(readFileSync(join(f.home, ".claude/CLAUDE.md"), "utf8")).toStartWith(
      "# newer policy\n",
    );
    cleanup(f.dotfiles, f.home);
  }, 30_000);

  test("dirty renderer inputs refuse; an invalid unused lock does not affect guidance rendering", () => {
    const f = committedFixture();
    using _cleanup = {
      [Symbol.dispose]: () => {
        cleanup(f.dotfiles, f.home);
      },
    };
    const first = run(f.env);
    expect(first.code, first.out).toBe(0);
    const paths = [
      ".claude/settings.json",
      ".codex/hooks.json",
      ".claude/CLAUDE.md",
      ".config/dotfiles/brew-prefix",
    ].map((path) => join(f.home, path));
    const before = paths.map((path) => ({ path, bytes: readFileSync(path) }));
    const rendererInput = join(f.dotfiles, "scripts/render-source.ts");
    writeFileSync(
      rendererInput,
      `${readFileSync(rendererInput, "utf8")}\n// changed render source\n`,
    );
    const dirty = run(f.env);
    expect(dirty.code, dirty.out).toBe(1);
    expect(dirty.out).toContain("uncommitted render inputs");
    expect(dirty.out).toContain("scripts/render-source.ts");
    writeFileSync(join(f.dotfiles, "bun.lock"), "invalid lockfile\n");
    f.jj(["commit", "-m", "invalid frozen dependencies"]);
    f.jj(["bookmark", "set", "alpha", "-r", "@-"]);
    const failed = run(f.env);
    expect(failed.code, failed.out).toBe(0);
    for (const { path, bytes } of before) {
      expect(readFileSync(path)).toEqual(bytes);
    }
  }, 30_000);

  test("dirty hooks refuse before links or renders; an explicit local override renders them", () => {
    const f = committedFixture();
    expect(run(f.env).code).toBe(0);
    const previous = readFileSync(join(f.home, ".codex/hooks.json"), "utf8");
    writeFileSync(
      join(f.dotfiles, "agents/codex/hooks.json"),
      '{"fixture":"dirty-hook-input","hooks":{}}\n',
    );
    const refused = run(f.env);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain("uncommitted render inputs");
    expect(refused.out).toContain(
      'DOTFILES_RENDER_REFUSAL_V1={"reason":"foreign-wip","paths":["agents/codex/hooks.json"]}',
    );
    expect(readFileSync(join(f.home, ".codex/hooks.json"), "utf8")).toBe(
      previous,
    );
    const links = Bun.spawnSync(
      [process.execPath, join(ROOT, "scripts/link-dots.ts")],
      {
        cwd: ROOT,
        env: isolatedTestEnv(
          f.home,
          testPathWithStub(join(f.dotfiles, "bin")),
          f.env,
        ),
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      },
    );
    expect(links.exitCode).toBe(2);
    expect(links.stderr.toString()).toContain("--from-working-copy");
    expect(existsSync(join(f.home, ".gitconfig"))).toBe(false);
    expect(run({ ...f.env, DOTFILES_RENDER_FROM_WORKING_COPY: "1" }).code).toBe(
      0,
    );
    expect(readObject(join(f.home, ".codex/hooks.json"))["fixture"]).toBe(
      "dirty-hook-input",
    );
    const deployed = run({
      ...f.env,
      DOTFILES_RENDER_REV: f.commit,
      DOTFILES_RENDER_FROM_WORKING_COPY: "1",
    });
    expect(deployed.code).toBe(1);
    expect(deployed.out).toContain("cannot be combined");
    cleanup(f.dotfiles, f.home);
  }, 30_000);
});

describe("render-home: agx guidance", () => {
  test("production CLAUDE.md preserves the source's current rendered policy", () => {
    const home = makeHome();
    using _cleanup = {
      [Symbol.dispose]: () => {
        cleanup(home);
      },
    };
    const result = run({
      HOME: home,
      DOTFILES: ROOT,
      DOTFILES_RENDER_FROM_WORKING_COPY: "1",
      CLAUDE_SETTINGS_PRIVATE: join(home, "missing.json"),
      AGX_CONFIG: "/must-not-use-operator-policy",
      DISPATCH_ROSTER_PATH: "/must-not-use-live-roster",
    });
    expect(result.code, result.out).toBe(0);
    const md = readFileSync(join(home, ".claude/CLAUDE.md"), "utf8");
    const source = readFileSync(join(ROOT, "agents/claude/CLAUDE.md"), "utf8");
    expect(Buffer.from(md)).toEqual(Buffer.from(source));
  });

  test("rendering never calls agx even when it would fail", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    using _cleanup = {
      [Symbol.dispose]: () => {
        cleanup(dotfiles, home);
      },
    };
    const called = join(home, "agx-called");
    writeAgxFailureSentinel(dotfiles, called);
    const result = run({ HOME: home, DOTFILES: dotfiles });
    expect(result.code, result.out).toBe(0);
    expect(existsSync(called)).toBe(false);
    expect(readFileSync(join(home, ".claude/CLAUDE.md"), "utf8")).toBe(
      readFileSync(join(dotfiles, "agents/claude/CLAUDE.md"), "utf8"),
    );
  });

  test("rendering succeeds without agx on PATH", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    using _cleanup = {
      [Symbol.dispose]: () => {
        cleanup(dotfiles, home);
      },
    };
    const emptyPath = join(home, "empty-bin");
    mkdirSync(emptyPath);
    const result = run({ HOME: home, DOTFILES: dotfiles, PATH: emptyPath });
    expect(result.code, result.out).toBe(0);
    expect(readFileSync(join(home, ".claude/CLAUDE.md"), "utf8")).toBe(
      readFileSync(join(dotfiles, "agents/claude/CLAUDE.md"), "utf8"),
    );
  });
});

describe("Reason Network Codex hooks", () => {
  const EVENTS = [
    ["SessionStart", "session-start", "*", 10],
    ["UserPromptSubmit", "user-prompt-submit", undefined, 10],
    ["PostToolUse", "post-tool-use", "*", 10],
    ["Stop", "stop", undefined, 10],
    ["SessionEnd", "session-end", undefined, 3],
  ] as const;

  function renderReal(home: string): { out: string; code: number } {
    return run({
      HOME: home,
      DOTFILES: ROOT,
      DOTFILES_RENDER_FROM_WORKING_COPY: "1",
      CLAUDE_SETTINGS_PRIVATE: join(home, "missing-overlay.json"),
    });
  }

  function reasonNetworkHooks(home: string) {
    const decoded = HooksConfigSchema.safeParse(
      readObject(join(home, ".codex/hooks.json"))["hooks"],
    );
    expect(decoded.success).toBe(true);
    return Object.entries(decoded.success ? decoded.data : {}).flatMap(
      ([event, groups]) =>
        groups.flatMap((group) =>
          group.hooks.flatMap((hook) =>
            String(hook["command"]).includes("reason-network")
              ? [{ event, matcher: group["matcher"], hook }]
              : [],
          ),
        ),
    );
  }

  test("renders the five groups with the machine's quoted absolute path and keeps existing hooks", () => {
    const home = makeHome();
    mkdirSync(join(home, ".local/bin"), { recursive: true });
    const exe = join(home, ".local/bin/reason-network");
    writeFileSync(exe, "#!/bin/sh\n");
    chmodSync(exe, 0o755);
    const r = renderReal(home);
    expect(r.code).toBe(0);
    const found = reasonNetworkHooks(home);
    expect(found).toHaveLength(EVENTS.length);
    for (const [event, name, matcher, timeout] of EVENTS) {
      const entry = found.find((candidate) => candidate.event === event);
      expect(entry?.hook).toEqual({
        type: "command",
        command: `'${exe}' hook codex ${name}`,
        timeout,
      });
      expect(entry?.matcher).toBe(matcher);
    }
    const text = readFileSync(join(home, ".codex/hooks.json"), "utf8");
    expect(text).not.toContain("{reason-network}");
    expect(text).toContain("codex-goal-kernel");
    expect(text).toContain("herdr-agent-state.sh session");
    // The tracked declaration never carries the machine path.
    expect(
      readFileSync(join(ROOT, "agents/codex/hooks.json"), "utf8"),
    ).not.toContain("/.local/bin/reason-network");
    cleanup(home);
  });

  test("a machine without reason-network omits only those hooks and says so", () => {
    const home = makeHome();
    const r = renderReal(home);
    expect(r.code).toBe(0);
    expect(r.out).toContain("5 Reason Network Codex hook(s) omitted");
    expect(reasonNetworkHooks(home)).toEqual([]);
    expect(readFileSync(join(home, ".codex/hooks.json"), "utf8")).toContain(
      "codex-goal-kernel",
    );
    cleanup(home);
  });
});

const hookEntry = (script: string, position: number): string =>
  `[[hook]]\nslug = "${script.replace(/\.ts$/u, "")}"\nscript = "${script}"\nevent = "PreToolUse"\nposition = ${position}\nmatcher = "Bash"\nfail_closed = true\nvendors = ["codex"]\n`;
const slotEntry = (script: string, position: number, retired = false): string =>
  `[[slot]]\nscript = "${script}"\nevent = "PreToolUse"\nposition = ${position}\n${retired ? "retired = true\n" : ""}`;

describe("render-home: Codex PreToolUse indices are declared, not listed", () => {
  // Two hand-written groups precede the registry's, as in agents/codex/hooks.json.
  const staticGroups: HooksConfig = {
    PreToolUse: [
      {
        matcher: "Agent",
        hooks: [{ type: "command", command: "static dispatch" }],
      },
      { matcher: "*", hooks: [{ type: "command", command: "static goal" }] },
    ],
  };
  const made: string[] = [];
  afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
  });

  async function registry(
    hooks: [script: string, position: number][],
    slots: string,
  ) {
    const dir = mkdtempSync(join(TEST_TMPDIR, "hook-order-"));
    made.push(dir);
    for (const [script] of hooks)
      writeFileSync(join(dir, script), "// fixture\n");
    writeFileSync(
      join(dir, "hooks.toml"),
      hooks.map(([script, position]) => hookEntry(script, position)).join("\n"),
    );
    writeFileSync(join(dir, "slots.toml"), slots);
    return loadRegistry(dir);
  }

  // The rendered PreToolUse group index of every registry hook, keyed by script.
  function indices(specs: Awaited<ReturnType<typeof loadRegistry>>["specs"]) {
    const groups = wire(staticGroups, specs, "codex")["PreToolUse"] ?? [];
    const out: Record<string, number> = {};
    groups.forEach((group, index) => {
      for (const hook of group.hooks) {
        const script = String(hook["command"]).split(" ").at(-1) ?? "";
        if (script.endsWith(".ts")) out[script] = index;
      }
    });
    return out;
  }

  const base: [string, number][] = [
    ["a.ts", 0],
    ["b.ts", 1],
    ["c.ts", 2],
  ];
  const baseSlots =
    slotEntry("a.ts", 0) + slotEntry("b.ts", 1) + slotEntry("c.ts", 2);

  test("the base order renders at the static-group offset", async () => {
    const before = await registry(base, baseSlots);
    expect(before.errors).toEqual([]);
    expect(indices(before.specs)).toEqual({ "a.ts": 2, "b.ts": 3, "c.ts": 4 });
  });

  test("inserting a hook at a new tail position keeps every existing index", async () => {
    const before = indices((await registry(base, baseSlots)).specs);
    const after = await registry(
      [...base, ["d.ts", 3]],
      `${baseSlots}${slotEntry("d.ts", 3)}`,
    );
    expect(after.errors).toEqual([]);
    const now = indices(after.specs);
    for (const script of Object.keys(before))
      expect(now[script]).toBe(before[script]);
    expect(now["d.ts"]).toBe(5);
  });

  test("inserting a hook above an existing position is refused, not rendered", async () => {
    const inserted = await registry(
      [
        ["a.ts", 0],
        ["d.ts", 1],
        ["b.ts", 2],
        ["c.ts", 3],
      ],
      `${baseSlots}${slotEntry("d.ts", 3)}`,
    );
    expect(inserted.errors.join("\n")).toContain(
      "b.ts: hooks.toml says PreToolUse position 2",
    );
  });

  test("removing the last position keeps every remaining index", async () => {
    const before = indices((await registry(base, baseSlots)).specs);
    const after = await registry(
      [
        ["a.ts", 0],
        ["b.ts", 1],
      ],
      baseSlots.replace(slotEntry("c.ts", 2), slotEntry("c.ts", 2, true)),
    );
    expect(after.errors).toEqual([]);
    expect(indices(after.specs)).toEqual({ "a.ts": 2, "b.ts": 3 });
    expect(indices(after.specs)).toEqual(
      Object.fromEntries(Object.entries(before).filter(([s]) => s !== "c.ts")),
    );
  });

  test("removing a middle hook is refused, because later hooks would shift", async () => {
    const removed = await registry(
      [
        ["a.ts", 0],
        ["c.ts", 2],
      ],
      baseSlots.replace(slotEntry("b.ts", 1), slotEntry("b.ts", 1, true)),
    );
    expect(removed.errors.join("\n")).toContain("removing b.ts");
    expect(removed.errors.join("\n")).toContain("would shift c.ts");
  });

  test("the rendered order follows declared positions, not list order", async () => {
    const shuffled = await registry(
      [
        ["c.ts", 2],
        ["a.ts", 0],
        ["b.ts", 1],
      ],
      baseSlots,
    );
    expect(shuffled.errors).toEqual([]);
    expect(indices(shuffled.specs)).toEqual({
      "a.ts": 2,
      "b.ts": 3,
      "c.ts": 4,
    });
  });

  test("the live declarations keep today's Codex PreToolUse indices", async () => {
    const root = join(import.meta.dir, "..", "..");
    const live = await loadRegistry(join(root, "agents", "hooks"));
    expect(live.errors).toEqual([]);
    const codexFile = jsonOf(z.object({ hooks: HooksConfigSchema })).safeParse(
      readFileSync(join(root, "agents", "codex", "hooks.json"), "utf8"),
    );
    expect(codexFile.success).toBe(true);
    if (!codexFile.success) return;
    const groups =
      wire(codexFile.data.hooks, live.specs, "codex")["PreToolUse"] ?? [];
    // Groups 0 and 1 are the hand-written entries; the registry's start at 2, in declared order.
    const registryScripts = groups
      .slice(2)
      .map((group) => String(group.hooks[0]?.["command"]).split(" ").at(-1));
    expect(groups).toHaveLength(7);
    expect(registryScripts).toEqual([
      "enforce-storage-headroom.ts",
      "enforce-model-floor.ts",
      "enforce-search-route.ts",
      "enforce-graveyard-scope.ts",
      "enforce-repo-bash-deny.ts",
    ]);
  });
});
