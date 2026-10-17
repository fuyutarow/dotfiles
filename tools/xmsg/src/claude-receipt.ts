import { jsonOf, z } from "../../shared/src/zod.ts";

const Event = z.object({
  type: z.enum(["assistant", "user"]),
  parent_tool_use_id: z.string().nullable().optional(),
  message: z.object({ role: z.string(), content: z.array(z.unknown()) }),
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
  | { accepted: false };

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
  constructor(readonly message: string) {}

  recordUse(block: unknown): void {
    const use = Use.safeParse(block);
    if (!use.success || use.data.name !== "SendMessage") return;
    this.sends.add(use.data.id);
    const input = Input.safeParse(use.data.input);
    if (input.success && input.data.message === this.message)
      this.matching.add(use.data.id);
  }

  recordResult(block: unknown): void {
    const result = Result.safeParse(block);
    if (!result.success || !this.matching.has(result.data.tool_use_id)) return;
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
    )
      return;
    if (event.type !== event.message.role) return;
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
  for (const line of output
    .split("\n")
    .filter((value) => value.trim() !== "")) {
    const json = jsonOf(z.unknown()).safeParse(line);
    if (!json.success) return undefined;
    const event = Event.safeParse(json.data);
    if (event.success) reader.observe(event.data);
  }
  // More than one attempt/result may mean a duplicate send: never invite an automatic retry.
  return reader.sends.size === 1 && reader.receipts.length === 1
    ? reader.receipts[0]
    : undefined;
}
