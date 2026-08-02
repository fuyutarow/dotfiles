// bun test characterizing the `cc:install-mcp` port (scripts/install-mcp.ts) against the
// ORIGINAL shell body's behavior (see mise.toml's replaced run body / the behavior oracle this
// port was built from). Every fixture is a throwaway tmp .mcp.json plus fake claude/codex/uv
// binaries — the real claude/codex CLIs are NEVER invoked by these tests (Safety rule).
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPlan,
  commOnlyInSecond,
  jqOr,
  loadMcpServers,
  shellWords,
} from "../install-mcp.ts";

const SCRIPT = join(import.meta.dir, "..", "install-mcp.ts");
const FAKE_CLAUDE = join(import.meta.dir, "fake-claude.ts");
const FAKE_CODEX = join(import.meta.dir, "fake-codex.ts");
const FAKE_UV = join(import.meta.dir, "fake-uv.ts");
const NO_CODEX = "/nonexistent/codex-bin"; // simulates "codex not installed"

type ServersFixture = Record<string, Record<string, unknown>>;

function makeDotfiles(servers: ServersFixture): string {
  const dir = mkdtempSync(join(tmpdir(), "install-mcp-dotfiles-"));
  writeFileSync(
    join(dir, ".mcp.json"),
    JSON.stringify({ mcpServers: servers }, null, 2),
  );
  return dir;
}

