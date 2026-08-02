import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const SCRIPT = resolve(
  import.meta.dir,
  "../scripts/research-run-check.ts",
);
export const DIGEST_A = "a".repeat(64);
export const DIGEST_B = "b".repeat(64);
const temporaryDirectories: string[] = [];

export type RunResult = Readonly<{
  exitCode: number;
  stderr: string;
  stdout: string;
}>;
export type Scenario = Readonly<{
  arguments_: string[];
  intentPath: string;
  judgmentPath: string;
  receiptPath: string;
  root: string;
}>;

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function denominatorDigest(runIds: readonly string[]): string {
  return sha256(`${[...new Set(runIds)].sort().join("\n")}\n`);
}

export function temporaryRoot(): string {
  const path = mkdtempSync(join(tmpdir(), "research-run-check-"));
  temporaryDirectories.push(path);
  return path;
}

export function cleanupTemporaryRoots(): void {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { force: true, recursive: true });
}

export function write(directory: string, name: string, text: string): string {
  const path = join(directory, name);
  writeFileSync(path, text);
  return path;
}

function packet(
  title: string,
  values: Readonly<Record<string, string>>,
): string {
  return `# ${title}\n\n${Object.entries(values)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")}\n`;
}

export function intent(
  runId: string,
  overrides: Readonly<Record<string, string>> = {},
): string {
  return packet("RUN INTENT", {
    SCHEMA: "research-run-intent/v1",
    RUN_ID: runId,
    PROGRAMME_OR_QUESTION_LOCUS: "research/programme.md:12",
    REGISTERED_AT: "2026-08-02T10:00:00Z",
    ACCESS_BOUNDARY: "opening the held-out observation",
    PRECOMMITMENT_LOCUS: `research/precommitments/${runId}.md:1`,
    PRECOMMITMENT_SHA256: DIGEST_A,
    DENOMINATOR_MEMBERSHIP: `programme-alpha/${runId}`,
    ACTOR_OVERLAY_LOCUS: "research/dispatch/audit-overlay.md:1",
    ACTOR_OVERLAY_SHA256: DIGEST_B,
    EVIDENCE_SINK: `research/raw/${runId}.json`,
    PRIVACY_CLASS: "internal",
    RETENTION_CLASS: "research-evidence",
    REGISTERED_EXPECTATION: "held-out contrast exceeds the frozen boundary",
    DISCRIMINATING_OUTCOMES: "pass supports A; fail shifts support to B",
    NEXT_ACTIONS_BY_OUTCOME: "pass=tree update; fail=thesis regenerate",
    ...overrides,
  });
}

export function receipt(
  runId: string,
  intentDigest: string,
  status = "succeeded",
  overrides: Readonly<Record<string, string>> = {},
): string {
  return packet("RUN RECEIPT", {
    SCHEMA: "research-run-receipt/v1",
    RUN_ID: runId,
    INTENT_SHA256: intentDigest,
    STARTED_AT: "2026-08-02T10:01:00Z",
    ENDED_AT: "2026-08-02T10:02:00Z",
    STATUS: status,
    EXECUTOR: "process:controlled-runner",
    CAPTURE_SOURCE: "research-runner/v1",
    CODE_CONFIG_DATA_DIGESTS: `code=${DIGEST_A}; config=${DIGEST_B}`,
    OBSERVATION_LOCATOR: `research/raw/${runId}.json:1`,
    OBSERVATION_SHA256: DIGEST_B,
    FAILURE_OR_EXCLUSION_REASON:
      status === "succeeded"
        ? "NONE — terminal success"
        : `${status} by fixture boundary`,
    CONTROL_AND_ARTIFACT_CHECK_LOCI: "research/checks/run-checks.md:4",
    ...overrides,
  });
}

const LENS_IDS = [
  "frame-coevolution",
  "generation-evaluation-separation",
  "denominator-retention",
  "premise-alternative-breadth",
  "discriminating-evidence",
  "surprise-uptake",
  "actor-independence",
  "negative-result-retention",
];

function lenses(): string {
  return `\n## PROCESS LENSES\n\n| Lens ID | Evidence locus | Verdict | Causal consequence | Repair / reopen |\n|---|---|---|---|---|\n${LENS_IDS.map(
    (id) =>
      `| ${id} | research/audit/${id}.md:1 | EVIDENCED | bounded consequence for ${id} | NONE — no repair required |`,
  ).join("\n")}\n`;
}

export function judgment(
  runIds: readonly string[],
  auditability = "AUDITABLE",
  missing: readonly string[] = [],
  overrides: Readonly<Record<string, string>> = {},
): string {
  return `${packet("RETROSPECTIVE JUDGMENT", {
    SCHEMA: "research-retrospective/v1",
    JUDGMENT_ID: "judgment-alpha",
    AUDITABILITY: auditability,
    RUN_IDS: runIds.join(", "),
    DENOMINATOR_SHA256: denominatorDigest(runIds),
    MISSING_RECEIPT_RUN_IDS: missing.length === 0 ? "NONE" : missing.join(", "),
    REGISTERED_EXPECTATION_VS_OBSERVATION:
      "expectation differed by one contrast",
    CONTROLS: "research/checks/controls.md:1 — controls retained",
    LEAKAGE: "research/checks/leakage.md:1 — no detected leak",
    MISSINGNESS: "research/checks/missingness.md:1 — bounded missingness",
    INSTRUMENTATION:
      "research/checks/instrumentation.md:1 — instrument checked",
    ALTERNATIVES_GAINED_OR_LOST: "A gained support; B remains live",
    SCOPE_ACTUALLY_TESTED: "one held-out bounded contrast",
    RESULT_CLASS: "EXPECTED",
    TRANSITION: "TREE_UPDATE",
    EPISODE_DISPOSITION: "PERSIST",
    POSTDICTION: "NONE — no explanation formed after observation",
    NEXT_REGISTERED_TEST: "research/precommitments/next.md:1",
    AUDIT_CLEARANCE_LOCUS: "research/audit/clearance.md:1",
    UNRESOLVED: "instrument portability remains unresolved",
    REOPEN_CONDITION: "reopen if the registered replication reverses",
    ...overrides,
  })}${lenses()}`;
}

export function run(arguments_: readonly string[]): RunResult {
  const result = Bun.spawnSync({
    cmd: ["bun", SCRIPT, ...arguments_],
    stderr: "pipe",
    stdout: "pipe",
    timeout: 10_000,
  });
  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

export function completeScenario(status = "succeeded"): Scenario {
  const directory = temporaryRoot();
  const intentText = intent("run-a");
  const intentPath = write(directory, "run-a.intent.md", intentText);
  const receiptPath = write(
    directory,
    "run-a.receipt.md",
    receipt("run-a", sha256(intentText), status),
  );
  const judgmentPath = write(
    directory,
    "retrospective.md",
    judgment(["run-a"]),
  );
  return {
    arguments_: [
      "--intent",
      intentPath,
      "--receipt",
      receiptPath,
      "--judgment",
      judgmentPath,
    ],
    intentPath,
    judgmentPath,
    receiptPath,
    root: directory,
  };
}
