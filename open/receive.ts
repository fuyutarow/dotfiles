#!/usr/bin/env bun
// smart-open receiver — runs on the machine you sit at (the Mac), opens what a remote
// `smart-open` sends it. Started at login by open/smart-open-receiver.plist.mac (launchd).
// ssh/config forwards the remote /tmp/smart-open-$USER.sock to this socket, so it is reachable
// only through your own ssh connections; the socket file itself is owner-only.
//
// Protocol: one JSON line {"url": "..."} in, one line out: `ok` or `refused: <why>`.
// Only http(s) URLs are opened — anything that can write to the forwarded socket can reach this,
// and a file:// or app-scheme URL would let a remote process drive local apps.
import { chmodSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { cli } from "cleye";
import { attemptOr } from "../agents/hooks/attempt.ts";

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    console.error(`receive: unknown option '--${flag}'`);
    process.exit(2);
  }
};
const argv = cli(
  {
    name: "receive",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: [],
    help: {
      description:
        "Listen for smart-open requests forwarded over ssh and open http(s) URLs here.",
    },
    flags: {
      socket: {
        type: String,
        default: join(homedir(), ".cache/smart-open/receiver.sock"),
        description: "unix socket to listen on",
      },
    },
  },
  undefined,
  Bun.argv.slice(2),
);

const OPENER = (process.env.SMART_OPEN_OPENER ?? "open").split(" ");
const MAX_LINE = 4096;
const sock = argv.flags.socket;
mkdirSync(dirname(sock), { recursive: true, mode: 0o700 });
if (existsSync(sock)) unlinkSync(sock); // our own path; a previous run's bind

async function handle(line: string): Promise<string> {
  if (line.length > MAX_LINE) return "refused: too long";
  const msg = await attemptOr(
    () => JSON.parse(line) as { url?: unknown } | null,
    null,
  );
  const url = typeof msg?.url === "string" ? msg.url : "";
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return "refused: only http(s) URLs";
  const p = Bun.spawnSync([...OPENER, url], {
    stdout: "ignore",
    stderr: "pipe",
    timeout: 15_000,
  });
  return p.exitCode === 0 ? "ok" : `refused: opener exited ${p.exitCode}`;
}

Bun.listen({
  unix: sock,
  socket: {
    data(s, chunk) {
      const buf = `${(s.data as string | undefined) ?? ""}${chunk.toString()}`;
      const nl = buf.indexOf("\n");
      if (nl < 0) {
        s.data = buf.length > MAX_LINE ? "" : buf;
        if (buf.length > MAX_LINE) s.end("refused: too long\n");
        return;
      }
      void handle(buf.slice(0, nl)).then((reply) => s.end(`${reply}\n`));
    },
  },
});
chmodSync(sock, 0o600);
console.log(`receive: listening on ${sock}`);
