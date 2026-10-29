// bun test characterizing the `cc:install-mcp` port (scripts/install-mcp.ts) against the
// ORIGINAL shell body's behavior (see mise.toml's replaced run body / the behavior oracle this
// port was built from). Every fixture is a throwaway tmp .mcp.json plus fake claude/codex/uv
// binaries — the real claude/codex CLIs are NEVER invoked by these tests (Safety rule).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPlan,
  commOnlyInSecond,
  jqOr,
  loadMcpServers,
  partitionAvailableServers,
  shellWords,
} from "../install-mcp.ts";

const SCRIPT = join(import.meta.dir, "..", "install-mcp.ts");
const FAKE_CLAUDE = join(import.meta.dir, "fake-claude-mcp.ts");
const FAKE_CODEX = join(import.meta.dir, "fake-codex.ts");
const FAKE_UV = join(import.meta.dir, "fake-uv.ts");
const NO_CODEX = "/nonexistent/codex-bin"; // simulates "codex not installed"
setDefaultTimeout(20_000);

type ServersFixture = Record<string, Record<string, unknown>>;

async function makeDotfiles(servers: ServersFixture): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "install-mcp-dotfiles-"));
  await writeFile(
    join(dir, ".mcp.json"),
    JSON.stringify({ mcpServers: servers }, null, 2),
  );
  return dir;
}

async function cleanup(...dirs: string[]): Promise<void> {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
}

// For the `--home`/`$DOTFILES=""` fallback test: a fixture HOME whose `dotfiles` subdirectory
// holds .mcp.json, so `${home}/dotfiles` (the fallback shape) resolves to a real fixture path.
async function makeHomeWithDotfiles(servers: ServersFixture): Promise<{
  home: string;
  dotfiles: string;
}> {
  const home = await mkdtemp(join(tmpdir(), "install-mcp-home-"));
  const dotfiles = join(home, "dotfiles");
  await mkdir(dotfiles);
  await writeFile(
    join(dotfiles, ".mcp.json"),
    JSON.stringify({ mcpServers: servers }, null, 2),
  );
  return { home, dotfiles };
}

