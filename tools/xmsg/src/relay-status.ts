import { homedir } from "node:os";
import { join } from "node:path";
import { attempt } from "../../shared/src/attempt.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { claudeReceipt } from "./claude-receipt.ts";

const Frame = z.object({
  type: z.string(),
  session_id: z.string().optional(),
  sessionId: z.string().optional(),
  message: z.unknown().optional(),
});
const Message = z.object({ content: z.array(z.unknown()) });
const Send = z.object({
  type: z.literal("tool_use"),
  name: z.literal("SendMessage"),
  input: z.object({ message: z.string() }),
});
const ToolResult = z.object({
  type: z.literal("tool_result"),
  content: z.union([
    z.string(),
    z.array(z.object({ type: z.literal("text"), text: z.string() })),
  ]),
});
const MessageId = z.object({ msg_id: z.string() });

function blockEvidence(block: unknown) {
  const send = Send.safeParse(block);
  const result = ToolResult.safeParse(block);
  let texts: string[] = [];
  if (result.success)
    texts =
      typeof result.data.content === "string"
        ? [result.data.content]
        : result.data.content.map((part) => part.text);
  return {
    message: send.success ? send.data.input.message : undefined,
    msgIds: texts.flatMap((text) => {
      const id = jsonOf(MessageId).safeParse(text);
      return id.success ? [id.data.msg_id] : [];
    }),
  };
}

/** Evidence is extracted independently of receipt validity, including partial streams. */
export function relayEvidence(output: string) {
  const frames = output.split("\n").flatMap((line) => {
    const frame = jsonOf(Frame).safeParse(line);
    return frame.success ? [frame.data] : [];
  });
  const blocks = frames.flatMap(
    (frame) => Message.safeParse(frame.message).data?.content ?? [],
  );
  const evidence = blocks.map((block) => blockEvidence(block));
  const final =
    frames.findLast((frame) => frame.type === "result") ?? frames.at(-1);
  return {
    sessionId: final?.session_id ?? final?.sessionId,
    msgIds: [...new Set(evidence.flatMap((block) => block.msgIds))],
    messages: evidence.flatMap((block) =>
      block.message === undefined ? [] : [block.message],
    ),
  };
}

export function relayCheckCommand(sessionId: string): string {
  return `xmsg status --relay '${sessionId.replaceAll("'", "'\\''")}'`;
}

/** Read persisted native messages only; never resume a model turn or send a message. */
export async function relayStatus(sessionId: string): Promise<number> {
  const root = join(
    process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"),
    "projects",
  );
  const found = await attempt(async () => {
    const paths: string[] = [];
    for await (const path of new Bun.Glob(`*/${sessionId}.jsonl`).scan({
      cwd: root,
      absolute: true,
    }))
      paths.push(path);
    if (paths.length !== 1) return null;
    const path = paths[0];
    if (path === undefined) return null;
    const file = Bun.file(path);
    if (file.size > 16 * 1024 * 1024) return null;
    return file.text();
  });
  if (!found.ok || found.value === null) {
    process.stderr.write(
      `xmsg: acceptance unknown relay_session_id=${sessionId}; transcript missing, ambiguous, unreadable or exceeds 16 MiB; do not resend without checking\n`,
    );
    return 4;
  }
  // Native transcripts also contain progress and file-history records, not stream frames.
  const lines = found.value.split("\n").filter((line) => line.trim() !== "");
  const frames: string[] = [];
  for (const line of lines) {
    const frame = jsonOf(Frame).safeParse(line);
    if (!frame.success) {
      process.stderr.write(
        `xmsg: acceptance unknown relay_session_id=${sessionId}; malformed transcript; do not resend without checking\n`,
      );
      return 4;
    }
    if (
      (frame.data.sessionId ?? frame.data.session_id ?? sessionId) !== sessionId
    ) {
      process.stderr.write(
        `xmsg: acceptance unknown relay_session_id=${sessionId}; transcript session mismatch; do not resend without checking\n`,
      );
      return 4;
    }
    if (
      frame.data.type === "result" ||
      frame.data.type === "assistant" ||
      (frame.data.type === "user" &&
        !z.object({ content: z.string() }).safeParse(frame.data.message)
          .success)
    )
      frames.push(line);
  }
  const output = frames.join("\n");
  const evidence = relayEvidence(output);
  const message =
    evidence.messages.length === 1 ? evidence.messages[0] : undefined;
  const receipt =
    message === undefined ? undefined : claudeReceipt(output, message);
  if (receipt?.accepted === true) {
    process.stdout.write(
      `xmsg: accepted relay_session_id=${sessionId} msg_id=${receipt.msgId}\n`,
    );
    return 0;
  }
  if (receipt?.accepted === false) {
    process.stderr.write(`xmsg: rejected relay_session_id=${sessionId}\n`);
    return 1;
  }
  process.stderr.write(
    `xmsg: acceptance unknown relay_session_id=${sessionId} msg_id=${JSON.stringify(evidence.msgIds)}; no confirmed SendMessage tool_result; do not resend without checking\n`,
  );
  return 4;
}
