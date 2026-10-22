import { jsonOf, z } from "../../shared/src/zod.ts";

const Event = z.object({
  type: z.enum(["assistant", "user"]),
  parent_tool_use_id: z.string().nullable().optional(),
  message: z.object({ role: z.string(), content: z.array(z.unknown()) }),
});
const StreamRecord = z.object({ type: z.string() }).loose();
const ResultFrame = z
  .object({
    type: z.literal("result"),
    subtype: z.literal("success"),
    result: z.string(),
    api_error_status: z.null(),
    duration_api_ms: z.number(),
    duration_ms: z.number(),
    fast_mode_disabled_reason: z.string(),
    fast_mode_state: z.string(),
    first_content_frame_ms: z.number(),
    is_error: z.literal(false),
    modelUsage: z.object({}).loose(),
    num_turns: z.number(),
    permission_denials: z.array(z.unknown()),
    queued_turn_count: z.number(),
    result_index: z.number(),
    safety_stops: z.number(),
    session_id: z.string(),
    stop_reason: z.string(),
    subagent_stats: z.object({}).loose(),
    terminal_reason: z.string(),
    time_to_request_ms: z.number(),
    total_cost_usd: z.number(),
    ttft_ms: z.number(),
    ttft_stream_ms: z.number(),
    usage: z.object({}).loose(),
    uuid: z.string(),
  })
  .strict();
const MetadataFrame = z.union([
  z
    .object({
      type: z.literal("system"),
      subtype: z.literal("hook_started"),
      hook_event: z.string(),
      hook_id: z.string(),
      hook_name: z.string(),
      session_id: z.string(),
      uuid: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("system"),
      subtype: z.literal("hook_response"),
      exit_code: z.number(),
      hook_event: z.string(),
      hook_id: z.string(),
      hook_name: z.string(),
      outcome: z.string(),
      output: z.string(),
      session_id: z.string(),
      stderr: z.string(),
      stdout: z.string(),
      uuid: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("system"),
      subtype: z.literal("init"),
      session_id: z.string(),
      uuid: z.string(),
      additional_directories: z.array(z.unknown()).optional(),
      agents: z.array(z.unknown()).optional(),
      analytics_disabled: z.boolean().optional(),
      apiKeySource: z.string().optional(),
      capabilities: z.array(z.unknown()).optional(),
      claude_code_version: z.string().optional(),
      cwd: z.string().optional(),
      fast_mode_disabled_reason: z.string().optional(),
      fast_mode_state: z.string().optional(),
      mcp_servers: z.array(z.unknown()).optional(),
      memory_paths: z.object({}).loose().optional(),
      messaging_socket_path: z.string().optional(),
      model: z.string().optional(),
      original_cwd: z.string().optional(),
      output_style: z.string().optional(),
      per_turn_effort_active: z.boolean().optional(),
      permissionMode: z.string().optional(),
      plugins: z.array(z.unknown()).optional(),
      product_feedback_disabled: z.boolean().optional(),
      skills: z.array(z.unknown()).optional(),
      slash_commands: z.array(z.unknown()).optional(),
      terminal_slash_commands: z.array(z.unknown()).optional(),
      tools: z.array(z.unknown()).optional(),
      view_mode: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("system"),
      subtype: z.literal("thinking_tokens"),
      estimated_tokens: z.number(),
      estimated_tokens_delta: z.number(),
      session_id: z.string(),
      uuid: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("system"),
      subtype: z.literal("informational"),
      content: z.string(),
      level: z.string(),
      session_id: z.string(),
      uuid: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("rate_limit_event"),
      rate_limit_info: z.object({}).loose(),
      session_id: z.string(),
      uuid: z.string(),
    })
    .strict(),
]);
const SendCall = z.object({
  type: z.literal("tool_use"),
  name: z.literal("SendMessage"),
});
const ToolResultMarker = z.object({ type: z.literal("tool_result") });
const TextBlock = z.object({ type: z.literal("text"), text: z.string() });
const ThinkingBlock = z.object({
  type: z.literal("thinking"),
  signature: z.string(),
  thinking: z.string(),
});
const Use = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});
const Input = z.object({ message: z.string() });
const Result = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  is_error: z.boolean().optional(),
  content: z.union([
    z.string(),
    z.array(z.object({ type: z.literal("text"), text: z.string() })),
  ]),
});
const Receipt = z.object({
  success: z.boolean(),
  msg_id: z.string().optional(),
});

export type ClaudeReceipt =
  | { accepted: true; msgId: string }
  | { accepted: false }
  | {
      accepted: "no-send";
      topLevelSendCalls: 0;
      step:
        | "ListAgents invocation"
        | "ListAgents result"
        | "target resolution / SendMessage invocation";
      evidence: string;
    };

/** Only a top-level, correlated tool result is evidence; model prose is never a receipt. */
function receiptFromText(text: string): ClaudeReceipt[] {
  const receipt = jsonOf(Receipt).safeParse(text);
  if (!receipt.success) return [];
  if (!receipt.data.success) return [{ accepted: false }];
  const msgId = z.uuid().safeParse(receipt.data.msg_id);
  return msgId.success ? [{ accepted: true, msgId: msgId.data }] : [];
}