async function run(
  args: string[],
  env: Record<string, string | undefined> = {},
): Promise<{ out: string; code: number }> {
  // Deployment now installs the owned ccc entry. Every fixture must have its own home.
  const home = await mkdtemp(join(tmpdir(), "install-mcp-run-home-"));
  const fixtureArgs = [...args];
  if (!fixtureArgs.includes("--home")) fixtureArgs.push("--home", home);
  const uvIndex = fixtureArgs.indexOf("--uv-bin") + 1;
  if (fixtureArgs[uvIndex] === FAKE_UV) {
    const uv = join(home, "uv");
    await writeFile(
      uv,
      `#!${process.execPath}
import { mkdirSync, symlinkSync } from 'node:fs';
const child = Bun.spawn([${JSON.stringify(FAKE_UV)}, ...Bun.argv.slice(2)], { stdout: 'inherit', stderr: 'inherit' });
const code = await child.exited;
if (code === 0) {
  mkdirSync(${JSON.stringify(join(home, ".local/bin"))}, { recursive: true });
  symlinkSync(${JSON.stringify(FAKE_UV)}, ${JSON.stringify(join(home, ".local/bin/ccc"))});
}
process.exit(code);
`,
    );
    await chmod(uv, 0o755);
    fixtureArgs[uvIndex] = uv;
  }
  const proc = await spawn(["bun", SCRIPT, ...fixtureArgs], {
    env: { ...process.env, ...env },
    maxBuffer: 4 * 1024 * 1024,
  });
  await cleanup(home);
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
  test("lets Cleye strictFlags reject an ordinary unknown before running any command", async () => {
    const { out, code } = await run(["--wat"]);

    expect(code).toBe(1);
    expect(out).toContain("Error: Unknown flag: --wat.");
    expect(out).not.toContain("applied ");
  });

  test("rejects --__proto__ before running any command", async () => {
    const { out, code } = await run(["--__proto__"]);

    expect(code).toBe(2);
    expect(out).toContain("Unknown option '--__proto__'");
    expect(out).not.toContain("applied ");
  });

  test("rejects every String flag with no value", async () => {
    for (const flag of [
      "--dotfiles",
      "--home",
      "--claude-bin",
      "--codex-bin",
      "--uv-bin",
      "--ccc-bin",
    ]) {
      const { out, code } = await run([flag]);

      expect(code).toBe(2);
      expect(out).toContain(`${flag} requires a value`);
      expect(out).not.toContain("applied ");
    }
  }, 40_000);
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

  test("loadMcpServers returns {} (not a throw) for a missing or malformed .mcp.json", async () => {
    expect(await loadMcpServers("/nonexistent/.mcp.json")).toEqual({});
    const dir = await mkdtemp(join(tmpdir(), "install-mcp-bad-"));
    await writeFile(join(dir, ".mcp.json"), "{ not json");
    expect(await loadMcpServers(join(dir, ".mcp.json"))).toEqual({});
    await cleanup(dir);
  });

  test("buildPlan: display is a raw template-literal concatenation, not the exec token list", () => {
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

  test("missing runtime skips only its server with a named reason", async () => {
    const lookup: string[] = [];
    const result = await partitionAvailableServers(
      {
        fetch: { command: "uvx", args: ["mcp-server-fetch"] },
        context7: { command: "bunx", args: ["context7"] },
        exa: { type: "http", url: "https://mcp.exa.ai/mcp" },
      },
      async (tool) => {
        await Promise.resolve();
        lookup.push(tool);
        return tool !== "uv";
      },
    );

    expect(lookup).toEqual(["uv", "bun"]);
    expect(result.skipped).toEqual([
      { name: "fetch", command: "uvx", missingTool: "uv" },
    ]);
    expect(Object.keys(result.available).toSorted()).toEqual([
      "context7",
      "exa",
    ]);
  });
});

describe("install-mcp: happy path registration", () => {
  test("registers every declared server, alphabetically, with matching add/registered lines", async () => {
    const dotfiles = await makeDotfiles({
      exa: { type: "http", url: "https://mcp.exa.ai/mcp" },
      context7: {
        type: "stdio",
        command: "bunx",
        args: ["-y", "@upstash/context7-mcp"],
      },
    });
    const { out, code } = await run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "",
    });
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
      `applied ${dotfiles}/.mcp.json -> Claude(user); codex:config owns Codex MCP entries`,
    );
    expect(out).toContain("tip: run 'rr index'");
    await cleanup(dotfiles);
  });

  test("remove always precedes add for a given server", async () => {
    const dotfiles = await makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const { out, code } = await run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "",
    });
    expect(code).toBe(0);
    const posRemove = out.indexOf("CALL claude mcp remove -s user fetch");
    const posAdd = out.indexOf("CALL claude mcp add -s user fetch");
    expect(posRemove).toBeGreaterThan(-1);
    expect(posAdd).toBeGreaterThan(posRemove);
    await cleanup(dotfiles);
  });

  test("Codex registration is left to codex:config even when codex-bin resolves", async () => {
    const dotfiles = await makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const { out, code } = await run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "",
    });
    expect(code).toBe(0);
    expect(out).not.toContain("CALL codex");
    await cleanup(dotfiles);
  });

  test("Codex-bin availability does not affect Claude's declarative installation", async () => {
    const dotfiles = await makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const { out, code } = await run(
      baseArgs(dotfiles).map((a) => (a === FAKE_CODEX ? NO_CODEX : a)),
      { FAKE_CLAUDE_LIST: "" },
    );
    expect(code).toBe(0);
    expect(out).not.toContain("CALL codex");
    expect(out).toContain("registered: fetch");
    await cleanup(dotfiles);
  });

  test("a remove failure (claude or codex) is ignored — registration still completes", async () => {
    const dotfiles = await makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const { out, code } = await run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "",
      FAKE_CLAUDE_FAIL_REMOVE: "fetch",
      FAKE_CODEX_FAIL_REMOVE: "fetch",
    });
    expect(code).toBe(0);
    expect(out).toContain("registered: fetch (uvx mcp-server-fetch)");
    await cleanup(dotfiles);
  });
});

