// lint-no-sync — `node/no-sync` for non-test TypeScript, with a call-site exemption and a ratcheting
// baseline. (The rule was removed in f1f0a2c4 because path-keyed exemptions punished behaviour-
// preserving moves; nothing here is keyed by path except the generated per-file COUNT baseline.)
//
// Rule: oxlint's own `node/no-sync` (allowAtRootLevel) over the repo, ignores taken from
// .oxlintrc.json, `**/tests/**` and `**/*.test.ts` off. A diagnostic is then
//   1. EXEMPT when its line, or the contiguous `//` comment block directly above it, carries
//        // sync-ok: <reason>
//      The comment travels with the code, so moving the function to another file keeps it exempt.
//      Without a reason (>= 4 characters) it is not recognised. Disable comments stay banned
//      (lint:ts-no-disable).
//   2. otherwise counted per file and compared with lint/no-sync-baseline.tsv.
//
// Modes: (none) check · --strict check, and also fail when the baseline is stale (a count above the
// real one) · --write regenerate the baseline, refusing any per-file growth · --init write it even
// where counts grow (first generation, or the day the baseline is deliberately re-based).
// Exit: 0 ok · 1 violation · 2 FATAL.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { jsonOf, z } from "../agents/hooks/zod.ts";

// TSV, not JSON: the config-map gate (lint:config-map) registers every *.json, and a baseline is data.
const BASELINE = "lint/no-sync-baseline.tsv";
const OXLINT = join(import.meta.dir, "..", "node_modules", ".bin", "oxlint");
const EXEMPT = /\/\/\s*sync-ok:\s*(\S.{3,})$/u;
const COMMENT_LINE = /^\s*\/\//u;

const Rc = z.looseObject({ ignorePatterns: z.array(z.string()) });
const Output = z.object({
  diagnostics: z.array(
    z.object({
      filename: z.string(),
      labels: z.array(z.object({ span: z.object({ line: z.number() }) })),
    }),
  ),
});
type Counts = Record<string, number>;

/** True when line `index` (0-based), or the `//` block right above it, has a reasoned sync-ok. */
export function exempt(lines: readonly string[], index: number): boolean {
  if (EXEMPT.test((lines[index] ?? "").trimEnd())) return true;
  for (let i = index - 1; i >= 0; i--) {
    const above = lines[i] ?? "";
    if (!COMMENT_LINE.test(above)) return false;
    if (EXEMPT.test(above.trimEnd())) return true;
  }
  return false;
}

async function oxlintConfig(root: string): Promise<string> {
  const text = await Bun.file(join(root, ".oxlintrc.json")).text();
  const rc = jsonOf(Rc).safeParse(text);
  if (!rc.success) return `.oxlintrc.json: ${rc.error.message}`;
  return JSON.stringify({
    plugins: ["node"],
    categories: { correctness: "off" },
    rules: { "node/no-sync": ["error", { allowAtRootLevel: true }] },
    ignorePatterns: rc.data.ignorePatterns,
    overrides: [
      {
        files: ["**/tests/**", "**/*.test.ts"],
        rules: { "node/no-sync": "off" },
      },
    ],
  });
}

type Scan =
  | { ok: true; counts: Counts; exempted: number }
  | { ok: false; error: string };

async function scan(root: string): Promise<Scan> {
  const config = await oxlintConfig(root);
  if (!config.startsWith("{")) return { ok: false, error: config };
  const dir = await mkdtemp(join(tmpdir(), "lint-no-sync-"));
  const configPath = join(dir, "oxlintrc.json");
  const outPath = join(dir, "out.json");
  await Bun.write(configPath, config);
  const proc = Bun.spawn(
    ["bun", "--bun", OXLINT, "-c", configPath, "--format", "json", "."],
    // stdout goes to a file: oxlint exits before a pipe is drained and the JSON arrives cut off.
    { cwd: root, stdout: Bun.file(outPath), stderr: "pipe", timeout: 120_000 },
  );
  const [stderr] = await Promise.all([proc.stderr.text(), proc.exited]);
  const stdout = await Bun.file(outPath).text();
  await rm(dir, { recursive: true, force: true });
  const out = jsonOf(Output).safeParse(stdout);
  if (!out.success)
    return {
      ok: false,
      error: `oxlint output unreadable (exit ${proc.exitCode}): ${out.error.message.slice(0, 200)} ${stderr.trim()}`,
    };
  const counts: Counts = {};
  const sources = new Map<string, string[]>();
  let exempted = 0;
  for (const d of out.data.diagnostics) {
    const line = d.labels[0]?.span.line ?? 1;
    if (!sources.has(d.filename))
      sources.set(
        d.filename,
        (await Bun.file(join(root, d.filename)).text()).split(/\r?\n/u),
      );
    if (exempt(sources.get(d.filename) ?? [], line - 1)) exempted++;
    else counts[d.filename] = (counts[d.filename] ?? 0) + 1;
  }
  return { ok: true, counts, exempted };
}

