import { attempt } from "../../shared/src/attempt.ts";
import { request } from "node:http";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { jsonOf, z } from "../../shared/src/zod.ts";
import {
  canonicalUuid,
  shortRecipientAddress,
  type RecipientVendor,
} from "./recipient-prefix.ts";

export const MAX_RECORDS = 1000;
const MAX_BYTES = 4 * 1024 * 1024;
const Id = z
  .string()
  .min(1)
  .refine((id) => id === id.trim());
const ClaudeAgents = z
  .array(
    z.object({
      sessionId: Id,
      name: z.string().nullish(),
      cwd: z.string().nullish(),
      status: z.string(),
      kind: z.string().optional(),
    }),
  )
  .max(MAX_RECORDS);
const Thread = z.object({
  id: Id,
  name: z.string().nullish(),
  agentNickname: z.string().nullish(),
  cwd: z.string().nullish(),
  status: z.object({ type: z.string() }),
});
export type Recipient = {
  address: string;
  vendor: "codex" | "claude";
  id: string;
  name: string | null;
  cwd: string | null;
  state: string;
  availability: string;
  source: string;
  observedAt: string;
};
export type Backend = {
  vendor: "codex" | "claude";
  source: string;
  availability: "available" | "unavailable";
  detail: string;
};

async function boundedText(
  stream: ReadableStream<Uint8Array>,
): Promise<string | Error> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES)
      return new Error("inventory exceeds 4 MiB output limit");
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString();
}

export async function claudeInventory(
  timeoutMs: number,
): Promise<Recipient[] | Error> {
  const signal = AbortSignal.timeout(timeoutMs);
  const child = Bun.spawn(["claude", "agents", "--json"], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal,
    killSignal: "SIGKILL",
  });
  const operation = async (): Promise<Recipient[] | Error> => {
    const [code, output, errors] = await Promise.all([
      child.exited,
      boundedText(child.stdout),
      boundedText(child.stderr),
    ]);
    if (output instanceof Error) return output;
    if (signal.aborted) return new Error("discovery deadline exceeded");
    if (code !== 0)
      return new Error(
        `claude agents exited ${code}: ${typeof errors === "string" ? errors.slice(0, 500) : errors.message}`,
      );
    const parsed = jsonOf(ClaudeAgents).safeParse(output);
    if (!parsed.success) return new Error("Invalid Claude inventory schema");
    const agents = parsed.data;
    const observedAt = Temporal.Now.instant().toString();
    return agents.map((agent) => ({
      address: `claude:${agent.sessionId}`,
      vendor: "claude",
      id: agent.sessionId,
      name: agent.name ?? null,
      cwd: agent.cwd ?? null,
      state: agent.status,
      availability: "active-native-registration",
      source: "claude agents --json",
      observedAt,
    }));
  };
  return operation().finally(() => {
    child.kill();
  });
}

