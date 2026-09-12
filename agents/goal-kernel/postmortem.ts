/** Read-only postmortem reconstruction from one Goal Kernel run id. */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import {
  assertReadableRegularFile,
  type GoalAuthority,
  type GoalDecision,
  listRunEvents,
  parseRunDecision,
  type RunEvent,
  readBoundGoal,
  readRunBinding,
  sha256Text,
  sha256Value,
  transcriptLocator,
} from "./kernel.ts";

type TranscriptMessage = Readonly<{
  role: "user" | "assistant";
  text: string;
  source_line: number;
}>;

type TranscriptToolCall = Readonly<{
  tool_use_id?: string;
  tool_name: string;
  input_sha256: string;
  input_bytes: number;
  source_line: number;
}>;

export type TranscriptReadout = Readonly<{
  available: boolean;
  path?: string;
  format?: "claude-jsonl" | "codex-jsonl" | "mixed-jsonl" | "unknown-jsonl";
  messages: readonly TranscriptMessage[];
  tool_calls: readonly TranscriptToolCall[];
  redactions: number;
  parse_errors: number;
  truncated: boolean;
  finding?: string;
}>;

export type PostmortemDecision = GoalDecision &
  Readonly<{
    source: "goal-contract" | "run-event";
    authority: GoalAuthority;
    occurred_at?: string;
  }>;

export type ToolTrace = Readonly<{
  tool_use_id: string;
  tool_name?: string;
  turn_id?: string;
  requested_at?: string;
  completed_at?: string;
  input_sha256?: string;
  // `| undefined` (not just `?:`): toolTraces() unconditionally overwrites these three on every
  // matching event, including back to undefined, so a later duplicate/replayed same-type event
  // can legitimately clear a value a prior event set. exactOptionalPropertyTypes requires the
  // explicit union to accept that assignment; JSON.stringify drops the key either way.
  response_sha256?: string | undefined;
  error_sha256?: string | undefined;
  exit_code?: number;
  workspace_paths: readonly string[];
  kernel_decision?: string | undefined;
  outcome: "completed" | "failed" | "denied" | "not_observed_completed";
}>;

export type PostmortemReport = Readonly<{
  schema_version: 1;
  run_id: string;
  provider: string;
  workspace_root: string;
  binding: Readonly<{
    bound_at: string;
    policy_version: string;
    policy_digest: string;
  }>;
  goal: ReturnType<typeof readBoundGoal>;
  decisions: readonly PostmortemDecision[];
  tools: readonly ToolTrace[];
  prompts: readonly Readonly<{
    occurred_at: string;
    turn_id?: string;
    prompt_sha256?: string;
    prompt_bytes?: number;
  }>[];
  events: readonly RunEvent[];
  transcript?: TranscriptReadout;
  findings: readonly string[];
}>;

const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;
const MAX_MESSAGES = 500;
const MAX_TEXT_BYTES = 250_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contentText(
  content: unknown,
  acceptedTypes: readonly string[],
): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block) =>
        isRecord(block) &&
        acceptedTypes.includes(String(block.type)) &&
        typeof block.text === "string",
    )
    .map((block) => (block as Record<string, unknown>).text as string)
    .join("\n");
}

function redactText(input: string): Readonly<{ text: string; count: number }> {
  let text = input;
  let count = 0;
  const replace = (
    pattern: RegExp,
    replacement: (match: string, ...captures: string[]) => string,
  ) => {
    text = text.replace(pattern, (match: string, ...args: unknown[]) => {
      count += 1;
      return replacement(match, ...args.map(String));
    });
  };

  replace(
    /-----BEGIN ([A-Z ]+?)-----[\s\S]*?-----END \1-----/g,
    (_match, label) =>
      `-----BEGIN ${label}-----\n[REDACTED]\n-----END ${label}-----`,
  );
  replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, () => "Bearer [REDACTED]");
  replace(
    /\b(?:sk-(?:ant-)?|rk-|ghp_|github_pat_|glpat-)[A-Za-z0-9_-]{10,}\b/g,
    () => "[REDACTED]",
  );
  replace(
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g,
    () => "[REDACTED]",
  );
  replace(
    /\b([A-Z0-9_]*(?:PASSWORD|PASSWD|TOKEN|SECRET|API_KEY|AUTHORIZATION|CREDENTIAL|PRIVATE_KEY|ACCESS_KEY|SESSION_KEY|COOKIE)[A-Z0-9_]*)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
    (_match, key) => `${key}=[REDACTED]`,
  );
  replace(
    /"(password|passwd|token|secret|api[_ -]?key|authorization|credential|private[_ -]?key|access[_ -]?key|session[_ -]?key|cookie)"\s*:\s*(?:"(?:\\.|[^"\\])*"|[^,}\s]+)/gi,
    (_match, key) => `"${key}":"[REDACTED]"`,
  );
  replace(
    /\b(password|passwd|token|secret|api[_ -]?key|authorization|credential|private[_ -]?key|access[_ -]?key|session[_ -]?key|cookie)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
    (_match, key, separator) => `${key}${separator}[REDACTED]`,
  );
  return { text, count };
}

