// bun test for scripts/one-writer-check.ts (INV-8: one writer per file). The negative half matters:
// each violation kind must fail on its own, and all of them must be reported in one run.
import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "one-writer-check.ts");
const OWNED = {
  matcher: "Bash",
  hooks: [
    {
      type: "command",
      command: "sh ~/.agents/hooks/run.sh --fail-closed g.ts",
    },
  ],
};
const MINE = {
  hooks: [{ type: "command", command: "sh ~/.claude/hooks/run.sh mine.ts" }],
};
const MARKERS = "<!-- roster:begin -->\n<!-- note -->\n<!-- roster:end -->\n";

function fixture(opts: {
  claudeHooks?: object;
  codexHooks?: object;
  md?: string;
}): { root: string; home: string } {
  const root = mkdtempSync(join(tmpdir(), "one-writer-root-"));
  const home = mkdtempSync(join(tmpdir(), "one-writer-home-"));
  mkdirSync(join(root, "agents", "claude"), { recursive: true });
  mkdirSync(join(root, "agents", "codex"), { recursive: true });
  writeFileSync(
    join(root, "agents", "claude", "settings.json"),
    JSON.stringify({ hooks: opts.claudeHooks ?? { Stop: [MINE] } }),
  );
  writeFileSync(
    join(root, "agents", "codex", "hooks.json"),
    JSON.stringify({ hooks: opts.codexHooks ?? {} }),
  );
  writeFileSync(
    join(root, "agents", "claude", "CLAUDE.md"),
    `# p\n\n${opts.md ?? MARKERS}`,
  );
  return { root, home };
}

function check(f: { root: string; home: string }) {
  const r = Bun.spawnSync(["bun", SCRIPT], {
    env: { ...process.env, DOTFILES: f.root, HOME: f.home },
  });
  rmSync(f.root, { recursive: true, force: true });
  rmSync(f.home, { recursive: true, force: true });
  return { out: r.stdout.toString(), code: r.exitCode };
}

describe("one-writer-check", () => {
  test("hand-written entries and bare markers pass", () => {
    const r = check(fixture({}));
    expect(r.code).toBe(0);
    expect(r.out).toContain("one writer:");
  });

  test("a registry-owned hook in a committed vendor file fails", () => {
    const r = check(fixture({ codexHooks: { PreToolUse: [OWNED] } }));
    expect(r.code).toBe(1);
    expect(r.out).toContain("two writers: agents/codex/hooks.json: PreToolUse");
  });

  test("rendered roster lines inside the CLAUDE.md block fail", () => {
    const md = "<!-- roster:begin -->\n| pick | id |\n<!-- roster:end -->\n";
    const r = check(fixture({ md }));
    expect(r.code).toBe(1);
    expect(r.out).toContain("1 line(s) inside the roster block");
  });

  test("a deployed path that is still a symlink fails", () => {
    const f = fixture({});
    mkdirSync(join(f.home, ".claude"), { recursive: true });
    symlinkSync(
      join(f.root, "agents", "claude", "CLAUDE.md"),
      join(f.home, ".claude", "CLAUDE.md"),
    );
    const r = check(f);
    expect(r.code).toBe(1);
    expect(r.out).toContain("~/.claude/CLAUDE.md: a symlink");
  });

  test("every violation is reported in one run, not the first", () => {
    const r = check(
      fixture({
        claudeHooks: { PreToolUse: [OWNED] },
        codexHooks: { PreToolUse: [OWNED] },
        md: "<!-- roster:begin -->\nx\n<!-- roster:end -->\n",
      }),
    );
    expect(r.code).toBe(1);
    expect(
      r.out.split("\n").filter((l) => l.startsWith("two writers:")),
    ).toHaveLength(3);
  });
});