/** Existing daemon only. RFC6455 client framing; no daemon launch or agent input. */
export async function codexInventory(timeoutMs: number): Promise<Recipient[]> {
  const socketPath = join(
    process.env.CODEX_HOME ?? join(homedir(), ".codex"),
    "app-server-control",
    "app-server-control.sock",
  );
  return new Promise((resolve, reject) => {
    let finish = false;
    let received = 0;
    let pending = Buffer.alloc(0);
    let nextId = 1;
    let cursor: string | null = null;
    const ids = new Set<string>();
    const recipients: Recipient[] = [];
    const requests = new Map<number, string>();
    const req = request({
      socketPath,
      path: "/",
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
      },
    });
    const timer = setTimeout(() => {
      fail(new Error("Codex discovery deadline exceeded"));
    }, timeoutMs);
    let close: () => void = () => {
      req.destroy();
    };
    function fail(error: Error) {
      if (finish) return;
      finish = true;
      clearTimeout(timer);
      close();
      reject(error);
    }
    req.on("error", fail);
    req.on("response", () => {
      fail(new Error("Codex control socket did not upgrade"));
    });
    req.on("upgrade", (response, socket, head) => {
      close = () => {
        socket.destroy();
        req.destroy();
      };
      if (response.statusCode !== 101) {
        fail(new Error("Codex upgrade rejected"));
        return;
      }
      function send(method: string, params: unknown) {
        const id = nextId++;
        requests.set(id, method);
        const payload = Buffer.from(JSON.stringify({ id, method, params }));
        const mask = randomBytes(4);
        const header = Buffer.alloc(payload.length < 126 ? 6 : 8);
        header[0] = 0x81;
        if (payload.length < 126) {
          header[1] = 0x80 | payload.length;
          mask.copy(header, 2);
        } else {
          header[1] = 0xfe;
          header.writeUInt16BE(payload.length, 2);
          mask.copy(header, 4);
        }
        for (let i = 0; i < payload.length; i++)
          payload[i] = payload.readUInt8(i) ^ mask.readUInt8(i % 4);
        socket.write(Buffer.concat([header, payload]));
      }
      function readNext() {
        const id = [...ids][recipients.length];
        if (id !== undefined)
          send("thread/read", { threadId: id, includeTurns: false });
        else if (cursor !== null)
          send("thread/loaded/list", { limit: MAX_RECORDS, cursor });
        else {
          finish = true;
          clearTimeout(timer);
          close();
          resolve(recipients);
        }
      }
      function message(text: string) {
        const parsedRpc = jsonOf(
          z.object({
            id: z.number().optional(),
            result: z.unknown().optional(),
            error: z.unknown().optional(),
          }),
        ).safeParse(text);
        if (!parsedRpc.success) {
          fail(new Error("Invalid Codex RPC schema"));
          return;
        }
        const rpc = parsedRpc.data;
        if (rpc.id === undefined) return;
        const method = requests.get(rpc.id);
        if (method === undefined) return;
        requests.delete(rpc.id);
        if (rpc.error !== undefined) {
          fail(
            new Error(
              `Codex ${method}: ${JSON.stringify(rpc.error).slice(0, 500)}`,
            ),
          );
          return;
        }
        if (method === "initialize")
          send("thread/loaded/list", { limit: MAX_RECORDS });
        else if (method === "thread/loaded/list") {
          const parsedPage = z
            .object({ data: z.array(Id), nextCursor: z.string().nullable() })
            .safeParse(rpc.result);
          if (!parsedPage.success) {
            fail(new Error("Invalid Codex loaded list"));
            return;
          }
          const page = parsedPage.data;
          for (const id of page.data) ids.add(id);
          if (
            ids.size > MAX_RECORDS ||
            (page.nextCursor !== null &&
              (page.nextCursor === cursor || page.data.length === 0))
          ) {
            fail(new Error("Codex inventory exceeds record/pagination limit"));
            return;
          }
          cursor = page.nextCursor;
          readNext();
        } else {
          const parsedThread = z
            .object({ thread: Thread })
            .safeParse(rpc.result);
          if (!parsedThread.success) {
            fail(new Error("Invalid Codex thread metadata"));
            return;
          }
          const { thread } = parsedThread.data;
          const expected = [...ids][recipients.length];
          if (thread.id !== expected) {
            fail(new Error("Codex returned a different thread ID"));
            return;
          }
          recipients.push({
            address: `codex:${thread.id}`,
            vendor: "codex",
            id: thread.id,
            name: thread.name ?? thread.agentNickname ?? null,
            cwd: thread.cwd ?? null,
            state: thread.status.type,
            availability: "loaded-native-endpoint",
            source: "codex shared app-server thread/loaded/list + thread/read",
            observedAt: Temporal.Now.instant().toString(),
          });
          readNext();
        }
      }
      function frame(): boolean {
        if (pending.length < 2) return false;
        const first = pending[0] ?? 0;
        const second = pending[1] ?? 0;
        let length = second & 127;
        let offset = 2;
        if (length === 126) {
          if (pending.length < 4) return false;
          length = pending.readUInt16BE(2);
          offset = 4;
        }
        if (length === 127) {
          if (pending.length < 10) return false;
          const big = pending.readBigUInt64BE(2);
          if (big > BigInt(MAX_BYTES)) {
            fail(new Error("Codex frame exceeds output limit"));
            return false;
          }
          length = Number(big);
          offset = 10;
        }
        if (pending.length < offset + length) return false;
        if ((first & 128) === 0 || (second & 128) !== 0) {
          fail(new Error("Unsupported fragmented/masked Codex frame"));
          return false;
        }
        const payload = pending.subarray(offset, offset + length);
        pending = pending.subarray(offset + length);
        if ((first & 15) === 1) message(payload.toString());
        if ((first & 15) === 8) {
          fail(new Error("Codex closed discovery connection"));
          return false;
        }
        return !finish;
      }
      function consume(data: Buffer) {
        received += data.length;
        if (received > MAX_BYTES) {
          fail(new Error("Codex inventory exceeds output limit"));
          return;
        }
        pending = Buffer.concat([pending, data]);
        void attempt(() => {
          while (frame()) {
            /* bounded by received bytes */
          }
        }).then((result) => {
          if (!result.ok) fail(new Error(String(result.error)));
        });
      }
      socket.on("data", consume);
      socket.on("error", fail);
      socket.on("close", () => {
        if (!finish) fail(new Error("Codex discovery connection closed"));
      });
      send("initialize", {
        clientInfo: { name: "xmsg", version: "0.2.0" },
        capabilities: { experimentalApi: true },
      });
      if (head.length > 0) consume(head);
    });
    req.end();
  });
}