describe("install-mcp: add failure aborts (set -e parity)", () => {
  test("a failed claude add stops the run before any later (alphabetical) server registers", async () => {
    const dotfiles = await makeDotfiles({
      alpha: { type: "stdio", command: "uvx", args: ["a"] },
      zeta: { type: "stdio", command: "uvx", args: ["z"] },
    });
    const { out, code } = await run(baseArgs(dotfiles), {
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
    await cleanup(dotfiles);
  });

  test("the aborting command's OWN exit code propagates verbatim, never collapsed to 1", async () => {
    const dotfiles = await makeDotfiles({
      alpha: { type: "stdio", command: "uvx", args: ["a"] },
    });
    const { out, code } = await run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "",
      FAKE_CLAUDE_FAIL_ADD: "alpha",
      FAKE_CLAUDE_FAIL_ADD_EXITCODE: "42",
    });
    expect(code).toBe(42);
    expect(out).not.toContain("FATAL:");
    expect(out).toContain("fake claude: add failed: alpha");
    await cleanup(dotfiles);
  });
});

describe("install-mcp: ccc/uv bootstrap", () => {
  test("ccc present: uv is never invoked", async () => {
    const dotfiles = await makeDotfiles({});
    const { out, code } = await run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "",
    });
    expect(code).toBe(0);
    expect(out).not.toContain("CALL uv");
    await cleanup(dotfiles);
  });

  test("ccc absent: uv tool install runs before any server is touched", async () => {
    const dotfiles = await makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const args = baseArgs(dotfiles).map((a, i, arr) =>
      arr[i - 1] === "--ccc-bin" ? "/nonexistent/ccc" : a,
    );
    const { out, code } = await run(args, { FAKE_CLAUDE_LIST: "" });
    expect(code).toBe(0);
    expect(out).toContain(
      "CALL uv tool install --upgrade cocoindex-code[full]",
    );
    expect(out.indexOf("CALL uv")).toBeLessThan(
      out.indexOf("registered: fetch"),
    );
    await cleanup(dotfiles);
  });

  test("ccc absent + a failing uv install aborts before touching any server", async () => {
    const dotfiles = await makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const args = baseArgs(dotfiles).map((a, i, arr) =>
      arr[i - 1] === "--ccc-bin" ? "/nonexistent/ccc" : a,
    );
    const { out, code } = await run(args, {
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
    await cleanup(dotfiles);
  });

  test("missing uv skips its named server and continues registering other servers", async () => {
    const dotfiles = await makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
      exa: { type: "http", url: "https://mcp.exa.ai/mcp" },
    });
    const args = baseArgs(dotfiles).map((arg, i, all) =>
      all[i - 1] === "--uv-bin" || all[i - 1] === "--ccc-bin"
        ? "/nonexistent/runtime"
        : arg,
    );
    const { out, code } = await run(args, { FAKE_CLAUDE_LIST: "" });

    expect(code).toBe(0);
    expect(out).toContain(
      "skipped: cocoindex-code — missing required tool 'uv'",
    );
    expect(out).toContain(
      "skipped: fetch — missing required tool 'uv' (server command 'uvx')",
    );
    expect(out).not.toContain("registered: fetch");
    expect(out).toContain("registered: exa");
    await cleanup(dotfiles);
  });
});

