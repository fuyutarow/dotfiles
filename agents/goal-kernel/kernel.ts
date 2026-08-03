/**
 * Goal Kernel state and native-hook control plane.
 *
 * Hook path: synchronous, zero third-party dependencies, opt-in per workspace.
 * Unconfigured workspaces fail open. Once configured, an unavailable authority binding or
 * event ledger blocks PreToolUse/UserPromptSubmit; post-effect events can only warn.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type Provider = "claude" | "codex";

export type GoalAuthority = Readonly<{
  actor: string;
  approved_at: string;
  source?: string;
}>;

export type GoalDecision = Readonly<{
  decision_id: string;
  summary: string;
  parent_decision_id: string | null;
  evidence_refs: readonly string[];
}>;

export type GoalContract = Readonly<{
  schema_version: 1;
  goal_id: string;
  goal_version: number;
  supersedes_goal_digest: string | null;
  north_star: string;
  acceptance: readonly string[];
  non_goals: readonly string[];
  decisions: readonly GoalDecision[];
  authority: GoalAuthority;
}>;

export type RunDecision = GoalDecision &
  Readonly<{
    schema_version: 1;
    authority: GoalAuthority;
  }>;

type ActiveGoal = Readonly<{
  schema_version: 1;
  goal_id: string;
  goal_version: number;
  goal_digest: string;
  snapshot_rel: string;
  activated_at: string;
}>;

export type RunBinding = Readonly<{
  schema_version: 1;
  run_id: string;
  provider: Provider;
  session_id_sha256: string;
  workspace_root: string;
  goal_id: string;
  goal_version: number;
  goal_digest: string;
  goal_snapshot_rel: string;
  policy_version: string;
  policy_digest: string;
  bound_at: string;
  binding_sha256: string;
}>;

type RunEventBase = Readonly<{
  schema_version: 1;
  event_id: string;
  run_id: string;
  provider: Provider;
  event_type: string;
  provider_event: string;
  occurred_at: string;
  goal_id: string;
  goal_version: number;
  goal_digest: string;
  policy_digest: string;
  [key: string]: unknown;
}>;

export type RunEvent = RunEventBase &
  Readonly<{
    event_sha256: string;
  }>;

export type HookResult = Readonly<{
  exit_code: number;
  stdout: string;
  stderr: string;
  run_id?: string;
  goal_digest?: string;
}>;

const STATE_SCHEMA = 1 as const;
const POLICY_VERSION = "goal-kernel.v1";
const POLICY_DIGEST = sha256Text(
  JSON.stringify({
    policy_version: POLICY_VERSION,
    binding: "first-valid-event-is-immutable",
    configured_without_authority: "deny-pre-effect",
    event_payloads: "hash-only",
    state_integrity: "content-digest",
  }),
);
const SHA256_RE = /^[a-f0-9]{64}$/;
const GOAL_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const DECISION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const RUN_ID_RE = /^gk-(claude|codex)-[a-f0-9]{24}$/;

class GoalKernelError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  locus: string,
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new GoalKernelError(
        "GK_SCHEMA",
        `${locus} has unknown key '${key}'`,
      );
    }
  }
  for (const key of required) {
    if (!(key in value)) {
      throw new GoalKernelError("GK_SCHEMA", `${locus} is missing '${key}'`);
    }
  }
}

function boundedString(
  value: unknown,
  locus: string,
  maxLength = 4_000,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GoalKernelError(
      "GK_SCHEMA",
      `${locus} must be a non-empty string`,
    );
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new GoalKernelError(
      "GK_SCHEMA",
      `${locus} exceeds ${maxLength} characters`,
    );
  }
  return normalized;
}

function stringArray(
  value: unknown,
  locus: string,
  options: Readonly<{ min?: number; max?: number; itemMax?: number }> = {},
): string[] {
  const min = options.min ?? 0;
  const max = options.max ?? 50;
  const itemMax = options.itemMax ?? 1_000;
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new GoalKernelError(
      "GK_SCHEMA",
      `${locus} must contain ${min}..${max} strings`,
    );
  }
  return value.map((item, index) =>
    boundedString(item, `${locus}[${index}]`, itemMax),
  );
}

function parseAuthority(value: unknown, locus: string): GoalAuthority {
  if (!isRecord(value)) {
    throw new GoalKernelError("GK_SCHEMA", `${locus} must be an object`);
  }
  exactKeys(value, ["actor", "approved_at"], ["source"], locus);
  const approvedAt = boundedString(
    value.approved_at,
    `${locus}.approved_at`,
    64,
  );
  if (Number.isNaN(Date.parse(approvedAt))) {
    throw new GoalKernelError(
      "GK_SCHEMA",
      `${locus}.approved_at must be an ISO-compatible timestamp`,
    );
  }
  const source =
    value.source === undefined
      ? undefined
      : boundedString(value.source, `${locus}.source`, 500);
  return {
    actor: boundedString(value.actor, `${locus}.actor`, 200),
    approved_at: approvedAt,
    ...(source === undefined ? {} : { source }),
  };
}

function parseDecision(value: unknown, locus: string): GoalDecision {
  if (!isRecord(value)) {
    throw new GoalKernelError("GK_SCHEMA", `${locus} must be an object`);
  }
  exactKeys(
    value,
    ["decision_id", "summary", "parent_decision_id", "evidence_refs"],
    [],
    locus,
  );
  const decisionId = boundedString(
    value.decision_id,
    `${locus}.decision_id`,
    96,
  );
  if (!DECISION_ID_RE.test(decisionId)) {
    throw new GoalKernelError(
      "GK_SCHEMA",
      `${locus}.decision_id has an invalid shape`,
    );
  }
  const parent = value.parent_decision_id;
  if (parent !== null && typeof parent !== "string") {
    throw new GoalKernelError(
      "GK_SCHEMA",
      `${locus}.parent_decision_id must be a string or null`,
    );
  }
  const normalizedParent =
    parent === null
      ? null
      : boundedString(parent, `${locus}.parent_decision_id`, 96);
  if (normalizedParent !== null && !DECISION_ID_RE.test(normalizedParent)) {
    throw new GoalKernelError(
      "GK_SCHEMA",
      `${locus}.parent_decision_id has an invalid shape`,
    );
  }
  return {
    decision_id: decisionId,
    summary: boundedString(value.summary, `${locus}.summary`, 2_000),
    parent_decision_id: normalizedParent,
    evidence_refs: stringArray(value.evidence_refs, `${locus}.evidence_refs`, {
      max: 50,
      itemMax: 1_000,
    }),
  };
}

function validateDecisionOrder(
  decisions: readonly GoalDecision[],
  initialIds: readonly string[] = [],
): void {
  const seen = new Set(initialIds);
  for (const decision of decisions) {
    if (seen.has(decision.decision_id)) {
      throw new GoalKernelError(
        "GK_DECISION_DUPLICATE",
        `decision '${decision.decision_id}' already exists`,
      );
    }
    if (
      decision.parent_decision_id !== null &&
      !seen.has(decision.parent_decision_id)
    ) {
      throw new GoalKernelError(
        "GK_DECISION_PARENT",
        `decision '${decision.decision_id}' names unknown or later parent '${decision.parent_decision_id}'`,
      );
    }
    seen.add(decision.decision_id);
  }
}

export function parseGoalContract(value: unknown): GoalContract {
  if (!isRecord(value)) {
    throw new GoalKernelError("GK_SCHEMA", "Goal contract must be an object");
  }
  exactKeys(
    value,
    [
      "schema_version",
      "goal_id",
      "goal_version",
      "supersedes_goal_digest",
      "north_star",
      "acceptance",
      "non_goals",
      "decisions",
      "authority",
    ],
    [],
    "Goal contract",
  );
  if (value.schema_version !== STATE_SCHEMA) {
    throw new GoalKernelError("GK_SCHEMA", "schema_version must be 1");
  }
  const goalId = boundedString(value.goal_id, "goal_id", 64);
  if (!GOAL_ID_RE.test(goalId)) {
    throw new GoalKernelError(
      "GK_SCHEMA",
      "goal_id must match [a-z0-9][a-z0-9._-]{0,63}",
    );
  }
  if (
    typeof value.goal_version !== "number" ||
    !Number.isSafeInteger(value.goal_version) ||
    value.goal_version < 1
  ) {
    throw new GoalKernelError(
      "GK_SCHEMA",
      "goal_version must be a positive integer",
    );
  }
  const supersedes = value.supersedes_goal_digest;
  if (
    supersedes !== null &&
    (typeof supersedes !== "string" || !SHA256_RE.test(supersedes))
  ) {
    throw new GoalKernelError(
      "GK_SCHEMA",
      "supersedes_goal_digest must be a SHA-256 digest or null",
    );
  }
  if (value.goal_version === 1 && supersedes !== null) {
    throw new GoalKernelError(
      "GK_GOAL_LINEAGE",
      "goal_version 1 cannot supersede another digest",
    );
  }
  if (value.goal_version > 1 && supersedes === null) {
    throw new GoalKernelError(
      "GK_GOAL_LINEAGE",
      "goal_version > 1 requires supersedes_goal_digest",
    );
  }
  if (!Array.isArray(value.decisions)) {
    throw new GoalKernelError("GK_SCHEMA", "decisions must be an array");
  }
  const decisions = value.decisions.map((decision, index) =>
    parseDecision(decision, `decisions[${index}]`),
  );
  validateDecisionOrder(decisions);
  return {
    schema_version: STATE_SCHEMA,
    goal_id: goalId,
    goal_version: value.goal_version,
    supersedes_goal_digest: supersedes,
    north_star: boundedString(value.north_star, "north_star", 4_000),
    acceptance: stringArray(value.acceptance, "acceptance", {
      min: 1,
      max: 50,
      itemMax: 1_000,
    }),
    non_goals: stringArray(value.non_goals, "non_goals", {
      max: 50,
      itemMax: 1_000,
    }),
    decisions,
    authority: parseAuthority(value.authority, "authority"),
  };
}

export function parseRunDecision(value: unknown): RunDecision {
  if (!isRecord(value)) {
    throw new GoalKernelError("GK_SCHEMA", "Run decision must be an object");
  }
  exactKeys(
    value,
    [
      "schema_version",
      "decision_id",
      "summary",
      "parent_decision_id",
      "evidence_refs",
      "authority",
    ],
    [],
    "Run decision",
  );
  if (value.schema_version !== STATE_SCHEMA) {
    throw new GoalKernelError("GK_SCHEMA", "schema_version must be 1");
  }
  const decision = parseDecision(
    {
      decision_id: value.decision_id,
      summary: value.summary,
      parent_decision_id: value.parent_decision_id,
      evidence_refs: value.evidence_refs,
    },
    "Run decision",
  );
  return {
    schema_version: STATE_SCHEMA,
    ...decision,
    authority: parseAuthority(value.authority, "Run decision.authority"),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Value(value: unknown): string {
  return sha256Text(canonicalJson(value));
}

export function goalKernelPaths(workspaceRoot: string): Readonly<{
  root: string;
  state: string;
  config: string;
  active: string;
  goals: string;
  runs: string;
}> {
  const root = resolve(workspaceRoot);
  const state = join(root, ".agent-state", "goal-kernel");
  return {
    root,
    state,
    config: join(state, "config.json"),
    active: join(state, "ACTIVE.json"),
    goals: join(state, "goals"),
    runs: join(state, "runs"),
  };
}

function ancestors(start: string): string[] {
  const result: string[] = [];
  let current = resolve(start);
  while (true) {
    result.push(current);
    const parent = dirname(current);
    if (parent === current) return result;
    current = parent;
  }
}

export function resolveWorkspaceRoot(start: string): string {
  const candidates = ancestors(start);
  for (const candidate of candidates) {
    if (isTrustedConfig(goalKernelPaths(candidate))) return candidate;
    if (existsSync(join(candidate, ".git"))) return candidate;
  }
  return resolve(start);
}

function ensurePrivateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stats = lstatSync(path);
  if (
    stats.isSymbolicLink() ||
    !stats.isDirectory() ||
    (stats.mode & 0o077) !== 0
  ) {
    throw new GoalKernelError(
      "GK_STATE_PERMISSIONS",
      `${path} must be a private, non-symlink directory`,
    );
  }
}

function isTrustedConfig(paths: ReturnType<typeof goalKernelPaths>): boolean {
  if (!existsSync(paths.state) || !existsSync(paths.config)) return false;
  try {
    const state = lstatSync(paths.state);
    const config = lstatSync(paths.config);
    const currentUid = process.getuid?.();
    const owned =
      currentUid === undefined ||
      (state.uid === currentUid && config.uid === currentUid);
    return (
      owned &&
      !state.isSymbolicLink() &&
      state.isDirectory() &&
      (state.mode & 0o077) === 0 &&
      !config.isSymbolicLink() &&
      config.isFile() &&
      (config.mode & 0o077) === 0 &&
      inside(realpathSync(paths.root), realpathSync(paths.state))
    );
  } catch {
    return false;
  }
}

function writeJsonExclusive(path: string, value: unknown): void {
  ensurePrivateDirectory(dirname(path));
  writeFileSync(path, `${canonicalJson(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function writeJsonAtomic(path: string, value: unknown): void {
  ensurePrivateDirectory(dirname(path));
  const temporary = join(dirname(path), `.${process.pid}-${randomUUID()}.tmp`);
  writeFileSync(temporary, `${canonicalJson(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  renameSync(temporary, path);
}

function withExclusiveStateLock<T>(
  path: string,
  purpose: string,
  operation: () => T,
): T {
  try {
    writeJsonExclusive(path, {
      schema_version: STATE_SCHEMA,
      purpose,
      created_at: new Date().toISOString(),
      pid: process.pid,
    });
  } catch (error) {
    if (!existsSync(path)) throw error;
    throw new GoalKernelError(
      "GK_BUSY",
      `${purpose} is already in progress; inspect ${path} before recovering a stale lock`,
    );
  }
  try {
    return operation();
  } finally {
    unlinkSync(path);
  }
}

function readJson(path: string, locus: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new GoalKernelError(
      "GK_STATE",
      `${locus} is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function inside(root: string, candidate: string): boolean {
  const fromRoot = relative(resolve(root), resolve(candidate));
  return (
    fromRoot === "" ||
    (fromRoot !== ".." &&
      !fromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(fromRoot))
  );
}

function resolveStateRelative(stateRoot: string, path: string): string {
  const candidate = resolve(stateRoot, path);
  if (!inside(stateRoot, candidate)) {
    throw new GoalKernelError("GK_STATE", "state path escapes its workspace");
  }
  return candidate;
}

function contractDigest(contract: GoalContract): string {
  return sha256Text(canonicalJson(contract));
}

function goalSnapshotPath(
  paths: ReturnType<typeof goalKernelPaths>,
  goalId: string,
  goalVersion: number,
  digest: string,
): string {
  return join(paths.goals, goalId, `v${goalVersion}-${digest}.json`);
}

function findVersionSnapshots(
  paths: ReturnType<typeof goalKernelPaths>,
  goalId: string,
  goalVersion: number,
): string[] {
  const directory = join(paths.goals, goalId);
  if (!existsSync(directory)) return [];
  const prefix = `v${goalVersion}-`;
  return readdirSync(directory)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .map((name) => join(directory, name));
}

function readGoalSnapshot(path: string, expectedDigest?: string): GoalContract {
  const contract = parseGoalContract(readJson(path, "Goal snapshot"));
  const actualDigest = contractDigest(contract);
  if (expectedDigest !== undefined && actualDigest !== expectedDigest) {
    throw new GoalKernelError(
      "GK_INTEGRITY",
      `Goal snapshot digest mismatch: expected ${expectedDigest}, got ${actualDigest}`,
    );
  }
  return contract;
}

function readActivePointer(
  paths: ReturnType<typeof goalKernelPaths>,
): ActiveGoal {
  const value = readJson(paths.active, "ACTIVE.json");
  if (!isRecord(value)) {
    throw new GoalKernelError("GK_STATE", "ACTIVE.json must be an object");
  }
  exactKeys(
    value,
    [
      "schema_version",
      "goal_id",
      "goal_version",
      "goal_digest",
      "snapshot_rel",
      "activated_at",
    ],
    [],
    "ACTIVE.json",
  );
  if (
    value.schema_version !== STATE_SCHEMA ||
    typeof value.goal_id !== "string" ||
    typeof value.goal_version !== "number" ||
    typeof value.goal_digest !== "string" ||
    !SHA256_RE.test(value.goal_digest) ||
    typeof value.snapshot_rel !== "string" ||
    typeof value.activated_at !== "string"
  ) {
    throw new GoalKernelError("GK_STATE", "ACTIVE.json has invalid fields");
  }
  return {
    schema_version: STATE_SCHEMA,
    goal_id: value.goal_id,
    goal_version: value.goal_version,
    goal_digest: value.goal_digest,
    snapshot_rel: value.snapshot_rel,
    activated_at: value.activated_at,
  };
}

function loadActiveGoal(
  paths: ReturnType<typeof goalKernelPaths>,
): Readonly<{ active: ActiveGoal; goal: GoalContract; snapshotPath: string }> {
  const active = readActivePointer(paths);
  const snapshotPath = resolveStateRelative(paths.state, active.snapshot_rel);
  const goal = readGoalSnapshot(snapshotPath, active.goal_digest);
  if (
    goal.goal_id !== active.goal_id ||
    goal.goal_version !== active.goal_version
  ) {
    throw new GoalKernelError(
      "GK_INTEGRITY",
      "ACTIVE.json identity does not match its Goal snapshot",
    );
  }
  return { active, goal, snapshotPath };
}

function ensureConfig(paths: ReturnType<typeof goalKernelPaths>): void {
  ensurePrivateDirectory(paths.state);
  const expected = {
    schema_version: STATE_SCHEMA,
    enabled: true,
    policy_version: POLICY_VERSION,
    policy_digest: POLICY_DIGEST,
  };
  if (!existsSync(paths.config)) {
    writeJsonExclusive(paths.config, expected);
    return;
  }
  if (!isTrustedConfig(paths)) {
    throw new GoalKernelError(
      "GK_STATE_PERMISSIONS",
      "config.json or its state directory is not private and trusted",
    );
  }
  const actual = readJson(paths.config, "config.json");
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new GoalKernelError(
      "GK_CONFIG",
      "config.json does not match the installed Goal Kernel policy",
    );
  }
}

export function activateGoal(
  workspaceRoot: string,
  input: unknown,
): Readonly<{
  workspace_root: string;
  goal_id: string;
  goal_version: number;
  goal_digest: string;
  snapshot_path: string;
  activated_at: string;
}> {
  const paths = goalKernelPaths(workspaceRoot);
  const contract = parseGoalContract(input);
  ensurePrivateDirectory(paths.state);
  return withExclusiveStateLock(
    join(paths.state, ".activation.lock"),
    "Goal activation",
    () => {
      const digest = contractDigest(contract);
      const snapshotPath = goalSnapshotPath(
        paths,
        contract.goal_id,
        contract.goal_version,
        digest,
      );

      const sameVersion = findVersionSnapshots(
        paths,
        contract.goal_id,
        contract.goal_version,
      );
      const conflicting = sameVersion.find((path) => path !== snapshotPath);
      if (conflicting !== undefined) {
        throw new GoalKernelError(
          "GK_GOAL_VERSION_CONFLICT",
          `Goal '${contract.goal_id}' version ${contract.goal_version} already has a different digest`,
        );
      }

      if (contract.goal_version > 1) {
        const priorDigest = contract.supersedes_goal_digest;
        if (priorDigest === null) {
          throw new GoalKernelError(
            "GK_GOAL_LINEAGE",
            "goal_version > 1 requires supersedes_goal_digest",
          );
        }
        const priorPath = goalSnapshotPath(
          paths,
          contract.goal_id,
          contract.goal_version - 1,
          priorDigest,
        );
        if (!existsSync(priorPath)) {
          throw new GoalKernelError(
            "GK_GOAL_LINEAGE",
            `superseded Goal snapshot is missing: ${contract.supersedes_goal_digest}`,
          );
        }
        readGoalSnapshot(priorPath, priorDigest);
      }

      if (existsSync(snapshotPath)) {
        readGoalSnapshot(snapshotPath, digest);
      } else {
        writeJsonExclusive(snapshotPath, contract);
      }
      ensureConfig(paths);
      const activatedAt = new Date().toISOString();
      const active: ActiveGoal = {
        schema_version: STATE_SCHEMA,
        goal_id: contract.goal_id,
        goal_version: contract.goal_version,
        goal_digest: digest,
        snapshot_rel: relative(paths.state, snapshotPath),
        activated_at: activatedAt,
      };
      writeJsonAtomic(paths.active, active);
      return {
        workspace_root: paths.root,
        goal_id: contract.goal_id,
        goal_version: contract.goal_version,
        goal_digest: digest,
        snapshot_path: snapshotPath,
        activated_at: activatedAt,
      };
    },
  );
}

function runId(provider: Provider, sessionId: string): string {
  const digest = sha256Text(`${provider}\u0000${sessionId}`);
  return `gk-${provider}-${digest.slice(0, 24)}`;
}

function validateRunId(value: string): void {
  if (!RUN_ID_RE.test(value)) {
    throw new GoalKernelError("GK_RUN_ID", `invalid run id '${value}'`);
  }
}

function runDirectory(
  paths: ReturnType<typeof goalKernelPaths>,
  id: string,
): string {
  validateRunId(id);
  return join(paths.runs, id);
}

function parseBinding(value: unknown): RunBinding {
  if (!isRecord(value)) {
    throw new GoalKernelError("GK_STATE", "run binding must be an object");
  }
  const required = [
    "schema_version",
    "run_id",
    "provider",
    "session_id_sha256",
    "workspace_root",
    "goal_id",
    "goal_version",
    "goal_digest",
    "goal_snapshot_rel",
    "policy_version",
    "policy_digest",
    "bound_at",
    "binding_sha256",
  ];
  exactKeys(value, required, [], "run binding");
  if (
    value.schema_version !== STATE_SCHEMA ||
    typeof value.run_id !== "string" ||
    !RUN_ID_RE.test(value.run_id) ||
    (value.provider !== "claude" && value.provider !== "codex") ||
    typeof value.session_id_sha256 !== "string" ||
    !SHA256_RE.test(value.session_id_sha256) ||
    typeof value.workspace_root !== "string" ||
    typeof value.goal_id !== "string" ||
    typeof value.goal_version !== "number" ||
    typeof value.goal_digest !== "string" ||
    !SHA256_RE.test(value.goal_digest) ||
    typeof value.goal_snapshot_rel !== "string" ||
    value.policy_version !== POLICY_VERSION ||
    value.policy_digest !== POLICY_DIGEST ||
    typeof value.bound_at !== "string" ||
    typeof value.binding_sha256 !== "string" ||
    !SHA256_RE.test(value.binding_sha256)
  ) {
    throw new GoalKernelError("GK_STATE", "run binding has invalid fields");
  }
  const binding: RunBinding = {
    schema_version: STATE_SCHEMA,
    run_id: value.run_id,
    provider: value.provider,
    session_id_sha256: value.session_id_sha256,
    workspace_root: value.workspace_root,
    goal_id: value.goal_id,
    goal_version: value.goal_version,
    goal_digest: value.goal_digest,
    goal_snapshot_rel: value.goal_snapshot_rel,
    policy_version: POLICY_VERSION,
    policy_digest: POLICY_DIGEST,
    bound_at: value.bound_at,
    binding_sha256: value.binding_sha256,
  };
  const { binding_sha256: expectedDigest, ...body } = binding;
  const actualDigest = sha256Value(body);
  if (actualDigest !== expectedDigest) {
    throw new GoalKernelError(
      "GK_INTEGRITY",
      `run binding digest mismatch: expected ${expectedDigest}, got ${actualDigest}`,
    );
  }
  return binding;
}

export function readRunBinding(workspaceRoot: string, id: string): RunBinding {
  const paths = goalKernelPaths(workspaceRoot);
  const bindingPath = join(runDirectory(paths, id), "binding.json");
  return parseBinding(readJson(bindingPath, `binding for ${id}`));
}

export function readBoundGoal(
  workspaceRoot: string,
  binding: RunBinding,
): GoalContract {
  const paths = goalKernelPaths(workspaceRoot);
  const snapshot = resolveStateRelative(paths.state, binding.goal_snapshot_rel);
  const goal = readGoalSnapshot(snapshot, binding.goal_digest);
  if (
    goal.goal_id !== binding.goal_id ||
    goal.goal_version !== binding.goal_version
  ) {
    throw new GoalKernelError(
      "GK_INTEGRITY",
      `binding ${binding.run_id} does not match its Goal snapshot`,
    );
  }
  return goal;
}

function ensureRunBinding(
  paths: ReturnType<typeof goalKernelPaths>,
  provider: Provider,
  sessionId: string,
): Readonly<{ binding: RunBinding; goal: GoalContract }> {
  ensureConfig(paths);
  const id = runId(provider, sessionId);
  const directory = runDirectory(paths, id);
  const bindingPath = join(directory, "binding.json");
  const expectedSessionHash = sha256Text(sessionId);
  if (existsSync(bindingPath)) {
    const binding = parseBinding(readJson(bindingPath, `binding for ${id}`));
    if (
      binding.provider !== provider ||
      binding.session_id_sha256 !== expectedSessionHash ||
      binding.workspace_root !== paths.root
    ) {
      throw new GoalKernelError(
        "GK_INTEGRITY",
        `run id collision or binding mismatch for ${id}`,
      );
    }
    return { binding, goal: readBoundGoal(paths.root, binding) };
  }

  const { active, goal, snapshotPath } = loadActiveGoal(paths);
  const bindingBody: Omit<RunBinding, "binding_sha256"> = {
    schema_version: STATE_SCHEMA,
    run_id: id,
    provider,
    session_id_sha256: expectedSessionHash,
    workspace_root: paths.root,
    goal_id: active.goal_id,
    goal_version: active.goal_version,
    goal_digest: active.goal_digest,
    goal_snapshot_rel: relative(paths.state, snapshotPath),
    policy_version: POLICY_VERSION,
    policy_digest: POLICY_DIGEST,
    bound_at: new Date().toISOString(),
  };
  const binding: RunBinding = {
    ...bindingBody,
    binding_sha256: sha256Value(bindingBody),
  };
  try {
    writeJsonExclusive(bindingPath, binding);
  } catch (error) {
    if (!existsSync(bindingPath)) throw error;
    const raced = parseBinding(readJson(bindingPath, `binding for ${id}`));
    return { binding: raced, goal: readBoundGoal(paths.root, raced) };
  }
  return { binding, goal };
}

function eventIdentity(): Readonly<{ id: string; at: string }> {
  const at = new Date().toISOString();
  const id = `${Date.now().toString().padStart(13, "0")}-${randomUUID()}`;
  return { id, at };
}

function appendRunEvent(
  workspaceRoot: string,
  binding: RunBinding,
  event: Record<string, unknown>,
): RunEvent {
  const paths = goalKernelPaths(workspaceRoot);
  const ids = eventIdentity();
  const base: RunEventBase = {
    ...event,
    schema_version: STATE_SCHEMA,
    event_id: ids.id,
    run_id: binding.run_id,
    provider: binding.provider,
    event_type: String(event.event_type ?? "provider.event"),
    provider_event: String(event.provider_event ?? "unknown"),
    occurred_at: ids.at,
    goal_id: binding.goal_id,
    goal_version: binding.goal_version,
    goal_digest: binding.goal_digest,
    policy_digest: binding.policy_digest,
  };
  const value: RunEvent = {
    ...base,
    event_sha256: sha256Value(base),
  };
  const name = `${ids.id}-${value.event_sha256}.json`;
  const path = join(runDirectory(paths, binding.run_id), "events", name);
  writeJsonExclusive(path, value);
  return value;
}

export function listRunEvents(workspaceRoot: string, id: string): RunEvent[] {
  const paths = goalKernelPaths(workspaceRoot);
  const directory = join(runDirectory(paths, id), "events");
  if (!existsSync(directory)) return [];
  const events: RunEvent[] = [];
  for (const name of readdirSync(directory)
    .filter((entry) => entry.endsWith(".json"))
    .sort()) {
    const value = readJson(join(directory, name), `event ${name}`);
    if (!isRecord(value)) {
      throw new GoalKernelError("GK_STATE", `event ${name} must be an object`);
    }
    const filenameDigest = name.match(/-([a-f0-9]{64})\.json$/)?.[1];
    const eventDigest = value.event_sha256;
    if (
      filenameDigest === undefined ||
      typeof eventDigest !== "string" ||
      !SHA256_RE.test(eventDigest)
    ) {
      throw new GoalKernelError(
        "GK_INTEGRITY",
        `event ${name} has no valid content digest`,
      );
    }
    const { event_sha256: _storedDigest, ...body } = value;
    const actualDigest = sha256Value(body);
    if (eventDigest !== filenameDigest || eventDigest !== actualDigest) {
      throw new GoalKernelError(
        "GK_INTEGRITY",
        `event ${name} digest mismatch`,
      );
    }
    if (
      value.schema_version !== STATE_SCHEMA ||
      typeof value.event_id !== "string" ||
      typeof value.run_id !== "string" ||
      (value.provider !== "claude" && value.provider !== "codex") ||
      typeof value.event_type !== "string" ||
      typeof value.provider_event !== "string" ||
      typeof value.occurred_at !== "string" ||
      typeof value.goal_id !== "string" ||
      typeof value.goal_version !== "number" ||
      typeof value.goal_digest !== "string" ||
      typeof value.policy_digest !== "string"
    ) {
      throw new GoalKernelError(
        "GK_STATE",
        `event ${name} has invalid required fields`,
      );
    }
    events.push({
      ...value,
      schema_version: STATE_SCHEMA,
      event_id: value.event_id,
      run_id: value.run_id,
      provider: value.provider,
      event_type: value.event_type,
      provider_event: value.provider_event,
      occurred_at: value.occurred_at,
      goal_id: value.goal_id,
      goal_version: value.goal_version,
      goal_digest: value.goal_digest,
      policy_digest: value.policy_digest,
      event_sha256: eventDigest,
    });
  }
  return events;
}

function transcriptPath(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "" || !isAbsolute(value)) {
    return undefined;
  }
  return resolve(value);
}

function optionalString(value: unknown, maxLength = 500): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, maxLength)
    : undefined;
}

function safeWorkspacePath(path: string, workspaceRoot: string): string {
  if (path.includes("://")) return `opaque-sha256:${sha256Text(path)}`;
  const absolute = isAbsolute(path)
    ? resolve(path)
    : resolve(workspaceRoot, path);
  if (!inside(workspaceRoot, absolute)) {
    return `external-sha256:${sha256Text(absolute)}`;
  }
  const local = relative(workspaceRoot, absolute);
  return local === "" ? "." : local;
}

function toolWorkspacePaths(
  toolInput: unknown,
  workspaceRoot: string,
): string[] {
  if (!isRecord(toolInput)) return [];
  const paths: string[] = [];
  for (const key of ["file_path", "path"] as const) {
    const value = toolInput[key];
    if (typeof value === "string" && value !== "") {
      paths.push(safeWorkspacePath(value, workspaceRoot));
    }
  }
  const command = toolInput.command;
  if (typeof command === "string" && command.includes("*** Begin Patch")) {
    for (const match of command.matchAll(
      /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm,
    )) {
      const path = match[1]?.trim();
      if (path !== undefined && path !== "") {
        paths.push(safeWorkspacePath(path, workspaceRoot));
      }
    }
  }
  return [...new Set(paths)].sort();
}

function providerEventType(event: string): string {
  const mapping: Record<string, string> = {
    SessionStart: "session.started",
    SessionEnd: "session.ended",
    UserPromptSubmit: "prompt.submitted",
    PreToolUse: "tool.requested",
    PostToolUse: "tool.completed",
    PostToolUseFailure: "tool.failed",
    Stop: "run.stopped",
    SubagentStart: "subagent.started",
    SubagentStop: "subagent.stopped",
  };
  return mapping[event] ?? "provider.event";
}

function hookEvent(
  input: Record<string, unknown>,
  providerEvent: string,
  workspaceRoot: string,
): Record<string, unknown> {
  const event: Record<string, unknown> = {
    event_type: providerEventType(providerEvent),
    provider_event: providerEvent,
  };
  const copyStrings = [
    "turn_id",
    "tool_name",
    "tool_use_id",
    "agent_id",
    "agent_type",
    "source",
    "permission_mode",
    "model",
  ];
  for (const key of copyStrings) {
    const value = optionalString(input[key]);
    if (value !== undefined) event[key] = value;
  }
  const reason = optionalString(input.reason, 10_000);
  if (reason !== undefined) {
    event.reason_sha256 = sha256Text(reason);
    event.reason_bytes = Buffer.byteLength(reason);
  }
  const path = transcriptPath(input.transcript_path);
  if (path !== undefined) event.transcript_path = path;
  if (providerEvent === "UserPromptSubmit") {
    if (typeof input.prompt !== "string") {
      throw new GoalKernelError(
        "GK_HOOK_PAYLOAD",
        "UserPromptSubmit is missing prompt",
      );
    }
    event.prompt_sha256 = sha256Text(input.prompt);
    event.prompt_bytes = Buffer.byteLength(input.prompt);
  }
  if (providerEvent === "PreToolUse") {
    event.kernel_decision = "defer";
    event.tool_input_sha256 = sha256Value(input.tool_input ?? null);
    const workspacePaths = toolWorkspacePaths(input.tool_input, workspaceRoot);
    if (workspacePaths.length > 0) event.workspace_paths = workspacePaths;
  }
  if (
    providerEvent === "PostToolUse" ||
    providerEvent === "PostToolUseFailure"
  ) {
    event.tool_input_sha256 = sha256Value(input.tool_input ?? null);
    const workspacePaths = toolWorkspacePaths(input.tool_input, workspaceRoot);
    if (workspacePaths.length > 0) event.workspace_paths = workspacePaths;
    if (providerEvent === "PostToolUse") {
      event.tool_response_sha256 = sha256Value(input.tool_response ?? null);
      if (isRecord(input.tool_response)) {
        const exitCode =
          input.tool_response.exit_code ?? input.tool_response.exitCode;
        if (typeof exitCode === "number" && Number.isSafeInteger(exitCode)) {
          event.tool_exit_code = exitCode;
        }
      }
    } else {
      event.tool_error_sha256 = sha256Value(input.error ?? null);
    }
  }
  return event;
}

function goalContext(
  binding: RunBinding,
  goal: GoalContract,
  concise: boolean,
): string {
  const header = [
    "GOAL KERNEL — immutable authority binding for this run",
    `RUN_ID: ${binding.run_id}`,
    `GOAL: ${goal.goal_id} v${goal.goal_version} sha256:${binding.goal_digest.slice(0, 16)}`,
    `NORTH_STAR: ${goal.north_star}`,
  ];
  if (concise) {
    return `${header.join("\n")}\nDo not silently change this Goal. A changed North Star requires a new Goal version and a new task.`;
  }
  const lines = [
    ...header,
    "ACCEPTANCE:",
    ...goal.acceptance.map((item) => `- ${item}`),
    "NON_GOALS:",
    ...(goal.non_goals.length === 0
      ? ["- (none declared)"]
      : goal.non_goals.map((item) => `- ${item}`)),
    "DECISIONS:",
    ...(goal.decisions.length === 0
      ? ["- (none recorded at activation)"]
      : goal.decisions.map(
          (decision) => `- ${decision.decision_id}: ${decision.summary}`,
        )),
    "Do not silently change this Goal. A changed North Star requires a new Goal version and a new task.",
  ];
  return lines.join("\n").slice(0, 12_000);
}

function jsonOutput(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function contextOutput(event: string, context: string): string {
  return jsonOutput({
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: context,
    },
  });
}

function denyPre(reason: string): HookResult {
  return {
    exit_code: 0,
    stdout: jsonOutput({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
    stderr: "",
  };
}

function blockPrompt(reason: string): HookResult {
  return {
    exit_code: 0,
    stdout: jsonOutput({ decision: "block", reason }),
    stderr: "",
  };
}

function warning(reason: string): HookResult {
  return {
    exit_code: 0,
    stdout: jsonOutput({ systemMessage: reason }),
    stderr: "",
  };
}

function neutralHookResult(
  provider: Provider,
  providerEvent: string,
): HookResult {
  const requiresJson =
    provider === "codex" &&
    (providerEvent === "Stop" || providerEvent === "SubagentStop");
  return {
    exit_code: 0,
    stdout: requiresJson ? jsonOutput({}) : "",
    stderr: "",
  };
}

export function processHookEvent(
  provider: Provider,
  value: unknown,
): HookResult {
  if (!isRecord(value)) {
    return {
      exit_code: 1,
      stdout: "",
      stderr: "goal-kernel: GK_HOOK_PAYLOAD: input must be an object\n",
    };
  }
  const providerEvent = optionalString(value.hook_event_name, 100) ?? "unknown";
  const cwd = typeof value.cwd === "string" ? value.cwd : process.cwd();
  const root = resolveWorkspaceRoot(cwd);
  const paths = goalKernelPaths(root);
  if (!isTrustedConfig(paths)) {
    if (!existsSync(paths.config)) {
      return neutralHookResult(provider, providerEvent);
    }
    const reason =
      "GK_CONFIG_UNTRUSTED: config.json or its state directory is not private and trusted";
    if (providerEvent === "PreToolUse") return denyPre(reason);
    if (providerEvent === "UserPromptSubmit") return blockPrompt(reason);
    return warning(reason);
  }
  const sessionId = optionalString(value.session_id, 1_000);
  if (sessionId === undefined) {
    const reason =
      "GK_HOOK_PAYLOAD: configured workspace event lacks session_id";
    if (providerEvent === "PreToolUse") return denyPre(reason);
    if (providerEvent === "UserPromptSubmit") return blockPrompt(reason);
    return warning(reason);
  }

  let binding: RunBinding;
  let goal: GoalContract;
  try {
    ({ binding, goal } = ensureRunBinding(paths, provider, sessionId));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const reason = `GK_AUTHORITY_UNAVAILABLE: ${detail}`;
    if (providerEvent === "PreToolUse") return denyPre(reason);
    if (providerEvent === "UserPromptSubmit") return blockPrompt(reason);
    return warning(reason);
  }

  try {
    appendRunEvent(root, binding, hookEvent(value, providerEvent, root));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const reason = `GK_EVENT_LEDGER_UNAVAILABLE: ${detail}`;
    if (providerEvent === "PreToolUse") return denyPre(reason);
    if (providerEvent === "UserPromptSubmit") return blockPrompt(reason);
    return {
      ...warning(reason),
      run_id: binding.run_id,
      goal_digest: binding.goal_digest,
    };
  }

  if (providerEvent === "SessionStart" || providerEvent === "SubagentStart") {
    return {
      exit_code: 0,
      stdout: contextOutput(providerEvent, goalContext(binding, goal, false)),
      stderr: "",
      run_id: binding.run_id,
      goal_digest: binding.goal_digest,
    };
  }
  if (providerEvent === "UserPromptSubmit") {
    return {
      exit_code: 0,
      stdout: contextOutput(providerEvent, goalContext(binding, goal, true)),
      stderr: "",
      run_id: binding.run_id,
      goal_digest: binding.goal_digest,
    };
  }
  return {
    ...neutralHookResult(provider, providerEvent),
    run_id: binding.run_id,
    goal_digest: binding.goal_digest,
  };
}

export function runGoalKernelHook(provider: Provider): void {
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch (error) {
    process.stderr.write(
      `goal-kernel: malformed hook JSON: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const result = processHookEvent(provider, input);
  if (result.stdout !== "") process.stdout.write(result.stdout);
  if (result.stderr !== "") process.stderr.write(result.stderr);
  process.exitCode = result.exit_code;
}

export function recordRunDecision(
  workspaceRoot: string,
  id: string,
  input: unknown,
): RunEvent {
  const decision = parseRunDecision(input);
  const binding = readRunBinding(workspaceRoot, id);
  const goal = readBoundGoal(workspaceRoot, binding);
  const paths = goalKernelPaths(workspaceRoot);
  return withExclusiveStateLock(
    join(runDirectory(paths, id), ".decision.lock"),
    `decision recording for ${id}`,
    () => {
      const existingEvents = listRunEvents(workspaceRoot, id);
      const recorded = existingEvents
        .filter((event) => event.event_type === "decision.recorded")
        .map((event) => parseRunDecision(event.decision));
      validateDecisionOrder(
        [decision],
        [
          ...goal.decisions.map((item) => item.decision_id),
          ...recorded.map((item) => item.decision_id),
        ],
      );
      return appendRunEvent(workspaceRoot, binding, {
        event_type: "decision.recorded",
        provider_event: "GoalKernelDecision",
        decision,
      });
    },
  );
}

export function readGoalStatus(workspaceRoot: string): Readonly<{
  workspace_root: string;
  configured: boolean;
  policy_version: string;
  policy_digest: string;
  active?: Readonly<{
    goal: GoalContract;
    goal_digest: string;
    activated_at: string;
  }>;
  runs: readonly Readonly<{
    run_id: string;
    provider: Provider;
    goal_id: string;
    goal_version: number;
    goal_digest: string;
    bound_at: string;
  }>[];
}> {
  const paths = goalKernelPaths(workspaceRoot);
  if (!existsSync(paths.config)) {
    return {
      workspace_root: paths.root,
      configured: false,
      policy_version: POLICY_VERSION,
      policy_digest: POLICY_DIGEST,
      runs: [],
    };
  }
  if (!isTrustedConfig(paths)) {
    throw new GoalKernelError(
      "GK_STATE_PERMISSIONS",
      "config.json or its state directory is not private and trusted",
    );
  }
  ensureConfig(paths);
  const active = loadActiveGoal(paths);
  const runs = existsSync(paths.runs)
    ? readdirSync(paths.runs)
        .filter((name) => RUN_ID_RE.test(name))
        .map((name) => readRunBinding(paths.root, name))
        .sort((left, right) => right.bound_at.localeCompare(left.bound_at))
        .map((binding) => ({
          run_id: binding.run_id,
          provider: binding.provider,
          goal_id: binding.goal_id,
          goal_version: binding.goal_version,
          goal_digest: binding.goal_digest,
          bound_at: binding.bound_at,
        }))
    : [];
  return {
    workspace_root: paths.root,
    configured: true,
    policy_version: POLICY_VERSION,
    policy_digest: POLICY_DIGEST,
    active: {
      goal: active.goal,
      goal_digest: active.active.goal_digest,
      activated_at: active.active.activated_at,
    },
    runs,
  };
}

export function transcriptLocator(
  events: readonly RunEvent[],
): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const candidate = events[index]?.transcript_path;
    if (typeof candidate === "string" && isAbsolute(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function assertReadableRegularFile(
  path: string,
  maxBytes: number,
): void {
  const stats = statSync(path);
  if (!stats.isFile()) {
    throw new GoalKernelError(
      "GK_TRANSCRIPT",
      "transcript is not a regular file",
    );
  }
  if (stats.size > maxBytes) {
    throw new GoalKernelError(
      "GK_TRANSCRIPT",
      `transcript exceeds ${maxBytes} bytes`,
    );
  }
}
