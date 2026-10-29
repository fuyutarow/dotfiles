// Port of mise task `cc:install-mcp` (see mise.toml). Structural port only — same source of
// truth, same registration order, same abort-on-failure semantics, same printed lines as the
// original shell body (`set -eu`). Consumer: human/agent running `mise run cc:install-mcp` —
// output is verdict-style lines meant for eyeballing (registered/applied/DRIFT/pruned/tip), not
// a machine envelope, matching the shell original.
//
// .mcp.json (declarative source of truth) is applied into Claude Code (user scope), idempotently:
// each declared server is removed then re-added. Codex is deliberately converged by
// agents/codex/codex-config.ts, which edits its TOML directly and can preserve user MCP entries.
// Two DISTINCT failure
// postures, both preserved exactly from the original `set -eu` body:
//   - every `mcp remove` is best-effort — its failure (including "binary not found") is
//     swallowed, matching the shell's `2>/dev/null || true`.
//   - every `mcp add` is NOT guarded — its failure aborts the whole run immediately (no further
//     servers get processed, no "applied" line, no drift report), matching `set -e` on an
//     unguarded statement.
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

import {
  access,
  readFile,
  mkdir,
  realpath,
  symlink,
  rename,
  chmod,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { cli } from "cleye";
import { attempt } from "../agents/hooks/attempt.ts";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import { cccBackend } from "../tools/repo-retrieve/src/ccc-entry.ts";

export async function installCccEntry(
  home: string,
  entry: string,
): Promise<void> {
  const bin = join(home, ".local", "bin");
  const backend = await realpath(cccBackend(entry));
  const source = await readFile(
    new URL("../cocoindex/ccc-entry", import.meta.url),
  );
  await mkdir(bin, { recursive: true });
  const backendTemp = join(bin, `ccc-backend.tmp-${process.pid}`);
  const entryTemp = join(bin, `ccc.tmp-${process.pid}`);
  await symlink(backend, backendTemp);
  await rename(backendTemp, join(bin, "ccc-backend"));
  await Bun.write(entryTemp, source);
  await chmod(entryTemp, 0o755);
  // Replace the uv symlink itself, never write through it into the vendor package.
  await rename(entryTemp, join(bin, "ccc"));
  await Promise.all([
    unlink(backendTemp).catch(() => {}),
    unlink(entryTemp).catch(() => {}),
  ]);
}

class UsageError extends Error {}

// Cleye 2.6.0's strictFlags misses --__proto__; reject that prototype-sensitive name at the
// pre-assignment boundary. Every ordinary unknown remains Cleye strictFlags' responsibility.
let prototypeFlagSeen = false;
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    prototypeFlagSeen = true;
  }
}

function nonEmptyString(flag: string): (value: string) => string {
  void flag;
  return (value) => value;
}

type ServerEntry = {
  type?: unknown;
  url?: unknown;
  command?: unknown;
  args?: unknown;
};
type SkippedServer = {
  name: string;
  command: string;
  missingTool: string;
};
// .mcp.json is parsed, not asserted: a server entry is read as a record and only the four fields
// this script uses are kept (each stays `unknown` — jqOr() decides how it prints).
const ServerEntrySchema = z.record(z.string(), z.unknown()).transform((r) => ({
  type: r.type,
  url: r.url,
  command: r.command,
  args: r.args,
}));
const McpJsonSchema = z.object({
  mcpServers: z.record(z.string(), ServerEntrySchema).nullish(),
});

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

function shellString(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "object") return "[object Object]";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (
    typeof value !== "number" &&
    typeof value !== "boolean" &&
    typeof value !== "bigint" &&
    typeof value !== "symbol"
  ) {
    return "";
  }
  return String(value);
}

function isUnavailable(available: boolean | undefined): boolean {
  if (available === undefined) return true;
  return !available;
}

// jq's `//` alternative operator falls back to its right-hand side for null AND false, not just
// "absent" — mirrored here rather than JS `??` (null/undefined only), though in practice these
// fields are never boolean in .mcp.json.
export function jqOr(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === false) return fallback;
  if (typeof value === "object") {
    return Array.isArray(value) ? value.join(",") : "[object Object]";
  }
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }
  return fallback;
}

// Mirrors unquoted `$var` word-splitting on IFS whitespace: leading/trailing/repeated
// separators produce no empty tokens, and an empty/unset var contributes zero words.
export function shellWords(s: string): string[] {
  return s.split(/\s+/u).filter((w) => w.length > 0);
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
    const left = a[i];
    const right = b[j];
    if (left === undefined) {
      i++;
      continue;
    }
    if (right === undefined) {
      j++;
      continue;
    }
    if (left === right) {
      i++;
      j++;
    } else if (left < right) {
      i++;
    } else {
      out.push(right);
      j++;
    }
  }
  for (const right of b.slice(j)) {
    out.push(right);
  }
  return out;
}