type EntryParseResult = Readonly<{
  role: "user" | "assistant" | undefined;
  rawText: string;
  textBytes: number;
  truncated: boolean;
  claudeMessages: number;
  codexMessages: number;
}>;

/** tool_use blocks found in one Claude message's content array. */
function collectClaudeToolUseCalls(
  content: readonly unknown[],
  sourceLine: number,
  toolCalls: TranscriptToolCall[],
  textBytes: number,
): Readonly<{ textBytes: number; truncated: boolean }> {
  for (const block of content) {
    if (
      !isRecord(block) ||
      block.type !== "tool_use" ||
      typeof block.name !== "string"
    ) {
      continue;
    }
    const input = block.input ?? null;
    const inputBytes = Buffer.byteLength(JSON.stringify(input));
    const outputBytes = 64;
    if (
      toolCalls.length >= MAX_MESSAGES ||
      textBytes + outputBytes > MAX_TEXT_BYTES
    ) {
      return { textBytes, truncated: true };
    }
    toolCalls.push({
      ...(typeof block.id === "string" ? { tool_use_id: block.id } : {}),
      tool_name: block.name,
      input_sha256: sha256Value(input),
      input_bytes: inputBytes,
      source_line: sourceLine,
    });
    textBytes += outputBytes;
  }
  return { textBytes, truncated: false };
}

/** One Codex response_item function_call payload. */
function collectCodexFunctionCall(
  name: string,
  args: unknown,
  callId: unknown,
  sourceLine: number,
  toolCalls: TranscriptToolCall[],
  textBytes: number,
): Readonly<{ textBytes: number; truncated: boolean }> {
  const rawInput =
    typeof args === "string" ? args : JSON.stringify(args ?? null);
  const inputBytes = Buffer.byteLength(rawInput);
  const outputBytes = 64;
  if (
    toolCalls.length >= MAX_MESSAGES ||
    textBytes + outputBytes > MAX_TEXT_BYTES
  ) {
    return { textBytes, truncated: true };
  }
  toolCalls.push({
    ...(typeof callId === "string" ? { tool_use_id: callId } : {}),
    tool_name: name,
    input_sha256: sha256Text(rawInput),
    input_bytes: inputBytes,
    source_line: sourceLine,
  });
  return { textBytes: textBytes + outputBytes, truncated: false };
}

/** Role/text/tool-call extraction for one parsed transcript line (Claude or Codex JSONL). */
function parseTranscriptEntry(
  entry: Record<string, unknown>,
  sourceLine: number,
  toolCalls: TranscriptToolCall[],
  textBytes: number,
): EntryParseResult {
  let role: "user" | "assistant" | undefined;
  let rawText = "";
  let truncated = false;
  let claudeMessages = 0;
  let codexMessages = 0;
  if (
    (entry.type === "user" || entry.type === "assistant") &&
    isRecord(entry.message)
  ) {
    role = entry.type;
    rawText = contentText(entry.message.content, ["text"]);
    claudeMessages = rawText === "" ? 0 : 1;
    if (Array.isArray(entry.message.content)) {
      const result = collectClaudeToolUseCalls(
        entry.message.content,
        sourceLine,
        toolCalls,
        textBytes,
      );
      textBytes = result.textBytes;
      truncated = result.truncated;
    }
  } else if (entry.type === "response_item" && isRecord(entry.payload)) {
    const payload = entry.payload;
    if (
      payload.type === "message" &&
      (payload.role === "user" || payload.role === "assistant")
    ) {
      role = payload.role;
      rawText = contentText(payload.content, [
        "input_text",
        "output_text",
        "text",
      ]);
      codexMessages = rawText === "" ? 0 : 1;
    } else if (
      payload.type === "function_call" &&
      typeof payload.name === "string"
    ) {
      const result = collectCodexFunctionCall(
        payload.name,
        payload.arguments,
        payload.call_id,
        sourceLine,
        toolCalls,
        textBytes,
      );
      textBytes = result.textBytes;
      truncated = result.truncated;
      codexMessages = result.truncated ? 0 : 1;
    }
  }
  return {
    role,
    rawText,
    textBytes,
    truncated,
    claudeMessages,
    codexMessages,
  };
}

