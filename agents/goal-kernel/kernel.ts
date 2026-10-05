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
import {
  err,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  Result,
  type Result as NeverthrowResult,
} from "neverthrow";
import { errorMessage } from "../hooks/attempt.ts";
import { jsonText } from "../hooks/zod.ts";

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
const SHA256_RE = /^[a-f0-9]{64}$/u;
const GOAL_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const DECISION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u;
const RUN_ID_RE = /^gk-(claude|codex)-[a-f0-9]{24}$/u;

class GoalKernelError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
  }
}

type KernelResult<T> = NeverthrowResult<T, Error>;

function caught<T>(operation: () => T): KernelResult<T> {
  return fromThrowable(operation, (error) =>
    error instanceof Error ? error : new Error(String(error)),
  )();
}

async function caughtAsync<T>(
  operation: () => Promise<T>,
): Promise<KernelResult<T>> {
  const result = await fromAsyncThrowable(operation, (error) =>
    error instanceof Error ? error : new Error(String(error)),
  )();
  return result;
}

// A plain object as a Record, or undefined for anything else (null, arrays, primitives). The
// shallow copy is what lets the compiler see the narrowed type without a cast or a hand-written
// type predicate; Object.fromEntries defines own properties, so a "__proto__" key stays data.
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value));
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  locus: string,
): KernelResult<void> {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      return err(
        new GoalKernelError("GK_SCHEMA", `${locus} has unknown key '${key}'`),
      );
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      return err(
        new GoalKernelError("GK_SCHEMA", `${locus} is missing '${key}'`),
      );
    }
  }
  return ok(undefined);
}

function boundedString(
  value: unknown,
  locus: string,
  maxLength = 4_000,
): KernelResult<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return err(
      new GoalKernelError("GK_SCHEMA", `${locus} must be a non-empty string`),
    );
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return err(
      new GoalKernelError(
        "GK_SCHEMA",
        `${locus} exceeds ${maxLength} characters`,
      ),
    );
  }
  return ok(normalized);
}

function stringArray(
  value: unknown,
  locus: string,
  options: Readonly<{ min?: number; max?: number; itemMax?: number }> = {},
): KernelResult<string[]> {
  const min = options.min ?? 0;
  const max = options.max ?? 50;
  const itemMax = options.itemMax ?? 1_000;
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    return err(
      new GoalKernelError(
        "GK_SCHEMA",
        `${locus} must contain ${min}..${max} strings`,
      ),
    );
  }
  return Result.combine(
    value.map((item, index) =>
      boundedString(item, `${locus}[${index}]`, itemMax),
    ),
  );
}

// "ISO-compatible" = an ISO 8601 instant, local date-time, or date. Temporal parses exactly
// those; Date.parse also took implementation-defined forms ("Sep 27 2026") and rolled
// impossible dates (02-30) over instead of rejecting them.
const ISO_PARSERS: ReadonlyArray<(s: string) => unknown> = [
  (s) => Temporal.Instant.from(s),
  (s) => Temporal.PlainDateTime.from(s),
  (s) => Temporal.PlainDate.from(s),
];
async function isIsoTimestamp(s: string): Promise<boolean> {
  for (const parse of ISO_PARSERS) {
    // Tried in order; the first shape that parses wins.
    const result = await Promise.resolve(caught(() => parse(s)));
    if (result.isOk()) return true;
  }
  return false;
}

async function parseAuthority(
  input: unknown,
  locus: string,
): Promise<KernelResult<GoalAuthority>> {
  const value = asRecord(input);
  if (value === undefined) {
    return err(new GoalKernelError("GK_SCHEMA", `${locus} must be an object`));
  }
  const keys = exactKeys(value, ["actor", "approved_at"], ["source"], locus);
  if (keys.isErr()) return err(keys.error);
  const approvedAtResult = boundedString(
    value.approved_at,
    `${locus}.approved_at`,
    64,
  );
  if (approvedAtResult.isErr()) return err(approvedAtResult.error);
  const approvedAt = approvedAtResult.value;
  if (!(await isIsoTimestamp(approvedAt))) {
    return err(
      new GoalKernelError(
        "GK_SCHEMA",
        `${locus}.approved_at must be an ISO-compatible timestamp`,
      ),
    );
  }
  const sourceResult =
    value.source === undefined
      ? undefined
      : boundedString(value.source, `${locus}.source`, 500);
  if (sourceResult !== undefined && sourceResult.isErr()) {
    return err(sourceResult.error);
  }
  const actorResult = boundedString(value.actor, `${locus}.actor`, 200);
  if (actorResult.isErr()) return err(actorResult.error);
  return ok({
    actor: actorResult.value,
    approved_at: approvedAt,
    ...(sourceResult === undefined ? {} : { source: sourceResult.value }),
  });
}

