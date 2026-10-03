// The ratchet for the TS lint debt ledger in .oxlintrc.json (overrides[0].files). Called by
// `mise run lint:ts-ratchet` (part of `lint`).
//
// Lints every file with the FULL rules (the ledger removed) and fails on a listed file that now
// has no violation, naming it: that is the only way a listed file leaves the list, and there is
// no way to add one here. Delete this script and its task together with the ledger.

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromThrowable } from "neverthrow";
import { z } from "zod";

const OXLINT_TIMEOUT_MS = 120_000;

const LedgerSchema = z.object({
  overrides: z.array(z.object({ files: z.array(z.string()) })).min(1),
});
const DiagnosticsSchema = z.object({
  diagnostics: z.array(
    z.object({ severity: z.string(), filename: z.string() }),
  ),
});

const text = (path: string): string => readFileSync(path, "utf8");
const parse = (raw: string): unknown => JSON.parse(raw);

// Returns the exit code instead of calling process.exit() itself: process.exit() skips `using`
// disposers, which left the temp config behind on a failing run.
function main(): number {
  const config = fromThrowable(() => parse(text(".oxlintrc.json")))();
  if (config.isErr()) {
    console.error("lint:ts-ratchet: .oxlintrc.json is unreadable");
    return 2;
  }
  const ledger = LedgerSchema.safeParse(config.value);
  if (!ledger.success) {
    console.error(
      "lint:ts-ratchet: .oxlintrc.json has no overrides[0].files ledger",
    );
    return 2;
  }
  const listed = new Set(ledger.data.overrides[0]?.files ?? []);

  // The same config without its ledger, written BESIDE .oxlintrc.json (oxlint resolves its
  // jsPlugins from the config's directory); the pid keeps concurrent runs apart.
  const bare = z.record(z.string(), z.unknown()).parse(config.value);
  const { overrides: _ledger, ...withoutLedger } = bare;
  const cfgPath = `./.oxlintrc.ratchet.${process.pid}.json`;
  const outPath = join(tmpdir(), `lint-ts-ratchet-${process.pid}.json`);
  using _cleanup = {
    [Symbol.dispose]: () => {
      rmSync(cfgPath, { force: true });
      rmSync(outPath, { force: true });
    },
  };
  writeFileSync(cfgPath, JSON.stringify(withoutLedger));

  // stdout goes to a FILE, not a pipe: oxlint exits right after writing, and a pipe truncates its
  // JSON at the 64 KB pipe buffer (seen 2026-10-03: "Unfinished JSON term"). Exit 1 is expected
  // (errors exist); anything above that is oxlint itself failing.
  const run = Bun.spawnSync(
    ["bunx", "--bun", "oxlint", "--type-aware", "-c", cfgPath, "-f", "json"],
    {
      stdout: Bun.file(outPath),
      stderr: "inherit",
      timeout: OXLINT_TIMEOUT_MS,
    },
  );
  if (run.exitCode === null || run.exitCode > 1) {
    console.error(
      `lint:ts-ratchet: oxlint itself failed (exit ${run.exitCode})`,
    );
    return 2;
  }

  const report = fromThrowable(() => parse(text(outPath)))();
  const checked = DiagnosticsSchema.safeParse(
    report.isOk() ? report.value : undefined,
  );
  if (!checked.success) {
    console.error("lint:ts-ratchet: could not read oxlint's JSON report");
    return 2;
  }
  const dirty = new Set(
    checked.data.diagnostics
      .filter((d) => d.severity === "error")
      .map((d) => d.filename),
  );

  const stale = [...listed].filter((f) => !dirty.has(f)).sort();
  if (stale.length > 0) {
    console.error(
      "lint:ts-ratchet: these files are in the .oxlintrc.json debt ledger but are already clean — remove them from overrides[0].files:",
    );
    console.error(stale.join("\n"));
    return 1;
  }
  console.log(
    `lint:ts-ratchet: ${listed.size} files still in the debt ledger, none stale`,
  );
  return 0;
}

process.exit(main());
