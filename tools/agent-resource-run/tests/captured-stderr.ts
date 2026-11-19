import { stripVTControlCharacters } from "node:util";
import { spyOn } from "bun:test";

// Production human output goes through consola (see src/agent-resource-run.ts), which
// writes each record to process.stderr. Its frame depends on the stream: fancy
// " WARN  <message>" on a TTY, plain "[warn] <message>" otherwise, and ANSI-styled on a TTY.
// This helper observes that channel and removes only consola's known level frame, so
// callers match the message exactly as the production call site supplied it. Lines without
// a known frame are kept whole and still fail the caller's checks.
const frame =
  /^(?:\[(?:debug|info|log|success|start|ready|warn|error|fail)\]|(?:DEBUG|INFO|LOG|SUCCESS|START|READY|WARN|ERROR|FAIL)) +(.*)$/u;

// Message lines of raw stderr text, with consola's level frame removed.
export function consolaMessages(stderr: string): string[] {
  return stripVTControlCharacters(stderr)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => frame.exec(line)?.[1] ?? line);
}

export async function captureStderrMessages<T>(
  run: () => Promise<T>,
): Promise<{ result: T; messages: string[] }> {
  const chunks: string[] = [];
  const write = spyOn(process.stderr, "write").mockImplementation((chunk) => {
    chunks.push(Buffer.from(chunk).toString());
    return true;
  });
  const result = await run().finally(() => {
    write.mockRestore();
  });
  return { result, messages: consolaMessages(chunks.join("")) };
}