function cleanup(...dirs: string[]): void {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

// For the `--home`/`$DOTFILES=""` fallback test: a fixture HOME whose `dotfiles` subdirectory
// holds .mcp.json, so `${home}/dotfiles` (the fallback shape) resolves to a real fixture path.
function makeHomeWithDotfiles(servers: ServersFixture): {
  home: string;
  dotfiles: string;
} {
  const home = mkdtempSync(join(tmpdir(), "install-mcp-home-"));
  const dotfiles = join(home, "dotfiles");
  mkdirSync(dotfiles);
  writeFileSync(
    join(dotfiles, ".mcp.json"),
    JSON.stringify({ mcpServers: servers }, null, 2),
  );
  return { home, dotfiles };
}

function run(
  args: string[],
  env: Record<string, string | undefined> = {},
): { out: string; code: number } {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args], {
    env: { ...process.env, ...env },
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

// Default bin args wired to the fixtures, with ccc already "present" (fixture-uv's own file
// exists on disk) so most tests don't have to think about the ccc/uv bootstrap step at all.
function baseArgs(dotfiles: string, extra: string[] = []): string[] {
  return [
    "--dotfiles",
    dotfiles,
    "--claude-bin",
    FAKE_CLAUDE,
    "--codex-bin",
    FAKE_CODEX,
    "--uv-bin",
    FAKE_UV,
    "--ccc-bin",
    FAKE_UV, // any existing file path proves "ccc present" without running uv
    ...extra,
  ];
}

describe("install-mcp: argv contract", () => {
  test("lets Cleye strictFlags reject an ordinary unknown before running any command", () => {
    const { out, code } = run(["--wat"]);

    expect(code).toBe(1);
    expect(out).toContain("Error: Unknown flag: --wat.");
    expect(out).not.toContain("applied ");
  });

  test("rejects --__proto__ before running any command", () => {
    const { out, code } = run(["--__proto__"]);

    expect(code).toBe(2);
    expect(out).toContain("Unknown option '--__proto__'");
    expect(out).not.toContain("applied ");
  });

  test("rejects every String flag with no value", () => {
    for (const flag of [
      "--dotfiles",
      "--home",
      "--claude-bin",
      "--codex-bin",
      "--uv-bin",
      "--ccc-bin",
    ]) {
      const { out, code } = run([flag]);

      expect(code).toBe(2);
      expect(out).toContain(`${flag} requires a value`);
      expect(out).not.toContain("applied ");
    }
  });
});

describe("install-mcp: pure helpers", () => {
  test("jqOr falls back on null/false/undefined, not on other falsy-ish JS values", () => {
    expect(jqOr(undefined, "stdio")).toBe("stdio");
    expect(jqOr(null, "stdio")).toBe("stdio");
    expect(jqOr(false, "stdio")).toBe("stdio");
    expect(jqOr("http", "stdio")).toBe("http");
    expect(jqOr(0, "stdio")).toBe("0"); // jq's `//` does NOT treat 0 or "" as absent
    expect(jqOr("", "stdio")).toBe("");
  });

  test("shellWords collapses IFS whitespace and drops empty tokens", () => {
    expect(shellWords("-y @upstash/context7-mcp")).toEqual([
      "-y",
      "@upstash/context7-mcp",
    ]);
    expect(shellWords("")).toEqual([]);
    expect(shellWords("  a   b  ")).toEqual(["a", "b"]);
  });

  test("commOnlyInSecond mirrors `comm -13` on two pre-sorted arrays, duplicates included", () => {
    expect(commOnlyInSecond(["a", "b"], ["a", "b", "c"])).toEqual(["c"]);
    expect(commOnlyInSecond([], ["a", "a", "b"])).toEqual(["a", "a", "b"]);
    expect(commOnlyInSecond(["a"], ["a", "a"])).toEqual(["a"]); // one match consumes one dup
  });

  test("loadMcpServers returns {} (not a throw) for a missing or malformed .mcp.json", () => {
    expect(loadMcpServers("/nonexistent/.mcp.json")).toEqual({});
    const dir = mkdtempSync(join(tmpdir(), "install-mcp-bad-"));
    writeFileSync(join(dir, ".mcp.json"), "{ not json");
    expect(loadMcpServers(join(dir, ".mcp.json"))).toEqual({});
    cleanup(dir);
  });

  test("buildPlan: display is a raw `${cmd} ${args}` concatenation, not the exec token list", () => {
    const plan = buildPlan("context7", {
      type: "stdio",
      command: "bunx",
      args: ["-y", "@upstash/context7-mcp"],
    });
    expect(plan.display).toBe("bunx -y @upstash/context7-mcp");
    expect(plan.execTokens).toEqual(["bunx", "-y", "@upstash/context7-mcp"]);
    expect(plan.url).toBe("");
  });

  test("buildPlan: a url-bearing entry's display is just the url", () => {
    const plan = buildPlan("exa", {
      type: "http",
      url: "https://mcp.exa.ai/mcp",
    });
    expect(plan.display).toBe("https://mcp.exa.ai/mcp");
  });
});

describe("install-mcp: happy path registration", () => {
  test("registers every declared server, alphabetically, with matching add/registered lines", () => {
    const dotfiles = makeDotfiles({
      exa: { type: "http", url: "https://mcp.exa.ai/mcp" },
      context7: {
        type: "stdio",
        command: "bunx",
        args: ["-y", "@upstash/context7-mcp"],
      },
    });
    const { out, code } = run(baseArgs(dotfiles), { FAKE_CLAUDE_LIST: "" });
    expect(code).toBe(0);

    // alphabetical: context7 before exa, regardless of file order
    const posContext7 = out.indexOf("registered: context7");
    const posExa = out.indexOf("registered: exa");
    expect(posContext7).toBeGreaterThan(-1);
    expect(posExa).toBeGreaterThan(posContext7);

    expect(out).toContain(
      "registered: context7 (bunx -y @upstash/context7-mcp)",
    );
    expect(out).toContain("registered: exa (https://mcp.exa.ai/mcp)");
    expect(out).toContain(
      "CALL claude mcp add -s user context7 -- bunx -y @upstash/context7-mcp",
    );
    expect(out).toContain(
      "CALL claude mcp add -s user --transport http exa https://mcp.exa.ai/mcp",
    );
    expect(out).toContain(
      `applied ${dotfiles}/.mcp.json -> Claude(user) + Codex`,
    );
    expect(out).toContain(
      "tip: run 'ccc index <repo>' once to warm cocoindex-code's embedding model.",
    );
    cleanup(dotfiles);
  });

  test("remove always precedes add for a given server", () => {
    const dotfiles = makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const { out, code } = run(baseArgs(dotfiles), { FAKE_CLAUDE_LIST: "" });
    expect(code).toBe(0);
    const posRemove = out.indexOf("CALL claude mcp remove -s user fetch");
    const posAdd = out.indexOf("CALL claude mcp add -s user fetch");
    expect(posRemove).toBeGreaterThan(-1);
    expect(posAdd).toBeGreaterThan(posRemove);
    cleanup(dotfiles);
  });

  test("codex mirrors the same registrations when codex-bin resolves", () => {
    const dotfiles = makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const { out, code } = run(baseArgs(dotfiles), { FAKE_CLAUDE_LIST: "" });
    expect(code).toBe(0);
    expect(out).toContain("CALL codex mcp remove fetch");
    expect(out).toContain("CALL codex mcp add fetch -- uvx mcp-server-fetch");
    cleanup(dotfiles);
  });

  test("codex is skipped entirely (no remove, no add) when codex-bin does not resolve", () => {
    const dotfiles = makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const { out, code } = run(
      baseArgs(dotfiles).map((a) => (a === FAKE_CODEX ? NO_CODEX : a)),
      { FAKE_CLAUDE_LIST: "" },
    );
    expect(code).toBe(0);
    expect(out).not.toContain("CALL codex");
    expect(out).toContain("registered: fetch");
    cleanup(dotfiles);
  });

  test("a remove failure (claude or codex) is ignored — registration still completes", () => {
    const dotfiles = makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const { out, code } = run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "",
      FAKE_CLAUDE_FAIL_REMOVE: "fetch",
      FAKE_CODEX_FAIL_REMOVE: "fetch",
    });
    expect(code).toBe(0);
    expect(out).toContain("registered: fetch (uvx mcp-server-fetch)");
    cleanup(dotfiles);
  });
});

