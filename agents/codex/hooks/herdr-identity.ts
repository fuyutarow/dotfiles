// Names use the same formatter as Claude's launcher/assign hook. Herdr contributes only an
// existing name's suffix; model and effort must never be read from its possibly stale tokens.
import { createConnection } from "node:net";
import {
  agentNameFor,
  parseAgentName,
} from "../../../tools/shared/src/agent-name.ts";
import { jsonOf, z } from "../../hooks/zod.ts";

export function codexAgentName(
  cwd: string,
  threadId: string,
  existing?: string,
): string {
  const parsed = existing === undefined ? null : parseAgentName(existing);
  const short = /^agt_([a-z0-9]+)$/u.exec(existing ?? "")?.[1];
  const inherited = parsed?.role === "agt" ? parsed.id : short;
  // Stable across hook processes and resume, without consulting another vendor's session list.
  const digest = new Bun.CryptoHasher("sha256").update(threadId).digest();
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  const suffix = Array.from(
    digest.subarray(0, 4),
    (byte) => alphabet[byte & 31],
  ).join("");
  return agentNameFor(cwd, "agt", inherited ?? suffix);
}

const PaneReply = jsonOf(
  z.object({
    result: z.object({
      pane: z.object({
        pane_id: z.string(),
        tokens: z.object({ fullname: z.string().optional() }).optional(),
      }),
    }),
  }),
);

// Only a successful nameless reply permits minting a suffix. An unavailable server or invalid
// reply must not overwrite a previously known name. No shell, Claude cache, or global settings.
export async function readHerdrPaneName(): Promise<
  { name: string | undefined } | undefined
> {
  const path = process.env.HERDR_SOCKET_PATH;
  const paneId = process.env.HERDR_PANE_ID;
  if (
    path === undefined ||
    path === "" ||
    paneId === undefined ||
    paneId === "" ||
    process.env.HERDR_ENV !== "1"
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
      finish(
        pane?.pane_id === paneId ? { name: pane.tokens?.fullname } : undefined,
      );
    });
  });
}
