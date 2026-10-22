// bun test for scripts/render-home.ts — the generator of $HOME's rendered half: settings.json
// (so `autoMode`, user-scope-only and machine-specific, stays effective without publishing a
// private project's structure through this public repo), codex hooks.json and CLAUDE.md.
// Every fixture is a throwaway tmp tree passed via env; the real $HOME is never touched.
// The cases that matter are the failure modes: this file carries every security hook, so a
// truncated render or a silently-dropped private rule is the damage to prevent.
import { describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import { brewPrefix } from "../core-tools.ts";
import { HooksConfigSchema } from "../hook-registry.ts";

const productionRoster = Bun.spawnSync(
  [
    process.execPath,
    "--no-install",
    join(import.meta.dir, "../../tools/agx-worker/src/next/cli.ts"),
    "roster",
    "--json",
  ],
  { env: { ...process.env, DISPATCH_ROSTER_PATH: undefined }, timeout: 10_000 },
);
expect(productionRoster.exitCode, productionRoster.stderr.toString()).toBe(0);
const ROSTER_JSON = productionRoster.stdout.toString();
const objective = jsonOf(z.object({ objective: z.string() })).safeParse(
  ROSTER_JSON,
);
expect(objective.success).toBe(true);
if (!objective.success) process.exit(1);
const ROUTING_OBJECTIVE = objective.data.objective;

const SCRIPT = join(import.meta.dir, "..", "render-home.ts");
const ROOT = join(import.meta.dir, "..", "..");
const ROUTE_BIAS = [
  ["no", "codex", "row"],
  ["choose", "codex"],
  ["when", "codex", "and", "claude", "rows", "are", "comparable"],
].map((words) => words.join(" "));

function run(env: Record<string, string>): { out: string; code: number } {
  const proc = Bun.spawnSync([process.execPath, SCRIPT], {
    env: {
      ...process.env,
      BUN_INSTALL_CACHE_DIR:
        process.env.BUN_INSTALL_CACHE_DIR ??
        join(homedir(), ".bun/install/cache"),
      ...env,
    },
    maxBuffer: 4 * 1024 * 1024,
    timeout: 25_000,
  });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

/** The other inputs render-home.ts reads, as minimal fixtures: an empty-hooks codex file, a
 * CLAUDE.md that is only the roster markers, the real roster, and a one-hook registry. */
function writeOtherInputs(dir: string, productionCli = false): void {
  mkdirSync(join(dir, "agents", "codex"), { recursive: true });
  writeFileSync(
    join(dir, "agents", "codex", "hooks.json"),
    '{ "hooks": {} }\n',
  );
  writeFileSync(
    join(dir, "agents", "claude", "CLAUDE.md"),
    "# policy\n\n<!-- roster:begin -->\n<!-- roster:end -->\n",
  );
  mkdirSync(join(dir, "agents", "models"), { recursive: true });
  writeFileSync(
    join(dir, "agents", "models", "dispatch-roster.toml"),
    readFileSync(join(ROOT, "agents", "models", "dispatch-roster.toml")),
  );
  if (productionCli) {
    for (const path of [
      "tools/agx-worker/src",
      "tools/agx-worker/package.json",
      "tools/shared/src",
      "tools/shared/package.json",
      "package.json",
      "bun.lock",
      "tools/agx-usehooks/package.json",
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
    writeRosterCli(
      dir,
      `process.stdout.write(${JSON.stringify(ROSTER_JSON)});`,
    );
  }
  mkdirSync(join(dir, "agents", "hooks"), { recursive: true });
  writeFileSync(join(dir, "agents", "hooks", "gate.ts"), "// fixture\n");
  writeFileSync(
    join(dir, "agents", "hooks", "hooks.toml"),
    '[[hook]]\nslug = "gate"\nscript = "gate.ts"\nevent = "PreToolUse"\nmatcher = "Bash"\nfail_closed = true\nvendors = ["claude", "codex"]\n',
  );
}

function writeRosterCli(dir: string, code: string): void {
  const path = join(dir, "tools/agx-worker/src/next/cli.ts");
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, code);
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
  const dir = mkdtempSync(join(tmpdir(), "render-settings-dotfiles-"));
  mkdirSync(join(dir, "agents", "claude"), { recursive: true });
  writeFileSync(
    join(dir, "agents", "claude", "settings.json"),
    `${JSON.stringify(base, null, 2)}\n`,
  );
  writeOtherInputs(dir, productionCli);
  return dir;
}

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "render-settings-home-"));
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
    expect(rendered.cleanupPeriodDays).toBe(36500);
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
    const hooks = HooksConfigSchema.safeParse(readDest(home).hooks);
    expect(hooks.success).toBe(true);
    if (!hooks.success) return;
    for (const event of ["Stop", "PostToolUse"]) {
      const groups = hooks.data[event] ?? [];
      const agx = groups.filter((group) =>
        group.hooks.some(
          (hook) =>
            hook.command ===
            "HOOK_SLUG=dotfiles:agx:snapshot sh ~/.claude/hooks/run.sh log-agx-snapshot.ts",
        ),
      );
      const sys = groups.filter((group) =>
        group.hooks.some(
          (hook) =>
            hook.command ===
            "HOOK_SLUG=dotfiles:sys-snapshot sh ~/.claude/hooks/run.sh log-sys-snapshot.ts",
        ),
      );
      expect(agx).toHaveLength(1);
      expect(sys).toHaveLength(1);
      expect(agx[0]?.matcher).toBe(sys[0]?.matcher);
      expect(agx[0]?.hooks[0]?.timeout).toBe(5);
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
    const scratch = mkdtempSync(join(tmpdir(), "render-reference-"));
    expect(run({ HOME: scratch, DOTFILES: dotfiles }).code).toBe(1);
    const r = run({
      HOME: scratch,
      DOTFILES: dotfiles,
      COMMAND_TARGET_HOME: live,
    });
    expect(r.code).toBe(0);
    expect(readDest(scratch).statusLine).toEqual({
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
    expect(policy).toContain(ROUTING_OBJECTIVE);
    expect(policy.split(ROUTING_OBJECTIVE)).toHaveLength(2);
    expect(policy).not.toContain("comparable-ticket tradeoff line");
    expect(policy).not.toContain(
      "when codex and claude rows are comparable, choose codex",
    );
    for (const text of [
      "agx worker run <ticket.md>",
      "agx worker check <ticket.md>",
      "agx worker ls [--json]",
      "agx worker judge <run> accept|reject",
      "agx worker stats [--import-legacy]",
      "systemd-run --user -E CLAUDE_CODE_SESSION_ID -E CODEX_SESSION_ID --unit=agt_<slug> --collect -- agx worker run <ticket.md>",
      "agx worker run <ticket.md> --continue <run>",
      "$XDG_STATE_HOME/agx/records.jsonl",
      "Ticket time boxes: `timeout_s` defaults to 600 seconds",
    ])
      expect(policy).toContain(text);
    expect(policy).not.toMatch(/\bagx (?:dispatch|ticket|ps|ledger)\b/u);
    expect(policy).not.toContain("RESOURCE-");
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
    expect(readDest(home).statusLine).toEqual({
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
    const dotfiles = mkdtempSync(join(tmpdir(), "render-settings-nobase-"));
    const home = makeHome();
    const { out, code } = run({ HOME: home, DOTFILES: dotfiles });
    expect(code).toBe(1);
    expect(out).toContain("cannot read base settings");
    expect(existsSync(dest(home))).toBe(false);
    cleanup(dotfiles, home);
  });

  test("a base that is not a JSON object aborts", () => {
    const dotfiles = mkdtempSync(join(tmpdir(), "render-settings-arr-"));
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
    expect(readDest(home).hooks).toEqual({
      Stop: [mine],
      PreToolUse: [GATE],
    });
    cleanup(dotfiles, home);
  });

  test("CLAUDE.md gets the roster between its markers; the repo template keeps only markers", () => {
    const dotfiles = makeDotfiles({ model: "opus" });
    const home = makeHome();
    run({ HOME: home, DOTFILES: dotfiles });
    const md = readFileSync(join(home, ".claude", "CLAUDE.md"), "utf8");
    expect(md).toMatch(
      /^# policy\n\n<!-- roster:begin -->\n<!-- RENDERED [^\n]*-->\n- \*\*Every worker starts with `agx worker run <ticket>`/u,
    );
    expect(md).toContain(
      "| default | id | route | AA | TB4 | SciCode | $in/cache/out | cost | use for |",
    );
    expect(ROUTE_BIAS.every((phrase) => !md.includes(phrase))).toBe(true);
    for (const command of [
      "agx worker run <ticket.md>",
      "agx worker check <ticket.md>",
      "agx worker ls [--json]",
      "agx worker judge <run> accept|reject",
      "agx worker stats [--import-legacy]",
      "systemd-run --user -E CLAUDE_CODE_SESSION_ID -E CODEX_SESSION_ID --unit=agt_<slug> --collect -- agx worker run <ticket.md>",
      "agx worker run <ticket.md> --continue <run>",
    ])
      expect(md).toContain(command);
    expect(md).not.toMatch(/\bagx (?:dispatch|ticket|ps|ledger)\b/u);
    expect(md).not.toContain("RESOURCE-");
    expect(md.endsWith("<!-- roster:end -->\n")).toBe(true);
    expect(
      readFileSync(join(dotfiles, "agents", "claude", "CLAUDE.md"), "utf8"),
    ).toBe("# policy\n\n<!-- roster:begin -->\n<!-- roster:end -->\n");
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
    const install = Bun.spawnSync(
      [
        process.execPath,
        "install",
        "--frozen-lockfile",
        "--offline",
        "--production",
        "--ignore-scripts",
        "--no-progress",
      ],
      { cwd: dotfiles, timeout: 60_000 },
    );
    expect(install.exitCode, install.stderr.toString()).toBe(0);
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
      "agents/models/roster.ts",
      "agents/hooks/attempt.ts",
      "agents/hooks/narrow.ts",
      "agents/hooks/slugs.ts",
      "agents/hooks/zod.ts",
      "agents/hooks/vendor/deps.js",
      "tools/shared/src/attempt.ts",
      "tools/shared/src/narrow.ts",
      "tools/shared/src/zod.ts",
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
        env: { ...process.env, ...env },
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
    const rosterCode = join(f.dotfiles, "scripts/render-home.ts");
    writeFileSync(
      rosterCode,
      readFileSync(rosterCode, "utf8").replaceAll(
        "How to run:",
        "Newer renderer:",
      ),
    );
    const publicCli = join(f.dotfiles, "tools/agx-worker/src/next/public.ts");
    writeFileSync(
      publicCli,
      readFileSync(publicCli, "utf8").replace(
        "objective: ROUTING_OBJECTIVE",
        'objective: "newer CLI objective"',
      ),
    );
    const rosterPath = join(f.dotfiles, "agents/models/dispatch-roster.toml");
    writeFileSync(
      rosterPath,
      readFileSync(rosterPath, "utf8").replace("2026-10-08", "2026-10-09"),
    );
    f.jj(["commit", "-m", "newer alpha inputs"]);
    f.jj(["bookmark", "set", "alpha", "-r", "@-"]);
    const result = run({ ...f.env, DOTFILES_RENDER_REV: f.commit });
    expect(result.code, result.out).toBe(0);
    expect(readFileSync(join(f.home, ".claude/CLAUDE.md"))).toEqual(
      originalPolicy,
    );
    expect(result.out).toContain(`render source: commit ${f.commit}`);
    expect(readDest(f.home).model).toBe("committed-model");
    expect(readFileSync(join(f.home, ".claude/CLAUDE.md"), "utf8")).toContain(
      "How to run:",
    );
    expect(
      readFileSync(join(f.home, ".claude/CLAUDE.md"), "utf8"),
    ).not.toContain("Newer renderer:");
    const pinned = readFileSync(join(f.home, ".claude/CLAUDE.md"), "utf8");
    expect(pinned).toContain(ROUTING_OBJECTIVE);
    expect(pinned).not.toContain("newer CLI objective");
    expect(pinned).toContain("sourced snapshot 2026-10-08");
    expect(run(f.env).code).toBe(0);
    expect(readFileSync(join(f.home, ".claude/CLAUDE.md"), "utf8")).toContain(
      "newer CLI objective",
    );
    expect(readFileSync(join(f.home, ".claude/CLAUDE.md"), "utf8")).toContain(
      "sourced snapshot 2026-10-09",
    );
    expect(readDest(f.home).model).toBe("newer-model");
    expect(readFileSync(join(f.home, ".claude/CLAUDE.md"), "utf8")).toContain(
      "Newer renderer:",
    );
    cleanup(f.dotfiles, f.home);
  }, 30_000);

  test("dirty CLI inputs refuse; a failed frozen install preserves deployed bytes", () => {
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
    const cliPath = join(f.dotfiles, "tools/agx-worker/src/next/cli.ts");
    writeFileSync(
      cliPath,
      `${readFileSync(cliPath, "utf8")}\n// changed CLI input\n`,
    );
    const dirty = run(f.env);
    expect(dirty.code, dirty.out).toBe(1);
    expect(dirty.out).toContain("uncommitted render inputs");
    expect(dirty.out).toContain("tools/agx-worker/src/next/cli.ts");
    writeFileSync(join(f.dotfiles, "bun.lock"), "invalid lockfile\n");
    f.jj(["commit", "-m", "invalid frozen dependencies"]);
    f.jj(["bookmark", "set", "alpha", "-r", "@-"]);
    const failed = run(f.env);
    expect(failed.code, failed.out).toBe(1);
    expect(failed.out).toContain("render dependencies: frozen install exited");
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
        env: { ...process.env, ...f.env },
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
    expect(readObject(join(f.home, ".codex/hooks.json")).fixture).toBe(
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

// Frozen before replacing the direct-import renderer. Includes markers and provenance.
describe("render-home: public roster JSON", () => {
  test("production roster block is byte-identical to the original renderer", () => {
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
      DISPATCH_ROSTER_PATH: "/must-not-use-live-roster",
    });
    expect(result.code, result.out).toBe(0);
    const md = readFileSync(join(home, ".claude/CLAUDE.md"), "utf8");
    const block = md.slice(
      md.indexOf("<!-- roster:begin -->"),
      md.indexOf("<!-- roster:end -->") + "<!-- roster:end -->".length,
    );
    const original = readFileSync(
      join(import.meta.dir, "fixtures/render-home-roster.md"),
      "utf8",
    ).replaceAll("agx-next/", "agx/");
    expect(Buffer.from(`${block}\n`)).toEqual(Buffer.from(original));
    expect(readFileSync(SCRIPT, "utf8")).not.toMatch(
      /from\s+["']\.\.\/agents\/models\//u,
    );
  });

  for (const [name, code] of [
    [
      "non-zero exit",
      'process.stderr.write("roster unavailable"); process.exit(7);',
    ],
    ["invalid JSON", 'process.stdout.write("not JSON");'],
    ["invalid JSON shape", 'process.stdout.write("{}");'],
    [
      "missing objective",
      `process.stdout.write(${JSON.stringify(ROSTER_JSON.replace(/,"objective":.*\}\n?$/u, "}\n"))});`,
    ],
    ["timeout", "await Bun.sleep(60_000);"],
  ] as const) {
    test(`roster CLI ${name} preserves every deployed file`, () => {
      const dotfiles = makeDotfiles({ model: "opus" });
      const home = makeHome();
      using _cleanup = {
        [Symbol.dispose]: () => {
          cleanup(dotfiles, home);
        },
      };
      const first = run({ HOME: home, DOTFILES: dotfiles });
      expect(first.code, first.out).toBe(0);
      const paths = [
        ".claude/settings.json",
        ".codex/hooks.json",
        ".claude/CLAUDE.md",
        ".config/dotfiles/brew-prefix",
      ].map((path) => join(home, path));
      const before = paths.map((path) => ({ path, bytes: readFileSync(path) }));
      writeRosterCli(dotfiles, code);
      const failed = run({ HOME: home, DOTFILES: dotfiles });
      expect(failed.code, failed.out).toBe(1);
      expect(failed.out).toContain("FATAL:");
      for (const { path, bytes } of before) {
        expect(readFileSync(path)).toEqual(bytes);
      }
    }, 15_000);
  }
});
