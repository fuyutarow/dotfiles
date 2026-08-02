// Port of mise task `cc:install-mcp` (see mise.toml). Structural port only — same source of
// truth, same registration order, same abort-on-failure semantics, same printed lines as the
// original shell body (`set -eu`). Consumer: human/agent running `mise run cc:install-mcp` —
// output is verdict-style lines meant for eyeballing (registered/applied/DRIFT/pruned/tip), not
// a machine envelope, matching the shell original.
//
// .mcp.json (declarative source of truth) is applied into BOTH Claude Code (user scope) and
// Codex, idempotently: each declared server is removed then re-added. Two DISTINCT failure
// postures, both preserved exactly from the original `set -eu` body:
//   - every `mcp remove` is best-effort — its failure (including "binary not found") is
//     swallowed, matching the shell's `2>/dev/null || true`.
//   - every `mcp add` is NOT guarded — its failure aborts the whole run immediately (no further
//     servers get processed, no "applied" line, no drift report), matching `set -e` on an
//     unguarded statement. codex's own remove/add block only runs at all when a codex binary
//     resolves (`command -v codex`); when it doesn't, codex is skipped entirely for every server,
//     silently, not treated as a failure.
// After registration, a DRIFT REPORT (added 2026-07-25, ported as-is) compares `.mcp.json`'s
// declared names against `claude mcp list`'s live registrations; anything live-but-undeclared is
// reported, and only pruned when MCP_PRUNE=1 — the loop that enumerates `.mcp.json` itself only
// ever ADDS, so a name removed from the file is never auto-uninstalled unless opted in.
//
// A missing/malformed .mcp.json is swallowed almost everywhere in the ORIGINAL shell body: the
// key-enumeration `for name in $(jq … "$MCP_JSON")` never participates in `set -e` (a command
// substitution feeding a `for` word-list isn't the exit status of any simple command), and the
// later `declared=$(jq … | sort)` ends in `sort`, whose own exit status is what `set -e` sees —
// so jq failing produces zero servers and an empty `declared` list, NOT an abort. Preserved here
// exactly: `loadMcpServers` returns `{}` on any read/parse failure, never throws. See bugsFound.
//
// Usage: bun scripts/install-mcp.ts [--dry-run] [--dotfiles <path>] [--home <path>]
//                                    [--claude-bin <bin>] [--codex-bin <bin>] [--uv-bin <bin>]
//                                    [--ccc-bin <bin>]
//   --dotfiles defaults to $DOTFILES, else "<home>/dotfiles" (matches the shell default).
//   --home     defaults to $HOME, else os.homedir() — pass a fixture dir to test without
//              touching the real one.
//   --*-bin    default to the real command names ("claude"/"codex"/"uv"/"ccc") — override with
//              a fixture binary path to test without invoking billed/mutating real CLIs.
//   --dry-run  prints every intended `mcp remove`/`mcp add`/prune as "[dry-run] would run: …"
//              and performs zero mutating subprocess calls. `claude mcp list` still runs (it is
//              read-only) so the drift report stays accurate.
// Env:   DOTFILES (fallback root, see --dotfiles), MCP_PRUNE=1 (opt-in prune of undeclared live
//        registrations — kept as an env var, matching the original; not promoted to a flag).
// Exit:  0 success · on an aborted step (an unguarded `mcp add`/`uv tool install` failing under
//        the modeled `set -eu`), THAT command's own real exit code — never collapsed to a
//        hardcoded 1 — and nothing extra is printed (the original prints no message of its own on
//        abort beyond what the failing command already wrote to its own, inherited, stderr).
//        1 for Cleye's native ordinary-unknown-flag refusal, or for a genuinely unexpected
//        internal error with no shell analogue (FATAL on stderr only for the latter).

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { cli } from "cleye";

class UsageError extends Error {}

// Cleye 2.6.0's strictFlags misses --__proto__; reject that prototype-sensitive name at the
// pre-assignment boundary. Every ordinary unknown remains Cleye strictFlags' responsibility.
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`Unknown option '--${flag}'`);
  }
}

function nonEmptyString(flag: string): (value: string) => string {
  return (value) => {
    if (value === "") throw new UsageError(`${flag} requires a value`);
    return value;
  };
}

type ServerEntry = {
  type?: unknown;
  url?: unknown;
  command?: unknown;
  args?: unknown;
};
type McpJson = { mcpServers?: Record<string, ServerEntry> };

type Plan = {
  name: string;
  type: string;
  url: string;
  display: string;
  execTokens: string[]; // only meaningful when url === ""
};

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