// `.mcpServers | keys[]` — jq's `keys` (unlike `keys_unsorted`) sorts alphabetically; this is
// what actually decides registration order, not the file's own key order. Verified live against
// the repo's real .mcp.json before porting.
export async function loadMcpServers(
  mcpJsonPath: string,
): Promise<Record<string, ServerEntry>> {
  const text = await attempt(() => readFile(mcpJsonPath, "utf8"));
  const parsed = text.ok
    ? jsonOf(McpJsonSchema).safeParse(text.value)
    : undefined;
  return parsed?.success === true ? (parsed.data.mcpServers ?? {}) : {};
}

const RUNTIME_FOR_COMMAND: Readonly<Record<string, string>> = {
  bunx: "bun",
  npx: "node",
  uv: "uv",
  uvx: "uv",
};

/** Split configured stdio servers by runtime availability; the lookup is injected for tests. */
export async function partitionAvailableServers(
  servers: Record<string, ServerEntry>,
  hasTool: (tool: string) => boolean | Promise<boolean>,
): Promise<{
  available: Record<string, ServerEntry>;
  skipped: SkippedServer[];
}> {
  const available: Record<string, ServerEntry> = {};
  const skipped: SkippedServer[] = [];

  for (const [name, entry] of Object.entries(servers)) {
    const command = jqOr(entry.command, "");
    if (command === "" || jqOr(entry.url, "") !== "") {
      available[name] = entry;
      continue;
    }

    const missingTool = RUNTIME_FOR_COMMAND[command] ?? command;
    if (await hasTool(missingTool)) {
      available[name] = entry;
    } else {
      skipped.push({ name, command, missingTool });
    }
  }

  return { available, skipped };
}