describe("install-mcp: add failure aborts (set -e parity)", () => {
  test("a failed claude add stops the run before any later (alphabetical) server registers", () => {
    const dotfiles = makeDotfiles({
      alpha: { type: "stdio", command: "uvx", args: ["a"] },
      zeta: { type: "stdio", command: "uvx", args: ["z"] },
    });
    const { out, code } = run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "",
      FAKE_CLAUDE_FAIL_ADD: "alpha",
    });
    // The fixture's own default failure code happens to be 1 here — the dedicated test below
    // proves this isn't a coincidental hardcoded 1 by using a distinctive non-1 code.
    expect(code).toBe(1);
    // The original `set -eu` body never printed a message of its own on abort — only the
    // failing command's own (inherited) stderr, asserted below.
    expect(out).not.toContain("FATAL:");
    expect(out).toContain("fake claude: add failed: alpha");
    expect(out).not.toContain("registered: alpha");
    expect(out).not.toContain("registered: zeta"); // never reached: script aborted at "alpha"
    expect(out).not.toContain("applied ");
    cleanup(dotfiles);
  });

  test("the aborting command's OWN exit code propagates verbatim, never collapsed to 1", () => {
    const dotfiles = makeDotfiles({
      alpha: { type: "stdio", command: "uvx", args: ["a"] },
    });
    const { out, code } = run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "",
      FAKE_CLAUDE_FAIL_ADD: "alpha",
      FAKE_CLAUDE_FAIL_ADD_EXITCODE: "42",
    });
    expect(code).toBe(42);
    expect(out).not.toContain("FATAL:");
    expect(out).toContain("fake claude: add failed: alpha");
    cleanup(dotfiles);
  });
});

describe("install-mcp: ccc/uv bootstrap", () => {
  test("ccc present: uv is never invoked", () => {
    const dotfiles = makeDotfiles({});
    const { out, code } = run(baseArgs(dotfiles), { FAKE_CLAUDE_LIST: "" });
    expect(code).toBe(0);
    expect(out).not.toContain("CALL uv");
    cleanup(dotfiles);
  });

  test("ccc absent: uv tool install runs before any server is touched", () => {
    const dotfiles = makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const args = baseArgs(dotfiles).map((a, i, arr) =>
      arr[i - 1] === "--ccc-bin" ? "/nonexistent/ccc" : a,
    );
    const { out, code } = run(args, { FAKE_CLAUDE_LIST: "" });
    expect(code).toBe(0);
    expect(out).toContain(
      "CALL uv tool install --upgrade cocoindex-code[full]",
    );
    expect(out.indexOf("CALL uv")).toBeLessThan(
      out.indexOf("registered: fetch"),
    );
    cleanup(dotfiles);
  });

  test("ccc absent + a failing uv install aborts before touching any server", () => {
    const dotfiles = makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const args = baseArgs(dotfiles).map((a, i, arr) =>
      arr[i - 1] === "--ccc-bin" ? "/nonexistent/ccc" : a,
    );
    const { out, code } = run(args, {
      FAKE_CLAUDE_LIST: "",
      FAKE_UV_FAIL: "1",
    });
    // Fixture's default failure code (1) — same set -eu abort path as the claude-add case above,
    // whose dedicated test proves real-code propagation with a non-1 value.
    expect(code).toBe(1);
    expect(out).not.toContain("FATAL:"); // no message of its own on this abort path
    expect(out).toContain("fake uv: install failed");
    expect(out).not.toContain("registered:");
    expect(out).not.toContain("CALL claude");
    cleanup(dotfiles);
  });
});