describe("install-mcp: drift report", () => {
  test("no drift: nothing printed when live registrations exactly match .mcp.json", async () => {
    const dotfiles = await makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const { out, code } = await run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "fetch: uvx mcp-server-fetch - Connected\n",
    });
    expect(code).toBe(0);
    expect(out).not.toContain("DRIFT");
    await cleanup(dotfiles);
  });

  test("drift: a live registration absent from .mcp.json is reported, not removed, by default", async () => {
    const dotfiles = await makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const { out, code } = await run(baseArgs(dotfiles), {
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
    await cleanup(dotfiles);
  });

  test("junk lines in `claude mcp list` (headers, bracketed sections) are not mistaken for names", async () => {
    const dotfiles = await makeDotfiles({});
    const { out, code } = await run(baseArgs(dotfiles), {
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
    await cleanup(dotfiles);
  });

  test("a pathological `claude mcp list` line with an empty captured name (sed parity) is not silently dropped", async () => {
    // sed's `s/^\([a-zA-Z0-9_-]*\): .*/\1/p` has no length check on the capture group: a line
    // starting with just ": " captures a ZERO-length name, and sed still emits (and
    // `sort`/`comm` still process) that blank line — no `n.length > 0` filter in the original.
    const dotfiles = await makeDotfiles({});
    const { out, code } = await run(baseArgs(dotfiles), {
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
    await cleanup(dotfiles);
  });

  test("MCP_PRUNE=1 removes undeclared registrations from both claude and codex", async () => {
    const dotfiles = await makeDotfiles({});
    const { out, code } = await run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "ghost-server: some old thing - Connected\n",
      MCP_PRUNE: "1",
    });
    expect(code).toBe(0);
    expect(out).toContain("CALL claude mcp remove -s user ghost-server");
    expect(out).not.toContain("CALL codex mcp remove ghost-server");
    expect(out).toContain("  pruned: ghost-server");
    expect(out).not.toContain("declare them in .mcp.json");
    await cleanup(dotfiles);
  });
});

describe("install-mcp: --dry-run", () => {
  test("performs zero mutating calls and prefixes every planned action with [dry-run]", async () => {
    const dotfiles = await makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
      exa: { type: "http", url: "https://mcp.exa.ai/mcp" },
    });
    const args = baseArgs(dotfiles).map((a, i, arr) =>
      arr[i - 1] === "--ccc-bin" ? "/nonexistent/ccc" : a,
    );
    const { out, code } = await run([...args, "--dry-run"], {
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
    await cleanup(dotfiles);
  });
});

describe("install-mcp: root argumentization / defaults", () => {
  test("--dotfiles defaults to $DOTFILES env var when the flag is omitted", async () => {
    const dotfiles = await makeDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const proc = await spawn(
      [
        "bun",
        SCRIPT,
        "--home",
        dotfiles,
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
      `applied ${dotfiles}/.mcp.json -> Claude(user); codex:config owns Codex MCP entries`,
    );
    await cleanup(dotfiles);
  });

  test("an exported-but-empty $DOTFILES falls back to $HOME/dotfiles, not to the literal empty string", async () => {
    // Mirrors bash `${DOTFILES:-$HOME/dotfiles}`, which falls back on unset OR empty — a plain
    // `??` against `process.env.DOTFILES` would NOT fall back here, since "" is neither null nor
    // undefined, and would wrongly resolve dotfiles to "/.mcp.json" (repo-root-relative "").
    const { home, dotfiles } = await makeHomeWithDotfiles({
      fetch: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    });
    const proc = await spawn(
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
      `applied ${dotfiles}/.mcp.json -> Claude(user); codex:config owns Codex MCP entries`,
    );
    expect(out).toContain("registered: fetch");
    await cleanup(home);
  });

  test("a missing .mcp.json is swallowed: zero registrations, no abort, applied+tip still print", async () => {
    const dotfiles = await mkdtemp(join(tmpdir(), "install-mcp-empty-"));
    const { out, code } = await run(baseArgs(dotfiles), {
      FAKE_CLAUDE_LIST: "",
    });
    expect(code).toBe(0);
    expect(out).not.toContain("registered:");
    expect(out).toContain(
      `applied ${dotfiles}/.mcp.json -> Claude(user); codex:config owns Codex MCP entries`,
    );
    expect(out).toContain("tip: run 'rr index'");
    await cleanup(dotfiles);
  });
});

// Drain both pipes while waiting so a child cannot block on a full output buffer.
async function spawn(
  command: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    maxBuffer?: number;
    stdin?: Blob;
    stdout?: "pipe";
    stderr?: "pipe";
  } = {},
) {
  const proc = Bun.spawn(command, {
    ...options,
    stdin: options.stdin ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).arrayBuffer(),
    proc.exited,
  ]);
  return { stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), exitCode };
}