export function buildPlan(name: string, entry: ServerEntry): Plan {
  const type = jqOr(entry.type, "stdio");
  const url = jqOr(entry.url, "");
  const cmd = jqOr(entry.command, "");
  const argsArray = Array.isArray(entry.args)
    ? entry.args.map((x) => shellString(x))
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
async function which(bin: string): Promise<boolean> {
  if (bin.includes("/")) return (await attempt(() => access(bin))).ok;
  return Bun.which(bin) !== null;
}

/** Best-effort subprocess call whose failure is swallowed — mirrors `cmd 2>/dev/null || true`
 * (stdout inherited, stderr discarded, exit code and thrown ENOENT both ignored). */
async function runIgnoringFailure(bin: string, args: string[]): Promise<void> {
  // command-not-found or any other spawn failure: swallowed, matching `|| true`.
  await attempt(async () => {
    const proc = Bun.spawn([bin, ...args], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "ignore",
    });
    await proc.exited;
  });
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
async function runOrAbort(
  bin: string,
  args: string[],
): Promise<AbortError | undefined> {
  const result = await attempt(async () => {
    const proc = Bun.spawn([bin, ...args], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    return proc.exited;
  });
  let exitCode: number;
  if (result.ok) exitCode = result.value;
  else {
    // Disclosed divergence (accepted): real bash prints "bash: line N: <bin>: command not
    // found" on this path. This message is a port-invented approximation of that diagnostic,
    // not a byte-for-byte transcript — byte-matching bash's own prefix is neither achievable
    // nor desirable in a port.
    process.stderr.write(`${bin}: command not found\n`);
    exitCode = 127;
  }
  if (exitCode !== 0) {
    return new AbortError(
      `${bin} ${args.join(" ")} failed (exit ${exitCode})`,
      exitCode,
    );
  }
  return undefined;
}

/** `mcp add` (or its dry-run announcement), shared by both the Claude and Codex call sites since
 * each just builds an argv array and branches on --dry-run the same way. */
async function runOrPrintAdd(
  bin: string,
  args: string[],
  dryRun: boolean,
): Promise<AbortError | undefined> {
  if (dryRun) print(`[dry-run] would run: ${bin} ${args.join(" ")}`);
  else return runOrAbort(bin, args);
  return undefined;
}

/**
 * Compatibility no-op: Codex MCP entries are owned by codex-config.ts, not the CLI's imperative
 * remove/add API. Keeping the boundary lets existing fixture invocations retain their argv shape.
 */
function registerWithCodex(
  _codexBin: string,
  _plan: Plan,
  _dryRun: boolean,
): AbortError | undefined {
  return undefined;
}

/** One undeclared-but-live server's removal for MCP_PRUNE=1. Codex owns its managed-name pruning. */
async function pruneServer(
  name: string,
  claudeBin: string,
  _codexBin: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    print(
      `[dry-run] would run: ${claudeBin} mcp remove -s user ${name} (errors ignored)`,
    );
    return;
  }
  await runIgnoringFailure(claudeBin, ["mcp", "remove", "-s", "user", name]);
}

/** The DRIFT REPORT's undeclared-name computation and printing (see main()'s comment above its
 * call site for the semantics); split out purely to keep this out of main()'s own nesting. */
async function printDriftReport(
  declared: string[],
  liveNames: string[],
  claudeBin: string,
  codexBin: string,
  dryRun: boolean,
  prune: boolean,
): Promise<void> {
  const undeclared = commOnlyInSecond(declared, liveNames);
  if (undeclared.length === 0) return;
  print("--- DRIFT: registered but NOT declared in .mcp.json ---");
  for (const n of undeclared) print(`  ${n}`);
  if (!prune) {
    print(
      "  (declare them in .mcp.json, or re-run with MCP_PRUNE=1 to uninstall them)",
    );
    print(
      "  NOTE: .mcp.json is documented as the single source of truth; this list is the gap.",
    );
    return;
  }
  for (const name of undeclared) {
    await pruneServer(name, claudeBin, codexBin, dryRun);
    print(`  pruned: ${name}`);
  }
}

async function main(): Promise<AbortError | UsageError | undefined> {
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
  if (prototypeFlagSeen) return new UsageError("Unknown option '--__proto__'");

  // Cleye owns generated help/strict ordinary flags. The explicit [] positional schema does not
  // consume arguments, so reject any excess operand before side effects begin.
  if (parsed._.length > 0) {
    return new UsageError(
      `Unexpected argument '${parsed._[0]}'. This command does not take positional arguments`,
    );
  }

  const values = parsed.flags;
  for (const [flag, value] of Object.entries(values)) {
    if (flag !== "dryRun" && value === "") {
      return new UsageError(
        `--${flag.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)} requires a value`,
      );
    }
  }
  const dryRun = values.dryRun;
  // `${DOTFILES:-$HOME/dotfiles}` (bash `:-`) applies ONLY to DOTFILES — the nested $HOME is a
  // bare, unguarded expansion with no empty-check of its own. So DOTFILES needs the
  // empty-normalizes-to-undefined trick (JS `??` is null/undefined only, unlike bash `:-`) to
  // avoid a real `DOTFILES=` env line wrongly resolving to "" instead of falling through to its
  // default (same idiom as scripts/link-dots.ts's DOTFILES default, mise.toml:203) — but HOME must NOT get that
  // same guard: an exported-but-empty `HOME=` has to flow through as "" (yielding "/dotfiles",
  // not `${homedir()}/dotfiles`), exactly like bash's own bare `$HOME` expansion.
  const envHome = process.env.HOME;
  const home = values.home ?? envHome ?? homedir();
  const envDotfiles =
    process.env.DOTFILES !== undefined && process.env.DOTFILES !== ""
      ? process.env.DOTFILES
      : undefined;
  const dotfiles = values.dotfiles ?? envDotfiles ?? `${home}/dotfiles`;
  const claudeBin = values.claudeBin ?? "claude";
  const codexBin = values.codexBin ?? "codex";
  const uvBin = values.uvBin ?? "uv";
  const cccBin = values.cccBin ?? "ccc";
  const prune = process.env.MCP_PRUNE === "1";
  const mcpJsonPath = `${dotfiles}/.mcp.json`;

  // cocoindex-code is an optional uv tool used by the repository's retrieval skill.
  // A missing uv runtime should skip this optional server, not abort dotfile deployment.
  const cccAvailable = await which(cccBin);
  const uvAvailable = await which(uvBin);
  let installFailure: AbortError | undefined;
  if (isUnavailable(cccAvailable) && isUnavailable(uvAvailable)) {
    print(
      "skipped: cocoindex-code — missing required tool 'uv' (needed to install cocoindex-code[full])",
    );
  } else if (isUnavailable(cccAvailable) && dryRun) {
    const uvArgs = ["tool", "install", "--upgrade", "cocoindex-code[full]"];
    print(`[dry-run] would run: ${uvBin} ${uvArgs.join(" ")}`);
  } else if (isUnavailable(cccAvailable)) {
    installFailure = await runOrAbort(uvBin, [
      "tool",
      "install",
      "--upgrade",
      "cocoindex-code[full]",
    ]);
  }
  if (installFailure !== undefined) return installFailure;

  if (dryRun) {
    print(
      `[dry-run] would install ccc admission entry at ${home}/.local/bin/ccc`,
    );
  } else if (!isUnavailable(cccAvailable) || !isUnavailable(uvAvailable)) {
    const entry = Bun.which(cccBin) ?? join(home, ".local", "bin", "ccc");
    await installCccEntry(home, entry);
  }

  const servers = await loadMcpServers(mcpJsonPath);
  const names = Object.keys(servers).toSorted();
  const partition = await partitionAvailableServers(servers, (tool) =>
    which(tool === "uv" ? uvBin : tool),
  );
  for (const skipped of partition.skipped) {
    print(
      `skipped: ${skipped.name} — missing required tool '${skipped.missingTool}' (server command '${skipped.command}')`,
    );
  }

  for (const name of Object.keys(partition.available).toSorted()) {
    const plan = buildPlan(name, partition.available[name] ?? {});

    if (dryRun) {
      print(
        `[dry-run] would run: ${claudeBin} mcp remove -s user ${name} (errors ignored)`,
      );
    } else {
      await runIgnoringFailure(claudeBin, [
        "mcp",
        "remove",
        "-s",
        "user",
        name,
      ]);
    }

    const addArgs =
      plan.url !== ""
        ? ["mcp", "add", "-s", "user", "--transport", plan.type, name, plan.url]
        : ["mcp", "add", "-s", "user", name, "--", ...plan.execTokens];
    const claudeFailure = await runOrPrintAdd(claudeBin, addArgs, dryRun);
    if (claudeFailure !== undefined) return claudeFailure;

    const codexFailure = (await which(codexBin))
      ? registerWithCodex(codexBin, plan, dryRun)
      : undefined;
    if (codexFailure !== undefined) return codexFailure;

    print(`registered: ${name} (${plan.display})`);
  }

  print(
    `applied ${mcpJsonPath} -> Claude(user); codex:config owns Codex MCP entries`,
  );

  // DRIFT REPORT (added 2026-07-25). The loop above only visits names PRESENT in .mcp.json, so
  // deleting an entry here never uninstalls it. Read-only (`claude mcp list`), so it runs
  // regardless of --dry-run.
  const declared = names; // already alphabetically sorted, matching jq's `keys[] | sort`
  // matches the shell: a failed `claude mcp list` still ends in `| sort`, whose own exit status
  // is what `set -e` sees — never an abort.
  const live = await attempt(async () => {
    const proc = Bun.spawn([claudeBin, "mcp", "list"], {
      stdin: "inherit",
      stdout: "pipe",
      stderr: "ignore",
    });
    const [text] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    return text;
  });
  const liveText = live.ok ? live.value : "";
  const liveNames = liveText
    .split("\n")
    .map((line) => /^([a-zA-Z0-9_-]*): /u.exec(line)?.[1])
    // sed's `s/^\([a-zA-Z0-9_-]*\): .*/\1/p` has no length check on the captured group — a
    // pathological line starting with just ": " captures a ZERO-length name, and sed still
    // emits (and `sort`/`comm` still process) that blank line. Only DROP entries the regex
    // didn't match at all (undefined); keep an empty-string capture, matching sed verbatim.
    .flatMap((n) => (n === undefined ? [] : [n]))
    .toSorted();

  await printDriftReport(
    declared,
    liveNames,
    claudeBin,
    codexBin,
    dryRun,
    prune,
  );

  print(
    "tip: run 'rr index' in a registered repository after content admission passes.",
  );
  return undefined;
}

// Guarded (unlike the sibling agent-assets linker): THIS file is also `import`ed by its own test
// file to unit-test the pure helpers (buildPlan/jqOr/shellWords/commOnlyInSecond/
// loadMcpServers) without spawning a subprocess. Without this guard, merely importing the
// module would run `main()` for real — with `Bun.argv.slice(2)` empty (the test runner's own
// argv, not any CLI args), every default would resolve to the REAL $HOME/dotfiles and REAL
// `claude`/`codex` binaries. Confirmed by direct reproduction during this port's own test
// development; see behaviorNotes.
// Await the entry boundary so all registrations and pruning finish before reporting the exit.
if (import.meta.main) {
  const result = await Promise.try(main).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (result.ok && result.value === undefined) {
    process.exitCode = 0;
  } else if (result.ok && result.value instanceof AbortError) {
    process.exitCode = result.value.exitCode;
  } else if (result.ok && result.value instanceof UsageError) {
    process.stderr.write(`FATAL: ${result.value.message}\n`);
    process.exitCode = 2;
  } else if (!result.ok) {
    const error = result.error;
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