// jq's `//` alternative operator falls back to its right-hand side for null AND false, not just
// "absent" — mirrored here rather than JS `??` (null/undefined only), though in practice these
// fields are never boolean in .mcp.json.
export function jqOr(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === false) return fallback;
  return String(value);
}

// Mirrors unquoted `$var` word-splitting on IFS whitespace: leading/trailing/repeated
// separators produce no empty tokens, and an empty/unset var contributes zero words.
export function shellWords(s: string): string[] {
  return s.split(/\s+/).filter((w) => w.length > 0);
}

// `comm -13 <(sorted A) <(sorted B)`: lines present in B that a one-for-one merge against A
// doesn't consume. Both inputs are assumed pre-sorted (ascending, byte/codepoint order, matching
// `sort`'s default C-ish collation for the plain alnum/hyphen/underscore names this task deals
// in); duplicates in B with no matching A entry are preserved, not deduped — same as real `comm`.
export function commOnlyInSecond(a: string[], b: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (a[i]! < b[j]!) {
      i++;
    } else {
      out.push(b[j]!);
      j++;
    }
  }
  while (j < b.length) out.push(b[j++]!);
  return out;
}

// `.mcpServers | keys[]` — jq's `keys` (unlike `keys_unsorted`) sorts alphabetically; this is
// what actually decides registration order, not the file's own key order. Verified live against
// the repo's real .mcp.json before porting.
export function loadMcpServers(
  mcpJsonPath: string,
): Record<string, ServerEntry> {
  try {
    const raw = JSON.parse(readFileSync(mcpJsonPath, "utf8")) as McpJson;
    return raw.mcpServers ?? {};
  } catch {
    return {};
  }
}

export function buildPlan(name: string, entry: ServerEntry): Plan {
  const type = jqOr(entry.type, "stdio");
  const url = jqOr(entry.url, "");
  const cmd = jqOr(entry.command, "");
  const argsArray = Array.isArray(entry.args)
    ? entry.args.map((x) => String(x))
    : [];
  const argsJoined = argsArray.join(" ");
  // `${url:-$cmd $args}` inside the echo's double quotes: parameter-expansion defaulting, NOT
  // unquoted word-splitting — a literal single-space concatenation of the two raw values, even
  // when one or both are empty (a genuinely empty cmd contributes zero chars but the literal
  // space between $cmd and $args in the source still prints). Preserved verbatim.
  const display = url !== "" ? url : `${cmd} ${argsJoined}`;
  // The real `-- $cmd $args` invocation IS unquoted (word-splitting applies): jq already
  // flattened the args array to a single joined string, and bash re-splits it by IFS whitespace
  // — a lossy round-trip if any single argument token ever contained internal whitespace. Kept
  // faithful to that (mostly theoretical) shell behavior rather than using the raw array.
  const execTokens = [...shellWords(cmd), ...shellWords(argsJoined)];
  return { name, type, url, display, execTokens };
}

/** `command -v bin`: a fixture path (contains "/") is checked for existence; a bare name is
 * resolved on PATH via Bun.which. */
function which(bin: string): boolean {
  if (bin.includes("/")) return existsSync(bin);
  return Bun.which(bin) !== null;
}

/** Best-effort subprocess call whose failure is swallowed — mirrors `cmd 2>/dev/null || true`
 * (stdout inherited, stderr discarded, exit code and thrown ENOENT both ignored). */
function runIgnoringFailure(bin: string, args: string[]): void {
  try {
    Bun.spawnSync([bin, ...args], { stdout: "inherit", stderr: "ignore" });
  } catch {
    // command-not-found or any other spawn failure: swallowed, matching `|| true`.
  }
}

/** Thrown by `runOrAbort` to unwind to the top-level catch while carrying the FAILING command's
 * own real exit code — mirrors `set -e` terminating the whole script with that command's exit
 * status (2, 127, 42, whatever it actually was), never a hardcoded 1. Distinguished from any
 * other (genuinely unexpected, no-shell-analogue) thrown error so the top-level handler can print
 * nothing extra for this path — exactly like the original, which never emits a message of its
 * own on abort beyond what the failing command already wrote to its own inherited stderr. */
export class AbortError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
  }
}

/** Unguarded subprocess call — mirrors a bare statement under `set -e`: full passthrough
 * (stdout+stderr inherited), and a nonzero exit (or a failed spawn, e.g. binary missing) throws
 * an AbortError carrying that exit code, aborting the whole run exactly where the shell would
 * have. */
