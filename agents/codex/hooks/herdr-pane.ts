import { createConnection } from "node:net";
import { jsonOf, z } from "../../hooks/zod.ts";

const paneReply = jsonOf(
  z.object({ result: z.object({ pane: z.object({ pane_id: z.string() }) }) }),
);

// Confirm the configured pane is still current before reporting metadata to it.
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
    socket.on("error", finish);
    socket.on("end", finish);
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
      const parsed = paneReply.safeParse(input.slice(0, end));
      finish(
        parsed.success && parsed.data.result.pane.pane_id === paneId
          ? { name: undefined }
          : undefined,
      );
    });
  });
}