function parseDecision(
  input: unknown,
  locus: string,
): KernelResult<GoalDecision> {
  const value = asRecord(input);
  if (value === undefined) {
    return err(new GoalKernelError("GK_SCHEMA", `${locus} must be an object`));
  }
  const keys = exactKeys(
    value,
    ["decision_id", "summary", "parent_decision_id", "evidence_refs"],
    [],
    locus,
  );
  if (keys.isErr()) return err(keys.error);
  const decisionIdResult = boundedString(
    value.decision_id,
    `${locus}.decision_id`,
    96,
  );
  if (decisionIdResult.isErr()) return err(decisionIdResult.error);
  const decisionId = decisionIdResult.value;
  if (!DECISION_ID_RE.test(decisionId)) {
    return err(
      new GoalKernelError(
        "GK_SCHEMA",
        `${locus}.decision_id has an invalid shape`,
      ),
    );
  }
  const parent = value.parent_decision_id;
  if (parent !== null && typeof parent !== "string") {
    return err(
      new GoalKernelError(
        "GK_SCHEMA",
        `${locus}.parent_decision_id must be a string or null`,
      ),
    );
  }
  const normalizedParentResult =
    parent === null
      ? ok<null, Error>(null)
      : boundedString(parent, `${locus}.parent_decision_id`, 96);
  if (normalizedParentResult.isErr()) return err(normalizedParentResult.error);
  const normalizedParent = normalizedParentResult.value;
  if (normalizedParent !== null && !DECISION_ID_RE.test(normalizedParent)) {
    return err(
      new GoalKernelError(
        "GK_SCHEMA",
        `${locus}.parent_decision_id has an invalid shape`,
      ),
    );
  }
  const summary = boundedString(value.summary, `${locus}.summary`, 2_000);
  if (summary.isErr()) return err(summary.error);
  const evidence = stringArray(value.evidence_refs, `${locus}.evidence_refs`, {
    max: 50,
    itemMax: 1_000,
  });
  if (evidence.isErr()) return err(evidence.error);
  return ok({
    decision_id: decisionId,
    summary: summary.value,
    parent_decision_id: normalizedParent,
    evidence_refs: evidence.value,
  });
}

function validateDecisionOrder(
  decisions: readonly GoalDecision[],
  initialIds: readonly string[] = [],
): KernelResult<void> {
  const seen = new Set(initialIds);
  for (const decision of decisions) {
    if (seen.has(decision.decision_id)) {
      return err(
        new GoalKernelError(
          "GK_DECISION_DUPLICATE",
          `decision '${decision.decision_id}' already exists`,
        ),
      );
    }
    if (
      decision.parent_decision_id !== null &&
      !seen.has(decision.parent_decision_id)
    ) {
      return err(
        new GoalKernelError(
          "GK_DECISION_PARENT",
          `decision '${decision.decision_id}' names unknown or later parent '${decision.parent_decision_id}'`,
        ),
      );
    }
    seen.add(decision.decision_id);
  }
  return ok(undefined);
}