class ReceiptReader {
  readonly sends = new Set<string>();
  readonly matching = new Set<string>();
  readonly receipts: ClaudeReceipt[] = [];
  readonly toolUses = new Set<string>();
  readonly toolResults = new Set<string>();
  readonly lists = new Set<string>();
  readonly listResults: Array<{ id: string; error: boolean; text: string }> =
    [];
  topLevelSendCalls = 0;
  traceConsistent = true;
  constructor(readonly message: string) {}

  recordUse(block: unknown): void {
    const use = Use.safeParse(block);
    if (!use.success) {
      if (
        !TextBlock.safeParse(block).success &&
        !ThinkingBlock.safeParse(block).success
      )
        this.traceConsistent = false;
      if (SendCall.safeParse(block).success) this.topLevelSendCalls += 1;
      return;
    }
    if (this.toolUses.has(use.data.id)) this.traceConsistent = false;
    this.toolUses.add(use.data.id);
    if (use.data.name === "ListAgents") this.lists.add(use.data.id);
    if (use.data.name !== "SendMessage") return;
    this.topLevelSendCalls += 1;
    this.sends.add(use.data.id);
    const input = Input.safeParse(use.data.input);
    if (input.success && input.data.message === this.message)
      this.matching.add(use.data.id);
  }

  recordResult(block: unknown): void {
    const result = Result.safeParse(block);
    if (!result.success) {
      if (
        ToolResultMarker.safeParse(block).success ||
        !TextBlock.safeParse(block).success
      )
        this.traceConsistent = false;
      return;
    }
    if (
      !this.toolUses.has(result.data.tool_use_id) ||
      this.toolResults.has(result.data.tool_use_id)
    ) {
      this.traceConsistent = false;
      return;
    }
    this.toolResults.add(result.data.tool_use_id);
    if (this.lists.has(result.data.tool_use_id)) {
      this.listResults.push({
        id: result.data.tool_use_id,
        error: result.data.is_error === true,
        text:
          typeof result.data.content === "string"
            ? result.data.content
            : result.data.content.map((part) => part.text).join("\n"),
      });
    }
    if (!this.matching.has(result.data.tool_use_id)) return;
    if (result.data.is_error === true) {
      this.receipts.push({ accepted: false });
      return;
    }
    const texts =
      typeof result.data.content === "string"
        ? [result.data.content]
        : result.data.content.map((part) => part.text);
    this.receipts.push(...texts.flatMap((text) => receiptFromText(text)));
  }

  observe(event: z.infer<typeof Event>): void {
    if (
      event.parent_tool_use_id !== undefined &&
      event.parent_tool_use_id !== null
    ) {
      this.traceConsistent = false;
      return;
    }
    if (event.type !== event.message.role) {
      this.traceConsistent = false;
      return;
    }
    for (const block of event.message.content) {
      if (event.type === "assistant") this.recordUse(block);
      else this.recordResult(block);
    }
  }
}

export function claudeReceipt(
  output: string,
  message: string,
): ClaudeReceipt | undefined {
  const reader = new ReceiptReader(message);
  const lines = output.split("\n").filter((value) => value.trim() !== "");
  let complete = false;
  let ended = false;
  for (const [index, line] of lines.entries()) {
    const json = jsonOf(z.unknown()).safeParse(line);
    if (!json.success) return undefined;
    const record = StreamRecord.safeParse(json.data);
    if (!record.success || ended) return undefined;
    if (ResultFrame.safeParse(record.data).success) {
      ended = true;
      complete = index === lines.length - 1;
      continue;
    }
    if (record.data.type === "result") return undefined;
    const event = Event.safeParse(json.data);
    if (event.success) reader.observe(event.data);
    else if (record.data.type === "assistant" || record.data.type === "user")
      return undefined;
    else if (MetadataFrame.safeParse(record.data).success) {
      // Captured native metadata frames are non-action records; their values are ignored.
    } else reader.traceConsistent = false;
  }
  if (
    reader.topLevelSendCalls === 0 &&
    complete &&
    reader.traceConsistent &&
    reader.toolUses.size === reader.toolResults.size
  ) {
    const failed = reader.listResults.find((result) => result.error);
    const listed = failed ?? reader.listResults.at(-1);
    let step: Extract<ClaudeReceipt, { accepted: "no-send" }>["step"] =
      "ListAgents invocation";
    if (listed !== undefined)
      step = "target resolution / SendMessage invocation";
    if (failed !== undefined) step = "ListAgents result";
    let evidence = "complete trace contains zero ListAgents calls";
    if (listed !== undefined) {
      const truncated = listed.text.length > 1200 ? " (truncated)" : "";
      evidence = `ListAgents tool_use_id=${JSON.stringify(listed.id)} is_error=${listed.error}; tool_result excerpt=${JSON.stringify(listed.text.slice(0, 1200))}${truncated}`;
    }
    return {
      accepted: "no-send",
      topLevelSendCalls: 0,
      step,
      evidence,
    };
  }
  // More than one attempt/result may mean a duplicate send: never invite an automatic retry.
  return reader.topLevelSendCalls === 1 &&
    reader.sends.size === 1 &&
    reader.receipts.length === 1
    ? reader.receipts[0]
    : undefined;
}