describe("install-mcp: drift report", () => {
  test("no drift: nothing printed when live registrations exactly match .mcp.json", () => {
    const dotfiles = makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const { out, code } = run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "fetch: uvx mcp-server-fetch - Connected\n",
    });
    expect(code).toBe(0);
    expect(out).not.toContain("DRIFT");
    cleanup(dotfiles);
  });

  test("drift: a live registration absent from .mcp.json is reported, not removed, by default", () => {
    const dotfiles = makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const { out, code } = run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST:
        "fetch: uvx mcp-server-fetch - Connected\nghost-server: some old thing - Connected\n",
    });
    expect(code).toBe(0);
    expect(out).toContain(
      "--- DRIFT: registered but NOT declared in .mcp.json ---",
    );
    expect(out).toContain("  ghost-server");
    expect(out).toContain(
      "(declare them in .mcp.json, or re-run with MCP_PRUNE=1 to uninstall them)",
    );
    expect(out).toContain(
      "NOTE: .mcp.json is documented as the single source of truth",
    );
    expect(out).not.toContain("pruned:");
    cleanup(dotfiles);
  });

  test("junk lines in `claude mcp list` (headers, bracketed sections) are not mistaken for names", () => {
    const dotfiles = makeDotfiles({});
    const { out, code } = run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST:
        "Checking MCP server health…\n\nghost: something - Connected\n\n[Conflicting scopes]\nFor help configuring MCP servers, see: https://x\n",
    });
    expect(code).toBe(0);
    expect(out).toContain("  ghost");
    // only one drift entry despite the extra non-matching lines
    expect(
      out
        .split("\n")
        .filter(
          (l) =>
            l.startsWith("  ") && !l.includes("NOTE") && !l.includes("declare"),
        ).length,
    ).toBe(1);
    cleanup(dotfiles);
  });

  test("a pathological `claude mcp list` line with an empty captured name (sed parity) is not silently dropped", () => {
    // sed's `s/^\([a-zA-Z0-9_-]*\): .*/\1/p` has no length check on the capture group: a line
    // starting with just ": " captures a ZERO-length name, and sed still emits (and
    // `sort`/`comm` still process) that blank line — no `n.length > 0` filter in the original.
    const dotfiles = makeDotfiles({});
    const { out, code } = run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: ": some headerless entry - Connected\n",
    });
    expect(code).toBe(0);
    expect(out).toContain(
      "--- DRIFT: registered but NOT declared in .mcp.json ---",
    );
    const driftNameLines = out
      .split("\n")
      .filter(
        (l) =>
          l.startsWith("  ") && !l.includes("NOTE") && !l.includes("declare"),
      );
    expect(driftNameLines).toEqual(["  "]); // "  " + empty-string name, not dropped
    cleanup(dotfiles);
  });

  test("MCP_PRUNE=1 removes undeclared registrations from both claude and codex", () => {
    const dotfiles = makeDotfiles({});
    const { out, code } = run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "ghost-server: some old thing - Connected\n",
      MCP_PRUNE: "1",
    });
    expect(code).toBe(0);
    expect(out).toContain("CALL claude mcp remove -s user ghost-server");
    expect(out).toContain("CALL codex mcp remove ghost-server");
    expect(out).toContain("  pruned: ghost-server");
    expect(out).not.toContain("declare them in .mcp.json");
    cleanup(dotfiles);
  });
});