export async function parseGoalContract(
  input: unknown,
): Promise<KernelResult<GoalContract>> {
  const value = asRecord(input);
  if (value === undefined) {
    return err(
      new GoalKernelError("GK_SCHEMA", "Goal contract must be an object"),
    );
  }
  const keys = exactKeys(
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
  if (keys.isErr()) return err(keys.error);
  if (value.schema_version !== STATE_SCHEMA) {
    return err(new GoalKernelError("GK_SCHEMA", "schema_version must be 1"));
  }
  const goalIdResult = boundedString(value.goal_id, "goal_id", 64);
  if (goalIdResult.isErr()) return err(goalIdResult.error);
  const goalId = goalIdResult.value;
  if (!GOAL_ID_RE.test(goalId)) {
    return err(
      new GoalKernelError(
        "GK_SCHEMA",
        "goal_id must match [a-z0-9][a-z0-9._-]{0,63}",
      ),
    );
  }
  if (
    typeof value.goal_version !== "number" ||
    !Number.isSafeInteger(value.goal_version) ||
    value.goal_version < 1
  ) {
    return err(
      new GoalKernelError(
        "GK_SCHEMA",
        "goal_version must be a positive integer",
      ),
    );
  }
  const supersedes = value.supersedes_goal_digest;
  if (
    supersedes !== null &&
    (typeof supersedes !== "string" || !SHA256_RE.test(supersedes))
  ) {
    return err(
      new GoalKernelError(
        "GK_SCHEMA",
        "supersedes_goal_digest must be a SHA-256 digest or null",
      ),
    );
  }
  if (value.goal_version === 1 && supersedes !== null) {
    return err(
      new GoalKernelError(
        "GK_GOAL_LINEAGE",
        "goal_version 1 cannot supersede another digest",
      ),
    );
  }
  if (value.goal_version > 1 && supersedes === null) {
    return err(
      new GoalKernelError(
        "GK_GOAL_LINEAGE",
        "goal_version > 1 requires supersedes_goal_digest",
      ),
    );
  }
  if (!Array.isArray(value.decisions)) {
    return err(new GoalKernelError("GK_SCHEMA", "decisions must be an array"));
  }
  const decisionsResult = Result.combine(
    value.decisions.map((decision, index) =>
      parseDecision(decision, `decisions[${index}]`),
    ),
  );
  if (decisionsResult.isErr()) return err(decisionsResult.error);
  const order = validateDecisionOrder(decisionsResult.value);
  if (order.isErr()) return err(order.error);
  const northStar = boundedString(value.north_star, "north_star", 4_000);
  if (northStar.isErr()) return err(northStar.error);
  const acceptance = stringArray(value.acceptance, "acceptance", {
    min: 1,
    max: 50,
    itemMax: 1_000,
  });
  if (acceptance.isErr()) return err(acceptance.error);
  const nonGoals = stringArray(value.non_goals, "non_goals", {
    max: 50,
    itemMax: 1_000,
  });
  if (nonGoals.isErr()) return err(nonGoals.error);
  const authority = await parseAuthority(value.authority, "authority");
  if (authority.isErr()) return err(authority.error);
  return ok({
    schema_version: STATE_SCHEMA,
    goal_id: goalId,
    goal_version: value.goal_version,
    supersedes_goal_digest: supersedes,
    north_star: northStar.value,
    acceptance: acceptance.value,
    non_goals: nonGoals.value,
    decisions: decisionsResult.value,
    authority: authority.value,
  });
}

export async function parseRunDecision(
  input: unknown,
): Promise<KernelResult<RunDecision>> {
  const value = asRecord(input);
  if (value === undefined) {
    return err(
      new GoalKernelError("GK_SCHEMA", "Run decision must be an object"),
    );
  }
  const keys = exactKeys(
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
  if (keys.isErr()) return err(keys.error);
  if (value.schema_version !== STATE_SCHEMA) {
    return err(new GoalKernelError("GK_SCHEMA", "schema_version must be 1"));
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
  if (decision.isErr()) return err(decision.error);
  const authority = await parseAuthority(
    value.authority,
    "Run decision.authority",
  );
  if (authority.isErr()) return err(authority.error);
  return ok({
    schema_version: STATE_SCHEMA,
    ...decision.value,
    authority: authority.value,
  });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  const record = asRecord(value);
  if (record === undefined) return value;
  return Object.fromEntries(
    Object.keys(record)
      .toSorted()
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, canonicalize(record[key])]),
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

export async function resolveWorkspaceRoot(start: string): Promise<string> {
  const candidates = ancestors(start);
  for (const candidate of candidates) {
    // Checked in ancestor order; the nearest trusted (or, failing that, git) root wins.
    if (await Promise.resolve(isTrustedConfig(goalKernelPaths(candidate)))) {
      return candidate;
    }
    if (existsSync(join(candidate, ".git"))) return candidate;
  }
  return resolve(start);
}

function ensurePrivateDirectory(path: string): KernelResult<void> {
  const stats = caught(() => {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    return lstatSync(path);
  });
  if (stats.isErr()) return err(stats.error);
  if (
    stats.value.isSymbolicLink() ||
    !stats.value.isDirectory() ||
    (stats.value.mode & 0o077) !== 0
  ) {
    return err(
      new GoalKernelError(
        "GK_STATE_PERMISSIONS",
        `${path} must be a private, non-symlink directory`,
      ),
    );
  }
  return ok(undefined);
}

function isTrustedConfig(paths: ReturnType<typeof goalKernelPaths>): boolean {
  if (!existsSync(paths.state) || !existsSync(paths.config)) return false;
  const result = caught(() => {
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
  });
  return result.isOk() && result.value;
}

function writeJsonExclusive(path: string, value: unknown): KernelResult<void> {
  const directory = ensurePrivateDirectory(dirname(path));
  if (directory.isErr()) return err(directory.error);
  const written = caught(() => {
    writeFileSync(path, `${canonicalJson(value)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  });
  return written.isErr() ? err(written.error) : ok(undefined);
}

function writeJsonAtomic(path: string, value: unknown): KernelResult<void> {
  const directory = ensurePrivateDirectory(dirname(path));
  if (directory.isErr()) return err(directory.error);
  const temporary = join(dirname(path), `.${process.pid}-${randomUUID()}.tmp`);
  const written = caught(() => {
    writeFileSync(temporary, `${canonicalJson(value)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporary, path);
  });
  return written.isErr() ? err(written.error) : ok(undefined);
}

async function withExclusiveStateLock<T>(
  path: string,
  purpose: string,
  operation: () => Promise<KernelResult<T>>,
): Promise<KernelResult<T>> {
  const written = writeJsonExclusive(path, {
    schema_version: STATE_SCHEMA,
    purpose,
    created_at: Temporal.Now.instant().toString({
      fractionalSecondDigits: 3,
    }),
    pid: process.pid,
  });
  if (written.isErr()) {
    const exists = caught(() => existsSync(path));
    if (exists.isErr()) return err(exists.error);
    if (!exists.value) return err(written.error);
    return err(
      new GoalKernelError(
        "GK_BUSY",
        `${purpose} is already in progress; inspect ${path} before recovering a stale lock`,
      ),
    );
  }
  // Cleanup runs on either result, same as the prior try/finally. The atomic 'wx' create above
  // is unchanged.
  const operationResult = await caughtAsync(operation);
  const removed = caught(() => {
    unlinkSync(path);
  });
  if (removed.isErr()) return err(removed.error);
  if (operationResult.isErr()) return err(operationResult.error);
  return operationResult.value;
}

function readJson(path: string, locus: string): KernelResult<unknown> {
  const text = caught(() => readFileSync(path, "utf8")).mapErr(
    (error) =>
      new GoalKernelError(
        "GK_STATE",
        `${locus} is unreadable: ${errorMessage(error)}`,
      ),
  );
  if (text.isErr()) return err(text.error);
  const parsed = jsonText.safeParse(text.value);
  if (!parsed.success) {
    return err(
      new GoalKernelError(
        "GK_STATE",
        `${locus} is unreadable: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      ),
    );
  }
  return ok(parsed.data);
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

function resolveStateRelative(
  stateRoot: string,
  path: string,
): KernelResult<string> {
  const candidate = resolve(stateRoot, path);
  if (!inside(stateRoot, candidate)) {
    return err(
      new GoalKernelError("GK_STATE", "state path escapes its workspace"),
    );
  }
  return ok(candidate);
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

async function readGoalSnapshot(
  path: string,
  expectedDigest?: string,
): Promise<KernelResult<GoalContract>> {
  const stored = readJson(path, "Goal snapshot");
  if (stored.isErr()) return err(stored.error);
  const parsed = await parseGoalContract(stored.value);
  if (parsed.isErr()) return err(parsed.error);
  const contract = parsed.value;
  const actualDigest = contractDigest(contract);
  if (expectedDigest !== undefined && actualDigest !== expectedDigest) {
    return err(
      new GoalKernelError(
        "GK_INTEGRITY",
        `Goal snapshot digest mismatch: expected ${expectedDigest}, got ${actualDigest}`,
      ),
    );
  }
  return ok(contract);
}

function readActivePointer(
  paths: ReturnType<typeof goalKernelPaths>,
): KernelResult<ActiveGoal> {
  const active = readJson(paths.active, "ACTIVE.json");
  if (active.isErr()) return err(active.error);
  const value = asRecord(active.value);
  if (value === undefined) {
    return err(
      new GoalKernelError("GK_STATE", "ACTIVE.json must be an object"),
    );
  }
  const keys = exactKeys(
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
  if (keys.isErr()) return err(keys.error);
  if (
    value.schema_version !== STATE_SCHEMA ||
    typeof value.goal_id !== "string" ||
    typeof value.goal_version !== "number" ||
    typeof value.goal_digest !== "string" ||
    !SHA256_RE.test(value.goal_digest) ||
    typeof value.snapshot_rel !== "string" ||
    typeof value.activated_at !== "string"
  ) {
    return err(
      new GoalKernelError("GK_STATE", "ACTIVE.json has invalid fields"),
    );
  }
  return ok({
    schema_version: STATE_SCHEMA,
    goal_id: value.goal_id,
    goal_version: value.goal_version,
    goal_digest: value.goal_digest,
    snapshot_rel: value.snapshot_rel,
    activated_at: value.activated_at,
  });
}

async function loadActiveGoal(
  paths: ReturnType<typeof goalKernelPaths>,
): Promise<
  KernelResult<
    Readonly<{ active: ActiveGoal; goal: GoalContract; snapshotPath: string }>
  >
> {
  const active = readActivePointer(paths);
  if (active.isErr()) return err(active.error);
  const snapshotPath = resolveStateRelative(
    paths.state,
    active.value.snapshot_rel,
  );
  if (snapshotPath.isErr()) return err(snapshotPath.error);
  const goal = await readGoalSnapshot(
    snapshotPath.value,
    active.value.goal_digest,
  );
  if (goal.isErr()) return err(goal.error);
  if (
    goal.value.goal_id !== active.value.goal_id ||
    goal.value.goal_version !== active.value.goal_version
  ) {
    return err(
      new GoalKernelError(
        "GK_INTEGRITY",
        "ACTIVE.json identity does not match its Goal snapshot",
      ),
    );
  }
  return ok({
    active: active.value,
    goal: goal.value,
    snapshotPath: snapshotPath.value,
  });
}

function ensureConfig(
  paths: ReturnType<typeof goalKernelPaths>,
): KernelResult<void> {
  const directory = ensurePrivateDirectory(paths.state);
  if (directory.isErr()) return err(directory.error);
  const expected = {
    schema_version: STATE_SCHEMA,
    enabled: true,
    policy_version: POLICY_VERSION,
    policy_digest: POLICY_DIGEST,
  };
  if (!existsSync(paths.config)) {
    return writeJsonExclusive(paths.config, expected);
  }
  if (!isTrustedConfig(paths)) {
    return err(
      new GoalKernelError(
        "GK_STATE_PERMISSIONS",
        "config.json or its state directory is not private and trusted",
      ),
    );
  }
  const actual = readJson(paths.config, "config.json");
  if (actual.isErr()) return err(actual.error);
  if (canonicalJson(actual.value) !== canonicalJson(expected)) {
    return err(
      new GoalKernelError(
        "GK_CONFIG",
        "config.json does not match the installed Goal Kernel policy",
      ),
    );
  }
  return ok(undefined);
}

export async function activateGoal(
  workspaceRoot: string,
  input: unknown,
): Promise<
  KernelResult<
    Readonly<{
      workspace_root: string;
      goal_id: string;
      goal_version: number;
      goal_digest: string;
      snapshot_path: string;
      activated_at: string;
    }>
  >
> {
  const paths = goalKernelPaths(workspaceRoot);
  const parsedContract = await parseGoalContract(input);
  if (parsedContract.isErr()) return err(parsedContract.error);
  const contract = parsedContract.value;
  const directory = ensurePrivateDirectory(paths.state);
  if (directory.isErr()) return err(directory.error);
  return withExclusiveStateLock(
    join(paths.state, ".activation.lock"),
    "Goal activation",
    async () => {
      const digest = contractDigest(contract);
      const snapshotPath = goalSnapshotPath(
        paths,
        contract.goal_id,
        contract.goal_version,
        digest,
      );

      const sameVersionResult = caught(() =>
        findVersionSnapshots(paths, contract.goal_id, contract.goal_version),
      );
      if (sameVersionResult.isErr()) return err(sameVersionResult.error);
      const sameVersion = sameVersionResult.value;
      const conflicting = sameVersion.find((path) => path !== snapshotPath);
      if (conflicting !== undefined) {
        return err(
          new GoalKernelError(
            "GK_GOAL_VERSION_CONFLICT",
            `Goal '${contract.goal_id}' version ${contract.goal_version} already has a different digest`,
          ),
        );
      }

      if (contract.goal_version > 1) {
        const priorDigest = contract.supersedes_goal_digest;
        if (priorDigest === null) {
          return err(
            new GoalKernelError(
              "GK_GOAL_LINEAGE",
              "goal_version > 1 requires supersedes_goal_digest",
            ),
          );
        }
        const priorPath = goalSnapshotPath(
          paths,
          contract.goal_id,
          contract.goal_version - 1,
          priorDigest,
        );
        const priorExists = caught(() => existsSync(priorPath));
        if (priorExists.isErr()) return err(priorExists.error);
        if (!priorExists.value) {
          return err(
            new GoalKernelError(
              "GK_GOAL_LINEAGE",
              `superseded Goal snapshot is missing: ${contract.supersedes_goal_digest}`,
            ),
          );
        }
        const prior = await readGoalSnapshot(priorPath, priorDigest);
        if (prior.isErr()) return err(prior.error);
      }

      const snapshotExists = caught(() => existsSync(snapshotPath));
      if (snapshotExists.isErr()) return err(snapshotExists.error);
      if (snapshotExists.value) {
        const snapshot = await readGoalSnapshot(snapshotPath, digest);
        if (snapshot.isErr()) return err(snapshot.error);
      } else {
        const written = writeJsonExclusive(snapshotPath, contract);
        if (written.isErr()) return err(written.error);
      }
      const config = ensureConfig(paths);
      if (config.isErr()) return err(config.error);
      const activatedAt = Temporal.Now.instant().toString({
        fractionalSecondDigits: 3,
      });
      const active: ActiveGoal = {
        schema_version: STATE_SCHEMA,
        goal_id: contract.goal_id,
        goal_version: contract.goal_version,
        goal_digest: digest,
        snapshot_rel: relative(paths.state, snapshotPath),
        activated_at: activatedAt,
      };
      const activeWrite = writeJsonAtomic(paths.active, active);
      if (activeWrite.isErr()) return err(activeWrite.error);
      return ok({
        workspace_root: paths.root,
        goal_id: contract.goal_id,
        goal_version: contract.goal_version,
        goal_digest: digest,
        snapshot_path: snapshotPath,
        activated_at: activatedAt,
      });
    },
  );
}

function runId(provider: Provider, sessionId: string): string {
  const digest = sha256Text(`${provider}\u0000${sessionId}`);
  return `gk-${provider}-${digest.slice(0, 24)}`;
}

function validateRunId(value: string): KernelResult<void> {
  if (!RUN_ID_RE.test(value)) {
    return err(new GoalKernelError("GK_RUN_ID", `invalid run id '${value}'`));
  }
  return ok(undefined);
}

function runDirectory(
  paths: ReturnType<typeof goalKernelPaths>,
  id: string,
): KernelResult<string> {
  const valid = validateRunId(id);
  if (valid.isErr()) return err(valid.error);
  return ok(join(paths.runs, id));
}

function parseBinding(input: unknown): KernelResult<RunBinding> {
  const value = asRecord(input);
  if (value === undefined) {
    return err(
      new GoalKernelError("GK_STATE", "run binding must be an object"),
    );
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
  const keys = exactKeys(value, required, [], "run binding");
  if (keys.isErr()) return err(keys.error);
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
    return err(
      new GoalKernelError("GK_STATE", "run binding has invalid fields"),
    );
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
    return err(
      new GoalKernelError(
        "GK_INTEGRITY",
        `run binding digest mismatch: expected ${expectedDigest}, got ${actualDigest}`,
      ),
    );
  }
  return ok(binding);
}

export async function readRunBinding(
  workspaceRoot: string,
  id: string,
): Promise<KernelResult<RunBinding>> {
  const paths = goalKernelPaths(workspaceRoot);
  const directory = runDirectory(paths, id);
  if (directory.isErr()) return err(directory.error);
  const bindingPath = join(directory.value, "binding.json");
  const stored = await Promise.resolve(
    readJson(bindingPath, `binding for ${id}`),
  );
  if (stored.isErr()) return err(stored.error);
  const result = parseBinding(stored.value);
  const outcome = await Promise.resolve(result);
  return outcome;
}

export async function readBoundGoal(
  workspaceRoot: string,
  binding: RunBinding,
): Promise<KernelResult<GoalContract>> {
  const paths = goalKernelPaths(workspaceRoot);
  const snapshot = resolveStateRelative(paths.state, binding.goal_snapshot_rel);
  if (snapshot.isErr()) return err(snapshot.error);
  const goal = await readGoalSnapshot(snapshot.value, binding.goal_digest);
  if (goal.isErr()) return err(goal.error);
  if (
    goal.value.goal_id !== binding.goal_id ||
    goal.value.goal_version !== binding.goal_version
  ) {
    return err(
      new GoalKernelError(
        "GK_INTEGRITY",
        `binding ${binding.run_id} does not match its Goal snapshot`,
      ),
    );
  }
  return ok(goal.value);
}

async function ensureRunBinding(
  paths: ReturnType<typeof goalKernelPaths>,
  provider: Provider,
  sessionId: string,
): Promise<
  KernelResult<Readonly<{ binding: RunBinding; goal: GoalContract }>>
> {
  const config = ensureConfig(paths);
  if (config.isErr()) return err(config.error);
  const id = runId(provider, sessionId);
  const directory = runDirectory(paths, id);
  if (directory.isErr()) return err(directory.error);
  const bindingPath = join(directory.value, "binding.json");
  const expectedSessionHash = sha256Text(sessionId);
  const bindingExists = caught(() => existsSync(bindingPath));
  if (bindingExists.isErr()) return err(bindingExists.error);
  if (bindingExists.value) {
    const stored = readJson(bindingPath, `binding for ${id}`);
    if (stored.isErr()) return err(stored.error);
    const parsed = parseBinding(stored.value);
    if (parsed.isErr()) return err(parsed.error);
    const binding = parsed.value;
    if (
      binding.provider !== provider ||
      binding.session_id_sha256 !== expectedSessionHash ||
      binding.workspace_root !== paths.root
    ) {
      return err(
        new GoalKernelError(
          "GK_INTEGRITY",
          `run id collision or binding mismatch for ${id}`,
        ),
      );
    }
    const boundGoal = await readBoundGoal(paths.root, binding);
    if (boundGoal.isErr()) return err(boundGoal.error);
    return ok({ binding, goal: boundGoal.value });
  }

  const loaded = await loadActiveGoal(paths);
  if (loaded.isErr()) return err(loaded.error);
  const { active, goal, snapshotPath } = loaded.value;
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
    bound_at: Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
  };
  const binding: RunBinding = {
    ...bindingBody,
    binding_sha256: sha256Value(bindingBody),
  };
  const written = writeJsonExclusive(bindingPath, binding);
  if (written.isErr()) {
    const exists = caught(() => existsSync(bindingPath));
    if (exists.isErr()) return err(exists.error);
    if (!exists.value) return err(written.error);
    const stored = readJson(bindingPath, `binding for ${id}`);
    if (stored.isErr()) return err(stored.error);
    const raced = parseBinding(stored.value);
    if (raced.isErr()) return err(raced.error);
    const racedGoal = await readBoundGoal(paths.root, raced.value);
    if (racedGoal.isErr()) return err(racedGoal.error);
    return ok({ binding: raced.value, goal: racedGoal.value });
  }
  return ok({ binding, goal });
}

function eventIdentity(): Readonly<{ id: string; at: string }> {
  const at = Temporal.Now.instant().toString({ fractionalSecondDigits: 3 });
  const id = `${Temporal.Now.instant().epochMilliseconds.toString().padStart(13, "0")}-${randomUUID()}`;
  return { id, at };
}

function appendRunEvent(
  workspaceRoot: string,
  binding: RunBinding,
  event: Record<string, unknown>,
): KernelResult<RunEvent> {
  const paths = goalKernelPaths(workspaceRoot);
  const ids = eventIdentity();
  const base: RunEventBase = {
    ...event,
    schema_version: STATE_SCHEMA,
    event_id: ids.id,
    run_id: binding.run_id,
    provider: binding.provider,
    event_type:
      typeof event.event_type === "string"
        ? event.event_type
        : "provider.event",
    provider_event:
      typeof event.provider_event === "string"
        ? event.provider_event
        : "unknown",
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
  const directory = runDirectory(paths, binding.run_id);
  if (directory.isErr()) return err(directory.error);
  const path = join(directory.value, "events", name);
  return writeJsonExclusive(path, value).map(() => value);
}

export async function listRunEvents(
  workspaceRoot: string,
  id: string,
): Promise<KernelResult<RunEvent[]>> {
  const paths = goalKernelPaths(workspaceRoot);
  const run = runDirectory(paths, id);
  if (run.isErr()) return err(run.error);
  const directory = join(run.value, "events");
  const directoryExists = caught(() => existsSync(directory));
  if (directoryExists.isErr()) return err(directoryExists.error);
  if (!directoryExists.value) return ok([]);
  const namesResult = caught(() =>
    readdirSync(directory)
      .filter((entry) => entry.endsWith(".json"))
      .toSorted(),
  );
  if (namesResult.isErr()) return err(namesResult.error);
  const events: RunEvent[] = [];
  for (const name of namesResult.value) {
    // Read in filename order (sorted above) so event identity is deterministic.
    const stored = await Promise.resolve(
      readJson(join(directory, name), `event ${name}`),
    );
    if (stored.isErr()) return err(stored.error);
    const value = asRecord(stored.value);
    if (value === undefined) {
      return err(
        new GoalKernelError("GK_STATE", `event ${name} must be an object`),
      );
    }
    const filenameDigest = name.match(/-([a-f0-9]{64})\.json$/u)?.[1];
    const eventDigest = value.event_sha256;
    if (
      filenameDigest === undefined ||
      typeof eventDigest !== "string" ||
      !SHA256_RE.test(eventDigest)
    ) {
      return err(
        new GoalKernelError(
          "GK_INTEGRITY",
          `event ${name} has no valid content digest`,
        ),
      );
    }
    const { event_sha256: _storedDigest, ...body } = value;
    const actualDigest = sha256Value(body);
    if (eventDigest !== filenameDigest || eventDigest !== actualDigest) {
      return err(
        new GoalKernelError("GK_INTEGRITY", `event ${name} digest mismatch`),
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
      return err(
        new GoalKernelError(
          "GK_STATE",
          `event ${name} has invalid required fields`,
        ),
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
  return ok(events);
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
  const input = asRecord(toolInput);
  if (input === undefined) return [];
  const paths: string[] = [];
  for (const key of ["file_path", "path"] as const) {
    const value = input[key];
    if (typeof value === "string" && value !== "") {
      paths.push(safeWorkspacePath(value, workspaceRoot));
    }
  }
  const command = input.command;
  if (typeof command === "string" && command.includes("*** Begin Patch")) {
    paths.push(...patchFilePaths(command, workspaceRoot));
  }
  return [...new Set(paths)].toSorted();
}

/** Paths touched by an apply_patch-style "*** Begin Patch" command body. */
function patchFilePaths(command: string, workspaceRoot: string): string[] {
  const paths: string[] = [];
  for (const match of command.matchAll(
    /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gmu,
  )) {
    const path = match[1]?.trim();
    if (path === undefined || path === "") continue;
    paths.push(safeWorkspacePath(path, workspaceRoot));
  }
  return paths;
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

/** Sets event.tool_exit_code from a PostToolUse tool_response, when present and numeric. */
function recordToolExitCode(
  event: Record<string, unknown>,
  toolResponse: unknown,
): void {
  const response = asRecord(toolResponse);
  if (response === undefined) return;
  const exitCode = response.exit_code ?? response.exitCode;
  if (typeof exitCode === "number" && Number.isSafeInteger(exitCode)) {
    event.tool_exit_code = exitCode;
  }
}

function hookEvent(
  input: Record<string, unknown>,
  providerEvent: string,
  workspaceRoot: string,
): KernelResult<Record<string, unknown>> {
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
      return err(
        new GoalKernelError(
          "GK_HOOK_PAYLOAD",
          "UserPromptSubmit is missing prompt",
        ),
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
      recordToolExitCode(event, input.tool_response);
    } else {
      event.tool_error_sha256 = sha256Value(input.error ?? null);
    }
  }
  return ok(event);
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

export async function processHookEvent(
  provider: Provider,
  input: unknown,
): Promise<HookResult> {
  const value = asRecord(input);
  if (value === undefined) {
    return {
      exit_code: 1,
      stdout: "",
      stderr: "goal-kernel: GK_HOOK_PAYLOAD: input must be an object\n",
    };
  }
  const providerEvent = optionalString(value.hook_event_name, 100) ?? "unknown";
  const cwd = typeof value.cwd === "string" ? value.cwd : process.cwd();
  const root = await resolveWorkspaceRoot(cwd);
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

  const attemptedBound = await caughtAsync(() =>
    ensureRunBinding(paths, provider, sessionId),
  );
  if (attemptedBound.isErr()) {
    const reason = `GK_AUTHORITY_UNAVAILABLE: ${errorMessage(attemptedBound.error)}`;
    if (providerEvent === "PreToolUse") return denyPre(reason);
    if (providerEvent === "UserPromptSubmit") return blockPrompt(reason);
    return warning(reason);
  }
  const bound = attemptedBound.value;
  if (bound.isErr()) {
    const reason = `GK_AUTHORITY_UNAVAILABLE: ${errorMessage(bound.error)}`;
    if (providerEvent === "PreToolUse") return denyPre(reason);
    if (providerEvent === "UserPromptSubmit") return blockPrompt(reason);
    return warning(reason);
  }
  const { binding, goal } = bound.value;

  const appendedAttempt = caught(() => {
    const event = hookEvent(value, providerEvent, root);
    if (event.isErr()) return err(event.error);
    return appendRunEvent(root, binding, event.value);
  });
  const appended = appendedAttempt.isErr()
    ? err(appendedAttempt.error)
    : appendedAttempt.value;
  if (appended.isErr()) {
    const reason = `GK_EVENT_LEDGER_UNAVAILABLE: ${errorMessage(appended.error)}`;
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

export async function runGoalKernelHook(provider: Provider): Promise<void> {
  const stdin = caught(() => readFileSync(0, "utf8"));
  const failure = stdin.isErr() ? errorMessage(stdin.error) : undefined;
  const parsed = stdin.isOk() ? jsonText.safeParse(stdin.value) : undefined;
  if (failure !== undefined || parsed?.success !== true) {
    const reason =
      failure ?? parsed?.error?.issues.map((i) => i.message).join("; ") ?? "";
    process.stderr.write(`goal-kernel: malformed hook JSON: ${reason}\n`);
    process.exitCode = 1;
    return;
  }
  const processed = await caughtAsync(() =>
    processHookEvent(provider, parsed.data),
  );
  if (processed.isErr()) {
    process.stderr.write(`goal-kernel: ${errorMessage(processed.error)}\n`);
    process.exitCode = 1;
    return;
  }
  const result = processed.value;
  if (result.stdout !== "") process.stdout.write(result.stdout);
  if (result.stderr !== "") process.stderr.write(result.stderr);
  process.exitCode = result.exit_code;
}

export async function recordRunDecision(
  workspaceRoot: string,
  id: string,
  input: unknown,
): Promise<KernelResult<RunEvent>> {
  const decision = await parseRunDecision(input);
  if (decision.isErr()) return err(decision.error);
  const binding = await readRunBinding(workspaceRoot, id);
  if (binding.isErr()) return err(binding.error);
  const goal = await readBoundGoal(workspaceRoot, binding.value);
  if (goal.isErr()) return err(goal.error);
  const paths = goalKernelPaths(workspaceRoot);
  const directory = runDirectory(paths, id);
  if (directory.isErr()) return err(directory.error);
  return withExclusiveStateLock(
    join(directory.value, ".decision.lock"),
    `decision recording for ${id}`,
    async () => {
      const existingEvents = await listRunEvents(workspaceRoot, id);
      if (existingEvents.isErr()) return err(existingEvents.error);
      const recordedResults = await Promise.all(
        existingEvents.value
          .filter((event) => event.event_type === "decision.recorded")
          .map((event) => parseRunDecision(event.decision)),
      );
      const recorded = Result.combine(recordedResults);
      if (recorded.isErr()) return err(recorded.error);
      const order = validateDecisionOrder(
        [decision.value],
        [
          ...goal.value.decisions.map((item) => item.decision_id),
          ...recorded.value.map((item) => item.decision_id),
        ],
      );
      if (order.isErr()) return err(order.error);
      return appendRunEvent(workspaceRoot, binding.value, {
        event_type: "decision.recorded",
        provider_event: "GoalKernelDecision",
        decision: decision.value,
      });
    },
  );
}

export type GoalStatus = Readonly<{
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
}>;

export async function readGoalStatus(
  workspaceRoot: string,
): Promise<KernelResult<GoalStatus>> {
  const paths = goalKernelPaths(workspaceRoot);
  if (!existsSync(paths.config)) {
    return ok({
      workspace_root: paths.root,
      configured: false,
      policy_version: POLICY_VERSION,
      policy_digest: POLICY_DIGEST,
      runs: [],
    });
  }
  if (!isTrustedConfig(paths)) {
    return err(
      new GoalKernelError(
        "GK_STATE_PERMISSIONS",
        "config.json or its state directory is not private and trusted",
      ),
    );
  }
  const config = ensureConfig(paths);
  if (config.isErr()) return err(config.error);
  const active = await loadActiveGoal(paths);
  if (active.isErr()) return err(active.error);
  const runsExist = caught(() => existsSync(paths.runs));
  if (runsExist.isErr()) return err(runsExist.error);
  let runs: readonly Readonly<{
    run_id: string;
    provider: Provider;
    goal_id: string;
    goal_version: number;
    goal_digest: string;
    bound_at: string;
  }>[] = [];
  if (runsExist.value) {
    const names = caught(() =>
      readdirSync(paths.runs).filter((name) => RUN_ID_RE.test(name)),
    );
    if (names.isErr()) return err(names.error);
    const bindingResults = await Promise.all(
      names.value.map((name) => readRunBinding(paths.root, name)),
    );
    const bindings = Result.combine(bindingResults);
    if (bindings.isErr()) return err(bindings.error);
    runs = bindings.value
      .toSorted((left, right) => right.bound_at.localeCompare(left.bound_at))
      .map((binding) => ({
        run_id: binding.run_id,
        provider: binding.provider,
        goal_id: binding.goal_id,
        goal_version: binding.goal_version,
        goal_digest: binding.goal_digest,
        bound_at: binding.bound_at,
      }));
  }
  return ok({
    workspace_root: paths.root,
    configured: true,
    policy_version: POLICY_VERSION,
    policy_digest: POLICY_DIGEST,
    active: {
      goal: active.value.goal,
      goal_digest: active.value.active.goal_digest,
      activated_at: active.value.active.activated_at,
    },
    runs,
  });
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
): KernelResult<void> {
  const stats = caught(() => statSync(path));
  if (stats.isErr()) return err(stats.error);
  if (!stats.value.isFile()) {
    return err(
      new GoalKernelError("GK_TRANSCRIPT", "transcript is not a regular file"),
    );
  }
  if (stats.value.size > maxBytes) {
    return err(
      new GoalKernelError(
        "GK_TRANSCRIPT",
        `transcript exceeds ${maxBytes} bytes`,
      ),
    );
  }
  return ok(undefined);
}
