import { createHash } from "node:crypto";

export const MAX_PACKET_BYTES = 256 * 1024;
export const MAX_PACKET_COUNT = 1024;
export const HEX_SHA256 = /^[a-f0-9]{64}$/;
export const STABLE_ID = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;

export const INTENT_KEYS = [
  "SCHEMA",
  "RUN_ID",
  "PROGRAMME_OR_QUESTION_LOCUS",
  "REGISTERED_AT",
  "ACCESS_BOUNDARY",
  "PRECOMMITMENT_LOCUS",
  "PRECOMMITMENT_SHA256",
  "DENOMINATOR_MEMBERSHIP",
  "ACTOR_OVERLAY_LOCUS",
  "ACTOR_OVERLAY_SHA256",
  "EVIDENCE_SINK",
  "PRIVACY_CLASS",
  "RETENTION_CLASS",
  "REGISTERED_EXPECTATION",
  "DISCRIMINATING_OUTCOMES",
  "NEXT_ACTIONS_BY_OUTCOME",
];

export const RECEIPT_KEYS = [
  "SCHEMA",
  "RUN_ID",
  "INTENT_SHA256",
  "STARTED_AT",
  "ENDED_AT",
  "STATUS",
  "EXECUTOR",
  "CAPTURE_SOURCE",
  "CODE_CONFIG_DATA_DIGESTS",
  "OBSERVATION_LOCATOR",
  "OBSERVATION_SHA256",
  "FAILURE_OR_EXCLUSION_REASON",
  "CONTROL_AND_ARTIFACT_CHECK_LOCI",
];

export const JUDGMENT_KEYS = [
  "SCHEMA",
  "JUDGMENT_ID",
  "AUDITABILITY",
  "RUN_IDS",
  "DENOMINATOR_SHA256",
  "MISSING_RECEIPT_RUN_IDS",
  "REGISTERED_EXPECTATION_VS_OBSERVATION",
  "CONTROLS",
  "LEAKAGE",
  "MISSINGNESS",
  "INSTRUMENTATION",
  "ALTERNATIVES_GAINED_OR_LOST",
  "SCOPE_ACTUALLY_TESTED",
  "RESULT_CLASS",
  "TRANSITION",
  "EPISODE_DISPOSITION",
  "POSTDICTION",
  "NEXT_REGISTERED_TEST",
  "AUDIT_CLEARANCE_LOCUS",
  "UNRESOLVED",
  "REOPEN_CONDITION",
];

export const TERMINAL_STATUSES = new Set([
  "succeeded",
  "failed",
  "stopped",
  "aborted",
  "excluded",
]);
export const AUDITABILITY_VALUES = new Set([
  "AUDITABLE",
  "PARTIAL",
  "UNAUDITABLE",
]);
export const RESULT_CLASSES = new Set([
  "EXPECTED",
  "UNEXPECTED",
  "NULL",
  "FAILED",
  "INCONCLUSIVE",
]);
export const TRANSITIONS = new Set([
  "TREE_UPDATE",
  "THESIS_REGENERATE",
  "PROBLEM_RECONSTRUCT",
  "PORTFOLIO_UPDATE",
  "FINISHED_CLAIM",
  "NO_CHANGE",
]);
export const EPISODE_DISPOSITIONS = new Set([
  "PERSIST",
  "PAUSE",
  "RETIRE",
  "REOPEN",
]);
export const LENS_VERDICTS = new Set([
  "EVIDENCED",
  "VIOLATED",
  "NOT-EVIDENCED",
  "NOT-APPLICABLE",
]);
export const REQUIRED_LENS_IDS = [
  "frame-coevolution",
  "generation-evaluation-separation",
  "denominator-retention",
  "premise-alternative-breadth",
  "discriminating-evidence",
  "surprise-uptake",
  "actor-independence",
  "negative-result-retention",
];

export const PLACEHOLDER =
  /^\s*(?:<[^>\n]+>|\[(?:\.{3}|…|\s*)\]|(?:TBD|TODO|FIXME|N\/?A)|未記入|未定|要記入)\s*$/i;
export const PRIVATE_REASONING =
  /(?:<\/?(?:thinking|analysis)>|(?:^|\n)\s*#{1,6}\s*(?:chain[- _]of[- _]thought|internal reasoning|hidden reasoning|private reasoning|raw reasoning)\s*$)/im;
export const CONTROL_ARTIFACT =
  /(?:<\/?(?:system|developer|assistant|user)>|(?:^|\n)\s*#{1,6}\s*(?:system|developer|assistant|user)(?: prompt| message)?\s*$|BEGIN (?:SYSTEM |DEVELOPER |ASSISTANT |USER )?(?:PROMPT|MESSAGE|CONTROL)|```(?:transcript|prompt|control|chat)\b)/im;
export const SCALAR_CREATIVITY =
  /(?:\b(?:creativity|novelty)(?:[_ -]+quality)?[_ -]+score\b|創造性.{0,8}スコア)\s*(?::|=|\bis\b|\bwas\b|\bof\b)\s*[-+]?(?:\d+(?:\.\d+)?|\.\d+)/i;
export const RECEIPT_INTERPRETATION =
  /(?:\b(?:proves?|demonstrates?|therefore|establishes? that|confirms? that)\b|証明|示す|示している)/i;
export const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:sk|rk|pk)-(?:live|test|proj)-[A-Za-z0-9_-]{12,}\b/,
  /\bgh[opusr]_[A-Za-z0-9]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*\b/i,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|cookie|authorization)\s*[:=]\s*(?!<?redacted>?|\[redacted\]|(?:secret-manager|vault|env):)[^\s]{8,}/i,
];

export type PacketKind = "intent" | "judgment" | "receipt";
export type Finding = Readonly<{ code: string; message: string; path: string }>;
export type LoadedPacket = Readonly<{
  digest: string;
  fields: ReadonlyMap<string, string>;
  kind: PacketKind;
  path: string;
  text: string;
}>;
export type Timestamp =
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "none" }>
  | Readonly<{ epochNanoseconds: bigint; kind: "value" }>;

export function withoutComments(text: string): string {
  return text.replaceAll(/<!--[\s\S]*?-->/g, "");
}

export function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function denominatorDigest(runIds: readonly string[]): string {
  return sha256(`${[...new Set(runIds)].sort().join("\n")}\n`);
}

export function addFinding(
  findings: Finding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push({ code, message, path });
}

export function field(packet: LoadedPacket, key: string): string | undefined {
  return packet.fields.get(key);
}
