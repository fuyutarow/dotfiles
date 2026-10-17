#!/usr/bin/env bun
import { cli } from "cleye";
import packageJson from "../package.json" with { type: "json" };
import { attempt, errorMessage } from "../../shared/src/attempt.ts";
import { plainHelp, printVersion } from "../../shared/src/cli.ts";
import { claudeReceipt } from "./claude-receipt.ts";

function unknown(reason: string): number {
  process.stderr.write(
    `xmsg: acceptance unknown (${reason}); do not resend without checking\n`,
  );
  return 4;
}

function claudePrompt(target: string, message: string): string {
  return [
    "Use ListAgents to find exactly one live Claude Code session matching the supplied identifier. If there is no exact unique match, do not send.",
    `Target: ${JSON.stringify(target)}`,
    `Send this exact text once using SendMessage: ${JSON.stringify(message)}`,
    "Do not retry or perform any other action. Your final text is not a delivery receipt; the caller inspects the tool result.",
  ].join("\n");
}

async function send(
  kind: "codex" | "claude",
  id: string,
  message: string,
  timeoutMs: number,
): Promise<number> {
  const args =
    kind === "codex"
      ? ["queue", "--thread", id, "--message", message]
      : [
          "--print",
          "--tools=ListAgents,SendMessage",
          "--allowedTools=ListAgents,SendMessage",
          "--output-format",
          "stream-json",
          "--verbose",
          claudePrompt(id, message),
        ];
  const timeout = AbortSignal.timeout(timeoutMs);
  const spawned = await attempt(() =>
    Bun.spawn([kind, ...args], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "inherit",
      signal: timeout,
      killSignal: "SIGKILL",
    }),
  );
  if (!spawned.ok) {
    process.stderr.write(
      `xmsg: transport unreachable: cannot start ${kind}: ${errorMessage(spawned.error)}\n`,
    );
    return 3;
  }
  const child = spawned.value;
  const result = await attempt(() =>
    Promise.all([child.exited, child.stdout.text()]),
  );
  if (timeout.aborted) return unknown(`timed out after ${timeoutMs} ms`);
  if (!result.ok) return unknown(errorMessage(result.error));
  const [code, output] = result.value;
  if (kind === "codex") {
    if (code !== 0) {
      process.stderr.write(
        `xmsg: codex transport rejected the request (exit ${code})\n`,
      );
      return 1;
    }
    process.stdout.write(
      output === "" ? `xmsg: accepted for codex:${id}\n` : output,
    );
    return 0;
  }
  const receipt = claudeReceipt(output, message);
  if (receipt?.accepted === false) {
    process.stderr.write("xmsg: SendMessage rejected the request\n");
    return 1;
  }
  if (code !== 0) return unknown(`claude exited ${code}`);
  if (receipt === undefined)
    return unknown("no confirmed SendMessage tool_result");
  process.stdout.write(
    `xmsg: accepted for claude:${id} msg_id=${receipt.msgId}\n`,
  );
  return 0;
}

async function main(): Promise<number> {
  if (printVersion(packageJson, "xmsg", Bun.argv.slice(2))) return 0;
  const parsed = await attempt(() =>
    cli({
      name: "xmsg",
      parameters: ["[action]"],
      strictFlags: true,
      ignoreArgv(type, flag) {
        if (type === "unknown-flag") {
          process.stderr.write(`xmsg: unknown option: ${flag}\n`);
          process.exit(2);
        }
      },
      flags: {
        to: {
          type: String,
          description: "Recipient: codex:<thread> or claude:<session>",
        },
        message: { type: String, description: "Exact text to send" },
        timeoutMs: {
          type: Number,
          default: 60_000,
          description: "Send deadline in milliseconds",
        },
      },
      help: {
        render: plainHelp,
        description:
          "Send once to an existing session. Exit: 0 accepted, 1 rejected, 2 usage, 3 unreachable, 4 acceptance unknown.",
      },
    }),
  );
  if (!parsed.ok) {
    process.stderr.write(`xmsg: ${errorMessage(parsed.error)}\n`);
    return 2;
  }
  const args = parsed.value;
  const match = /^(codex|claude):(.+)$/u.exec(args.flags.to ?? "");
  const kind = match?.[1];
  const id = match?.[2]?.trim();
  const message = args.flags.message;
  const timeoutMs = args.flags.timeoutMs;
  if (
    args._.action !== "send" ||
    args._.length !== 1 ||
    (kind !== "codex" && kind !== "claude") ||
    id === undefined ||
    id === "" ||
    message === undefined ||
    message.length === 0 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 2_147_483_647
  ) {
    process.stderr.write(
      "xmsg: usage: xmsg send --to codex:<thread>|claude:<session> --message TEXT [--timeout-ms N]\n",
    );
    return 2;
  }
  return send(kind, id, message, timeoutMs);
}

if (import.meta.main) {
  const result = await attempt(main);
  process.exitCode = result.ok
    ? result.value
    : unknown(errorMessage(result.error));
}