export async function listRecipients(
  json: boolean,
  timeoutMs: number,
): Promise<number> {
  const codex =
    Bun.which("codex") === null
      ? Promise.resolve(new Error("codex CLI unavailable on PATH"))
      : codexInventory(timeoutMs);
  const results = await Promise.allSettled([codex, claudeInventory(timeoutMs)]);
  const vendors = ["codex", "claude"] satisfies Array<"codex" | "claude">;
  const backends: Backend[] = [];
  const unique = new Map<string, Recipient>();
  for (const [index, result] of results.entries()) {
    const vendor = vendors[index];
    if (vendor === undefined) continue;
    const source =
      vendor === "codex"
        ? "shared local app-server control socket"
        : "claude agents --json";
    let detail =
      "Current native inventory; no delivery/read receipt. Saved/unloaded sessions excluded.";
    let availability: Backend["availability"] = "available";
    if (result.status === "rejected") {
      availability = "unavailable";
      detail = String(result.reason);
    } else if (result.value instanceof Error) {
      availability = "unavailable";
      detail = result.value.message;
    } else {
      result.value.forEach((recipient) => {
        const id = canonicalUuid(recipient.id) ?? recipient.id;
        unique.set(`${vendor}:${id}`, {
          ...recipient,
          id,
          address: `${vendor}:${id}`,
        });
      });
    }
    backends.push({ vendor, source, availability, detail });
    if (availability === "unavailable")
      process.stderr.write(
        `xmsg: ${vendor} discovery unavailable: ${detail}\n`,
      );
  }
  const snapshot = [...unique.values()].toSorted((a, b) =>
    a.address.localeCompare(b.address),
  );
  const recipients = snapshot.map((r) =>
    Object.assign({}, r, {
      shortAddress: shortRecipientAddress(r, snapshot, {
        vendor: r.vendor,
        available: true,
        complete: true,
      }),
    }),
  );
  const output = { recipients, count: recipients.length, backends };
  if (json) process.stdout.write(JSON.stringify(output) + "\n");
  else {
    for (const r of recipients)
      process.stdout.write(
        `${r.shortAddress}\tname=${JSON.stringify(r.name ?? "unavailable")}\tcwd=${JSON.stringify(r.cwd ?? "unavailable")}\tstate=${JSON.stringify(r.state)}\n`,
      );
    for (const b of backends)
      process.stdout.write(`${b.vendor}: ${b.availability}\n`);
    process.stdout.write(`${recipients.length} unique recipients\n`);
  }
  return backends.every((b) => b.availability === "available") ? 0 : 3;
}

/** Only a successful bounded native inventory constitutes completeness evidence. */
export async function selectedInventory(
  vendor: RecipientVendor,
  timeoutMs: number,
) {
  const result = await attempt(() =>
    vendor === "codex" ? codexInventory(timeoutMs) : claudeInventory(timeoutMs),
  );
  if (!result.ok) {
    const reason = String(result.error);
    return {
      recipients: [],
      evidence: { vendor, available: false, complete: false, reason },
    };
  }
  if (result.value instanceof Error) {
    const reason = result.value.message;
    return {
      recipients: [],
      evidence: { vendor, available: false, complete: false, reason },
    };
  }
  return {
    recipients: result.value,
    evidence: { vendor, available: true, complete: true },
  };
}