async function readBaseline(root: string): Promise<Counts | undefined> {
  const file = Bun.file(join(root, BASELINE));
  if (!(await file.exists())) return undefined;
  const rows = (await file.text()).split("\n").filter((l) => l !== "");
  return Object.fromEntries(
    rows.map((row) => {
      const [count, path] = row.split("\t");
      return [path ?? "", Number(count)];
    }),
  );
}

const sum = (c: Counts): number => Object.values(c).reduce((a, b) => a + b, 0);

function refuseGrowth(
  grown: readonly (readonly [string, number])[],
  baseline: Counts,
): number {
  for (const [file, n] of grown)
    process.stdout.write(
      `${file}: ${n} sync call(s), baseline ${baseline[file] ?? 0}\n`,
    );
  process.stdout.write(
    "lint:no-sync: the baseline only shrinks; convert the call or exempt it with `// sync-ok: <reason>`\n",
  );
  return 1;
}

type Flags = { write: boolean; init: boolean; strict: boolean };

async function run(flags: Flags): Promise<number> {
  const root = process.cwd();
  const scanned = await scan(root);
  if (!scanned.ok) {
    process.stderr.write(`FATAL: ${scanned.error}\n`);
    return 2;
  }
  const { counts, exempted } = scanned;
  const base = await readBaseline(root);
  const baseline: Counts = base ?? {};
  const grown = Object.entries(counts).filter(
    ([file, n]) => n > (baseline[file] ?? 0),
  );

  if (flags.write || flags.init) {
    if (grown.length > 0 && !flags.init && base !== undefined)
      return refuseGrowth(grown, baseline);
    const files = Object.fromEntries(
      Object.entries(counts).toSorted(([a], [b]) => a.localeCompare(b)),
    );
    await Bun.write(
      join(root, BASELINE),
      Object.entries(files)
        .map(([file, n]) => `${n}\t${file}\n`)
        .join(""),
    );
    process.stdout.write(
      `lint:no-sync: baseline ${sum(counts)} site(s) in ${Object.keys(files).length} file(s) (was ${sum(baseline)}); ${exempted} exempt\n`,
    );
    return 0;
  }

  if (base === undefined) {
    process.stderr.write(
      `FATAL: ${BASELINE} is missing or unreadable; create it with \`mise run lint:no-sync-baseline -- --init\`\n`,
    );
    return 2;
  }
  for (const [file, n] of grown)
    process.stdout.write(
      `${file}: ${n} sync call(s), baseline ${baseline[file] ?? 0} — new sync call: use the async API, or exempt it with \`// sync-ok: <reason>\`\n`,
    );
  const stale = Object.entries(baseline).filter(
    ([file, n]) => (counts[file] ?? 0) < n,
  );
  if (flags.strict)
    for (const [file, n] of stale)
      process.stdout.write(
        `${file}: baseline ${n}, now ${counts[file] ?? 0} — stale; run \`mise run lint:no-sync-baseline\`\n`,
      );
  const failed = grown.length > 0 || (flags.strict && stale.length > 0);
  process.stdout.write(
    `lint:no-sync: ${sum(counts)} site(s), baseline ${sum(baseline)}, ${exempted} exempt — ${failed ? "FAIL" : "ok"}\n`,
  );
  return failed ? 1 : 0;
}

function fatal(message: string): never {
  process.stderr.write(`lint-no-sync: ${message}\n`);
  return process.exit(2);
}

if (import.meta.main) {
  const rejectPrototypeFlag = (type: string, flag: string): void => {
    if (type === "unknown-flag" && flag === "__proto__")
      fatal(`unknown option '--${flag}'`);
  };
  const argv = cli(
    {
      name: "lint-no-sync",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Check sync calls in non-test TS against lint/no-sync-baseline.tsv.",
      },
      flags: {
        write: {
          type: Boolean,
          default: false,
          description: "regenerate the baseline (refuses growth)",
        },
        init: {
          type: Boolean,
          default: false,
          description: "regenerate the baseline even where counts grow",
        },
        strict: {
          type: Boolean,
          default: false,
          description: "also fail when the baseline is stale",
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (argv._.length > 0) fatal(`unexpected argument: ${argv._[0]}`);
  const attempted = await attempt(() => run(argv.flags));
  if (attempted.ok) process.exitCode = attempted.value;
  else {
    process.stderr.write(`FATAL: ${errorMessage(attempted.error)}\n`);
    process.exitCode = 2;
  }
}
