// Names use the same formatter as Claude's launcher/assign hook. Codex has no native agent-name
// field, so its authoritative name is generated from the exact thread and cwd. Herdr display
// tokens are presentation state and never a naming input.
import { createConnection } from "node:net";
import { agentNameFor } from "../../../tools/shared/src/agent-name.ts";
import { jsonOf, z } from "../../hooks/zod.ts";

export function codexAgentName(
  cwd: string,
  threadId: string,
  _paneDisplayName?: string,
): string {
  // Stable across hook processes and resume, without consulting another vendor's session list.
  const digest = new Bun.CryptoHasher("sha256").update(threadId).digest();
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  const suffix = Array.from(
    digest.subarray(0, 4),
    (byte) => alphabet[byte & 31],
  ).join("");
  return agentNameFor(cwd, "agt", suffix);
}

const PaneReply = jsonOf(
  z.object({
    result: z.object({
      pane: z.object({
        pane_id: z.string(),
      }),
    }),
  }),
);

// A matching response proves the pane is current. Keep the compatibility shape for the reporter,
// but never promote a pane display token to Codex identity. No shell, Claude cache, or global
// settings.
export async function readHerdrPaneName(): Promise<
  { name: string | undefined } | undefined
> {
  const path = process.env["HERDR_SOCKET_PATH"];
  const paneId = process.env["HERDR_PANE_ID"];
  if (
    path === undefined ||
    path === "" ||
    paneId === undefined ||
    paneId === "" ||
    process.env["HERDR_ENV"] !== "1"
  )
    return undefined;
  return new Promise((resolve) => {
    const socket = createConnection(path);
    let input = "";
    let done = false;
    const finish = (value?: { name: string | undefined }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(finish, 200);
    socket.on("error", () => {
      finish();
    });
    socket.on("end", () => {
      finish();
    });
    socket.on("connect", () => {
      socket.write(
        `${JSON.stringify({ id: "dotfiles:codex-name", method: "pane.get", params: { pane_id: paneId } })}\n`,
      );
    });
    socket.on("data", (chunk: Buffer) => {
      input += chunk.toString("utf8");
      if (Buffer.byteLength(input) > 64 * 1024) {
        finish();
        return;
      }
      const end = input.indexOf("\n");
      if (end < 0) return;
      const parsed = PaneReply.safeParse(input.slice(0, end));
      const pane = parsed.success ? parsed.data.result.pane : undefined;
      finish(pane?.pane_id === paneId ? { name: undefined } : undefined);
    });
  });
}