function parseTranscript(path: string): TranscriptReadout {
  if (!existsSync(path)) {
    return {
      available: false,
      path,
      messages: [],
      tool_calls: [],
      redactions: 0,
      parse_errors: 0,
      truncated: false,
      finding: "GK_TRANSCRIPT_MISSING",
    };
  }
  let realPath: string;
  try {
    realPath = realpathSync(path);
    assertReadableRegularFile(realPath, MAX_TRANSCRIPT_BYTES);
  } catch (error) {
    return {
      available: false,
      path,
      messages: [],
      tool_calls: [],
      redactions: 0,
      parse_errors: 0,
      truncated: false,
      finding: `GK_TRANSCRIPT_UNREADABLE: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const messages: TranscriptMessage[] = [];
  const toolCalls: TranscriptToolCall[] = [];
  let redactions = 0;
  let parseErrors = 0;
  let textBytes = 0;
  let truncated = false;
  let claudeMessages = 0;
  let codexMessages = 0;
  const lines = readFileSync(realPath, "utf8").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trim() === "") continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      parseErrors += 1;
      continue;
    }
    if (!isRecord(entry)) continue;

    const parsed = parseTranscriptEntry(entry, index + 1, toolCalls, textBytes);
    textBytes = parsed.textBytes;
    claudeMessages += parsed.claudeMessages;
    codexMessages += parsed.codexMessages;
    if (parsed.truncated) {
      truncated = true;
      break;
    }
    if (parsed.role === undefined || parsed.rawText === "") continue;
    const redacted = redactText(parsed.rawText);
    const bytes = Buffer.byteLength(redacted.text);
    if (messages.length >= MAX_MESSAGES || textBytes + bytes > MAX_TEXT_BYTES) {
      truncated = true;
      break;
    }
    messages.push({
      role: parsed.role,
      text: redacted.text,
      source_line: index + 1,
    });
    redactions += redacted.count;
    textBytes += bytes;
  }

  const format =
    claudeMessages > 0 && codexMessages > 0
      ? "mixed-jsonl"
      : claudeMessages > 0
        ? "claude-jsonl"
        : codexMessages > 0
          ? "codex-jsonl"
          : "unknown-jsonl";
  return {
    available: true,
    path: realPath,
    format,
    messages,
    tool_calls: toolCalls,
    redactions,
    parse_errors: parseErrors,
    truncated,
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function toolTraces(events: readonly RunEvent[]): ToolTrace[] {
  type MutableTrace = {
    tool_use_id: string;
    tool_name?: string;
    turn_id?: string;
    requested_at?: string;
    completed_at?: string;
    input_sha256?: string;
    response_sha256?: string | undefined;
    error_sha256?: string | undefined;
    exit_code?: number;
    workspace_paths: string[];
    kernel_decision?: string | undefined;
    outcome: ToolTrace["outcome"];
  };

  function applyToolRequested(trace: MutableTrace, event: RunEvent): void {
    trace.requested_at = event.occurred_at;
    // Unconditional overwrite (incl. undefined): matches pre-refactor semantics for a
    // duplicate/replayed tool.requested event of the same tool_use_id.
    const kernelDecision = optionalString(event.kernel_decision);
    trace.kernel_decision = kernelDecision;
    if (kernelDecision === "deny") trace.outcome = "denied";
  }

  function applyToolCompleted(trace: MutableTrace, event: RunEvent): void {
    trace.completed_at = event.occurred_at;
    // Unconditional overwrite (incl. undefined): matches pre-refactor semantics for a
    // duplicate/replayed tool.completed event of the same tool_use_id.
    trace.response_sha256 = optionalString(event.tool_response_sha256);
    if (typeof event.tool_exit_code === "number") {
      trace.exit_code = event.tool_exit_code;
    }
    trace.outcome =
      trace.exit_code === undefined || trace.exit_code === 0
        ? "completed"
        : "failed";
  }

  function applyToolFailed(trace: MutableTrace, event: RunEvent): void {
    trace.completed_at = event.occurred_at;
    // Unconditional overwrite (incl. undefined): matches pre-refactor semantics for a
    // duplicate/replayed tool.failed event of the same tool_use_id.
    trace.error_sha256 = optionalString(event.tool_error_sha256);
    trace.outcome = "failed";
  }

  const traces = new Map<string, MutableTrace>();
  for (const event of events) {
    if (!event.event_type.startsWith("tool.")) continue;
    const toolUseId = optionalString(event.tool_use_id);
    if (toolUseId === undefined) continue;
    const trace = traces.get(toolUseId) ?? {
      tool_use_id: toolUseId,
      outcome: "not_observed_completed",
      workspace_paths: [],
    };
    // exactOptionalPropertyTypes: only write when defined, never assign an explicit undefined.
    const toolName = optionalString(event.tool_name);
    if (toolName !== undefined) trace.tool_name = toolName;
    const turnId = optionalString(event.turn_id);
    if (turnId !== undefined) trace.turn_id = turnId;
    const inputSha256 = optionalString(event.tool_input_sha256);
    if (inputSha256 !== undefined) trace.input_sha256 = inputSha256;
    if (Array.isArray(event.workspace_paths)) {
      trace.workspace_paths = [
        ...new Set([
          ...trace.workspace_paths,
          ...event.workspace_paths.filter(
            (path): path is string => typeof path === "string",
          ),
        ]),
      ].sort();
    }
    if (event.event_type === "tool.requested") {
      applyToolRequested(trace, event);
    } else if (event.event_type === "tool.completed") {
      applyToolCompleted(trace, event);
    } else if (event.event_type === "tool.failed") {
      applyToolFailed(trace, event);
    }
    traces.set(toolUseId, trace);
  }
  return [...traces.values()].sort((left, right) =>
    (left.requested_at ?? left.completed_at ?? "").localeCompare(
      right.requested_at ?? right.completed_at ?? "",
    ),
  );
}

export function buildPostmortem(
  workspaceRoot: string,
  runId: string,
  options: Readonly<{ include_transcript?: boolean }> = {},
): PostmortemReport {
  const binding = readRunBinding(workspaceRoot, runId);
  const goal = readBoundGoal(workspaceRoot, binding);
  const events = listRunEvents(workspaceRoot, runId);
  const findings: string[] = [];

  for (const event of events) {
    if (
      event.run_id !== binding.run_id ||
      event.provider !== binding.provider ||
      event.goal_digest !== binding.goal_digest ||
      event.policy_digest !== binding.policy_digest
    ) {
      findings.push(`GK_EVENT_BINDING_MISMATCH:${event.event_id}`);
    }
  }

  const runDecisions = events
    .filter((event) => event.event_type === "decision.recorded")
    .map((event) => ({ event, decision: parseRunDecision(event.decision) }));
  const decisions: PostmortemDecision[] = [
    ...goal.decisions.map((decision) => ({
      ...decision,
      source: "goal-contract" as const,
      authority: goal.authority,
    })),
    ...runDecisions.map(({ event, decision }) => ({
      decision_id: decision.decision_id,
      summary: decision.summary,
      parent_decision_id: decision.parent_decision_id,
      evidence_refs: decision.evidence_refs,
      source: "run-event" as const,
      authority: decision.authority,
      occurred_at: event.occurred_at,
    })),
  ];
  const tools = toolTraces(events);
  for (const tool of tools) {
    if (tool.outcome === "not_observed_completed") {
      findings.push(`GK_TOOL_OUTCOME_UNOBSERVED:${tool.tool_use_id}`);
    }
  }

  const prompts = events
    .filter((event) => event.event_type === "prompt.submitted")
    .map((event) => {
      // Resolve once so the narrowed `string` type (not `string | undefined`) flows into
      // the conditional spread below — exactOptionalPropertyTypes forbids the alternative.
      const turnId = optionalString(event.turn_id);
      const promptSha256 = optionalString(event.prompt_sha256);
      return {
        occurred_at: event.occurred_at,
        ...(turnId === undefined ? {} : { turn_id: turnId }),
        ...(promptSha256 === undefined ? {} : { prompt_sha256: promptSha256 }),
        ...(typeof event.prompt_bytes === "number"
          ? { prompt_bytes: event.prompt_bytes }
          : {}),
      };
    });

  let transcript: TranscriptReadout | undefined;
  if (options.include_transcript === true) {
    const locator = transcriptLocator(events);
    transcript =
      locator === undefined
        ? {
            available: false,
            messages: [],
            tool_calls: [],
            redactions: 0,
            parse_errors: 0,
            truncated: false,
            finding: "GK_TRANSCRIPT_LOCATOR_MISSING",
          }
        : parseTranscript(locator);
    if (transcript.finding !== undefined) findings.push(transcript.finding);
    if (transcript.parse_errors > 0) {
      findings.push(`GK_TRANSCRIPT_PARSE_ERRORS:${transcript.parse_errors}`);
    }
    if (transcript.truncated) findings.push("GK_TRANSCRIPT_TRUNCATED");
  }

  return {
    schema_version: 1,
    run_id: binding.run_id,
    provider: binding.provider,
    workspace_root: binding.workspace_root,
    binding: {
      bound_at: binding.bound_at,
      policy_version: binding.policy_version,
      policy_digest: binding.policy_digest,
    },
    goal,
    decisions,
    tools,
    prompts,
    events,
    ...(transcript === undefined ? {} : { transcript }),
    findings,
  };
}