describe("install-mcp: --dry-run", () => {
  test("performs zero mutating calls and prefixes every planned action with [dry-run]", () => {
    const dotfiles = makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
      exa: { type: "http", url: "https://mcp.exa.ai/mcp" },
    });
    const args = baseArgs(dotfiles).map((a, i, arr) =>
      arr[i - 1] === "--ccc-bin" ? "/nonexistent/ccc" : a,
    );
    const { out, code } = run([...args, "--dry-run"], {
      FAKE_CLAUDE_LIST: "ghost: x - Connected\n",
      MCP_PRUNE: "1",
    });
    expect(code).toBe(0);
    expect(out).toContain("[dry-run] would run: ");
    expect(out).not.toContain("CALL uv"); // uv never actually invoked
    expect(out).not.toContain("CALL claude mcp remove"); // remove/add never actually invoked
    expect(out).not.toContain("CALL claude mcp add");
    expect(out).not.toContain("CALL codex");
    // `claude mcp list`'s own stdout is piped (not inherited) and consumed internally for the
    // diff — it was never echoed by the original shell either (captured via `$(...)`), so its
    // effect is only observable through the drift report it produces, asserted below.
    expect(out).toContain("registered: fetch");
    expect(out).toContain("registered: exa");
    expect(out).toContain("[dry-run] would run: /"); // uv would-run line present
    expect(out).toContain(
      "--- DRIFT: registered but NOT declared in .mcp.json ---",
    );
    expect(out).toContain("  ghost");
    cleanup(dotfiles);
  });
});

describe("install-mcp: root argumentization / defaults", () => {
  test("--dotfiles defaults to $DOTFILES env var when the flag is omitted", () => {
    const dotfiles = makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const proc = Bun.spawnSync(
      [
        "bun",
        SCRIPT,
        "--claude-bin",
        FAKE_CLAUDE,
        "--codex-bin",
        FAKE_CODEX,
        "--uv-bin",
        FAKE_UV,
        "--ccc-bin",
        FAKE_UV,
      ],
      {
        env: { ...process.env, DOTFILES: dotfiles, FAKE_CLAUDE_LIST: "" },
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const out = proc.stdout.toString() + proc.stderr.toString();
    expect(proc.exitCode).toBe(0);
    expect(out).toContain(
      `applied ${dotfiles}/.mcp.json -> Claude(user) + Codex`,
    );
    cleanup(dotfiles);
  });

  test("an exported-but-empty $DOTFILES falls back to $HOME/dotfiles, not to the literal empty string", () => {
    // Mirrors bash `${DOTFILES:-$HOME/dotfiles}`, which falls back on unset OR empty — a plain
    // `??` against `process.env.DOTFILES` would NOT fall back here, since "" is neither null nor
    // undefined, and would wrongly resolve dotfiles to "/.mcp.json" (repo-root-relative "").
    const { home, dotfiles } = makeHomeWithDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const proc = Bun.spawnSync(
      [
        "bun",
        SCRIPT,
        "--home",
        home,
        "--claude-bin",
        FAKE_CLAUDE,
        "--codex-bin",
        FAKE_CODEX,
        "--uv-bin",
        FAKE_UV,
        "--ccc-bin",
        FAKE_UV,
      ],
      {
        env: { ...process.env, DOTFILES: "", FAKE_CLAUDE_LIST: "" },
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const out = proc.stdout.toString() + proc.stderr.toString();
    expect(proc.exitCode).toBe(0);
    expect(out).toContain(
      `applied ${dotfiles}/.mcp.json -> Claude(user) + Codex`,
    );
    expect(out).toContain("registered: fetch");
    cleanup(home);
  });

  test("a missing .mcp.json is swallowed: zero registrations, no abort, applied+tip still print", () => {
    const dotfiles = mkdtempSync(join(tmpdir(), "install-mcp-empty-"));
    const { out, code } = run(baseArgs(dotfiles), { FAKE_CLAUDE_LIST: "" });
    expect(code).toBe(0);
    expect(out).not.toContain("registered:");
    expect(out).toContain(
      `applied ${dotfiles}/.mcp.json -> Claude(user) + Codex`,
    );
    expect(out).toContain("tip: run 'ccc index <repo>'");
    cleanup(dotfiles);
  });
});
