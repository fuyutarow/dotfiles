// bun test for scripts/render-home.ts — the generator of $HOME's rendered half: settings.json
// (so `autoMode`, user-scope-only and machine-specific, stays effective without publishing a
// private project's structure through this public repo), codex hooks.json and CLAUDE.md.
// Every fixture is a throwaway tmp tree passed via env; the real $HOME is never touched.
// The cases that matter are the failure modes: this file carries every security hook, so a
// truncated render or a silently-dropped private rule is the damage to prevent.
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

const SCRIPT = join(import.meta.dir, "..", "render-home.ts");
const ROOT = join(import.meta.dir, "..", "..");

function run(env: Record<string, string>): { out: string; code: number } {
  const proc = Bun.spawnSync(["bun", SCRIPT], {
    env: { ...process.env, ...env },
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

/** The other inputs render-home.ts reads, as minimal fixtures: an empty-hooks codex file, a
 * CLAUDE.md that is only the roster markers, the real roster, and a one-hook registry. */
function writeOtherInputs(dir: string): void {
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
  mkdirSync(join(dir, "agents", "hooks"), { recursive: true });
  writeFileSync(join(dir, "agents", "hooks", "gate.ts"), "// fixture\n");
  writeFileSync(
    join(dir, "agents", "hooks", "hooks.toml"),
    '[[hook]]\nscript = "gate.ts"\nevent = "PreToolUse"\nmatcher = "Bash"\nfail_closed = true\nvendors = ["claude", "codex"]\n',
  );
}

const GATE = {
  matcher: "Bash",
  hooks: [
    {
      type: "command",
      command: "sh ~/.agents/hooks/run.sh --fail-closed gate.ts",
    },
  ],
};

/** A dotfiles fixture: the committed base settings plus the other inputs. */
function makeDotfiles(base: object): string {
  const dir = mkdtempSync(join(tmpdir(), "render-settings-dotfiles-"));
  mkdirSync(join(dir, "agents", "claude"), { recursive: true });
  writeFileSync(
    join(dir, "agents", "claude", "settings.json"),
    `${JSON.stringify(base, null, 2)}\n`,
  );
  writeOtherInputs(dir);
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

describe("render-home: base only", () => {
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
    for (const text of [
      "promise block",
      "kind/labels",
      ".agents/tickets",
      "agx ticket new",
      "agx ticket ls",
      "agx ticket lint",
      "Grader split/clarify verdicts warn",
      "agx ps [--all] [--json]",
      "agx ledger gc [--dry-run]",
      "agx dispatch --detach",
      "agx dispatch --verbose",
    ])
      expect(policy).toContain(text);
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
      /^# policy\n\n<!-- roster:begin -->\n<!-- RENDERED [^\n]*-->\n  Run control:[^\n]*\n  Durable\/noise controls:[^\n]*\n- \*\*Every dispatch goes through/u,
    );
    expect(md).toContain(
      "| default | id | route | AA | TB4 | SciCode | $in/cache/out | cost | use for |",
    );
    expect(md).toContain(
      "Objective: maximize this ticket's expected accepted-returns-per-hour: expected acceptance rate multiplied by 3600 and divided by expected time to first return, using the comparable-ticket tradeoff line (same capability tags and size class from writes-glob count and brief length). Weigh comparable-ticket median time to first return, timeout rate, accepted rate, and cost per accepted ahead of overall records and benchmark scores. Each row marks the best observed expected throughput; when comparable history is little, treat it as uncertainty and do not silently substitute overall averages. Choose the lowest effort that does not lower that throughput; xhigh/max only when the ticket names a capability lower effort measurably lacks. Among rows within noise of each other, pick the cheaper, and when a codex and a claude row are comparable, pick codex. Cost excludes a row only when its expected cost exceeds the ticket's declared budget.",
    );
    expect(md).toContain("hard worker bound defaults to 600 seconds");
    expect(md).toContain("outcome `returned`");
    expect(md).toContain("--sandbox none|read-only|workspace-write");
    expect(md).toContain("workers that need network or ssh");
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