function runOrAbort(bin: string, args: string[]): void {
  let exitCode: number;
  try {
    const proc = Bun.spawnSync([bin, ...args], {
      stdout: "inherit",
      stderr: "inherit",
    });
    exitCode = proc.exitCode ?? 1;
  } catch {
    // Disclosed divergence (accepted): real bash prints "bash: line N: <bin>: command not
    // found" on this path. This message is a port-invented approximation of that diagnostic,
    // not a byte-for-byte transcript — byte-matching bash's own prefix is neither achievable
    // nor desirable in a port.
    process.stderr.write(`${bin}: command not found\n`);
    exitCode = 127;
  }
  if (exitCode !== 0) {
    throw new AbortError(
      `${bin} ${args.join(" ")} failed (exit ${exitCode})`,
      exitCode,
    );
  }
}

function main(): void {
  const parsed = cli(
    {
      name: "install-mcp.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Install the declarative MCP configuration into Claude Code and Codex.",
      },
      flags: {
        dryRun: { type: Boolean, default: false },
        dotfiles: { type: nonEmptyString("--dotfiles") },
        home: { type: nonEmptyString("--home") },
        claudeBin: { type: nonEmptyString("--claude-bin") },
        codexBin: { type: nonEmptyString("--codex-bin") },
        uvBin: { type: nonEmptyString("--uv-bin") },
        cccBin: { type: nonEmptyString("--ccc-bin") },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );

  // Cleye owns generated help/strict ordinary flags. The explicit [] positional schema does not
  // consume arguments, so reject any excess operand before side effects begin.
  if (parsed._.length > 0) {
    throw new Error(
      `Unexpected argument '${parsed._[0]}'. This command does not take positional arguments`,
    );
  }

  const values = parsed.flags;
  const dryRun = values.dryRun === true;
  // `${DOTFILES:-$HOME/dotfiles}` (bash `:-`) applies ONLY to DOTFILES — the nested $HOME is a
  // bare, unguarded expansion with no empty-check of its own. So DOTFILES needs the
  // empty-normalizes-to-undefined trick (JS `??` is null/undefined only, unlike bash `:-`) to
  // avoid a real `DOTFILES=` env line wrongly resolving to "" instead of falling through to its
  // default (same idiom as scripts/link-dots.sh:14, mise.toml:203) — but HOME must NOT get that
  // same guard: an exported-but-empty `HOME=` has to flow through as "" (yielding "/dotfiles",
  // not `${homedir()}/dotfiles`), exactly like bash's own bare `$HOME` expansion.
  const envHome = process.env.HOME;
  const home = values.home ?? envHome ?? homedir();
  const envDotfiles = process.env.DOTFILES || undefined;
  const dotfiles = values.dotfiles ?? envDotfiles ?? `${home}/dotfiles`;
  const claudeBin = values.claudeBin ?? "claude";
  const codexBin = values.codexBin ?? "codex";
  const uvBin = values.uvBin ?? "uv";
  const cccBin = values.cccBin ?? "ccc";
  const prune = process.env.MCP_PRUNE === "1";
  const mcpJsonPath = `${dotfiles}/.mcp.json`;

  // cocoindex-code's MCP server is the binary `ccc` (a separate uv tool); ensure it exists.
  // Unguarded in the original (`command -v ccc || uv tool install …`) — a failed install aborts
  // the whole task before a single server is touched.
  if (!which(cccBin)) {
    const uvArgs = ["tool", "install", "--upgrade", "cocoindex-code[full]"];
    if (dryRun) {
      print(`[dry-run] would run: ${uvBin} ${uvArgs.join(" ")}`);
    } else {
      runOrAbort(uvBin, uvArgs);
    }
  }

  const servers = loadMcpServers(mcpJsonPath);
  const names = Object.keys(servers).sort();

  for (const name of names) {
    const plan = buildPlan(name, servers[name] ?? {});

    if (dryRun) {
      print(
        `[dry-run] would run: ${claudeBin} mcp remove -s user ${name} (errors ignored)`,
      );
    } else {
      runIgnoringFailure(claudeBin, ["mcp", "remove", "-s", "user", name]);
    }

    if (plan.url !== "") {
      const addArgs = [
        "mcp",
        "add",
        "-s",
        "user",
        "--transport",
        plan.type,
        name,
        plan.url,
      ];
      if (dryRun)
        print(`[dry-run] would run: ${claudeBin} ${addArgs.join(" ")}`);
      else runOrAbort(claudeBin, addArgs);
    } else {
      const addArgs = [
        "mcp",
        "add",
        "-s",
        "user",
        name,
        "--",
        ...plan.execTokens,
      ];
      if (dryRun)
        print(`[dry-run] would run: ${claudeBin} ${addArgs.join(" ")}`);
      else runOrAbort(claudeBin, addArgs);
    }

    if (which(codexBin)) {
      if (dryRun) {
        print(
          `[dry-run] would run: ${codexBin} mcp remove ${name} (errors ignored)`,
        );
      } else {
        runIgnoringFailure(codexBin, ["mcp", "remove", name]);
      }

      if (plan.url !== "") {
        const addArgs = ["mcp", "add", name, "--url", plan.url];
        if (dryRun)
          print(`[dry-run] would run: ${codexBin} ${addArgs.join(" ")}`);
        else runOrAbort(codexBin, addArgs);
      } else {
        const addArgs = ["mcp", "add", name, "--", ...plan.execTokens];
        if (dryRun)
          print(`[dry-run] would run: ${codexBin} ${addArgs.join(" ")}`);
        else runOrAbort(codexBin, addArgs);
      }
    }

    print(`registered: ${name} (${plan.display})`);
  }

  print(`applied ${mcpJsonPath} -> Claude(user) + Codex`);

  // DRIFT REPORT (added 2026-07-25). The loop above only visits names PRESENT in .mcp.json, so
  // deleting an entry here never uninstalls it. Read-only (`claude mcp list`), so it runs
  // regardless of --dry-run.
  const declared = names; // already alphabetically sorted, matching jq's `keys[] | sort`
  let liveText = "";
  try {
    const proc = Bun.spawnSync([claudeBin, "mcp", "list"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    liveText = proc.stdout.toString();
  } catch {
    liveText = ""; // matches the shell: a failed `claude mcp list` still ends in `| sort`,
    // whose own exit status is what `set -e` sees — never an abort.
  }
  const liveNames = liveText
    .split("\n")
    .map((line) => /^([a-zA-Z0-9_-]*): /.exec(line)?.[1])
    // sed's `s/^\([a-zA-Z0-9_-]*\): .*/\1/p` has no length check on the captured group — a
    // pathological line starting with just ": " captures a ZERO-length name, and sed still
    // emits (and `sort`/`comm` still process) that blank line. Only DROP entries the regex
    // didn't match at all (undefined); keep an empty-string capture, matching sed verbatim.
    .filter((n): n is string => typeof n === "string")
    .sort();

  const undeclared = commOnlyInSecond(declared, liveNames);
  if (undeclared.length > 0) {
    print("--- DRIFT: registered but NOT declared in .mcp.json ---");
    for (const n of undeclared) print(`  ${n}`);
    if (prune) {
      for (const name of undeclared) {
        if (dryRun) {
          print(
            `[dry-run] would run: ${claudeBin} mcp remove -s user ${name} (errors ignored)`,
          );
          if (which(codexBin)) {
            print(
              `[dry-run] would run: ${codexBin} mcp remove ${name} (errors ignored)`,
            );
          }
        } else {
          runIgnoringFailure(claudeBin, ["mcp", "remove", "-s", "user", name]);
          if (which(codexBin))
            runIgnoringFailure(codexBin, ["mcp", "remove", name]);
        }
        print(`  pruned: ${name}`);
      }
    } else {
      print(
        "  (declare them in .mcp.json, or re-run with MCP_PRUNE=1 to uninstall them)",
      );
      print(
        "  NOTE: .mcp.json is documented as the single source of truth; this list is the gap.",
      );
    }
  }

  print(
    "tip: run 'ccc index <repo>' once to warm cocoindex-code's embedding model.",
  );
}

// Guarded (unlike the sibling link:skills port): THIS file is also `import`ed by its own test
// file to unit-test the pure helpers (buildPlan/jqOr/shellWords/commOnlyInSecond/
// loadMcpServers) without spawning a subprocess. Without this guard, merely importing the
// module would run `main()` for real — with `Bun.argv.slice(2)` empty (the test runner's own
// argv, not any CLI args), every default would resolve to the REAL $HOME/dotfiles and REAL
// `claude`/`codex` binaries. Confirmed by direct reproduction during this port's own test
// development; see behaviorNotes.
if (import.meta.main) {
  try {
    main();
    process.exit(0);
  } catch (error) {
    if (error instanceof AbortError) {
      // Parity with `set -eu`: the original prints NOTHING of its own on abort — the failing
      // command's own diagnostic already went to (inherited) stderr above — and the shell exits
      // with THAT command's real status, not a synthesized message and not a hardcoded 1.
      process.exit(error.exitCode);
    }
    if (error instanceof UsageError) {
      process.stderr.write(`FATAL: ${error.message}\n`);
      process.exit(2);
    }
    // No shell analogue: this is outside the modeled `set -eu` subprocess path entirely (e.g. a
    // bug in this port's own flag parsing) — surface it loudly rather than swallow it silently.
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
