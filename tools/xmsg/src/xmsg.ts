#!/usr/bin/env bun
import { cli } from "cleye";
import packageJson from "../package.json" with { type: "json" };
import { attempt, errorMessage } from "../../shared/src/attempt.ts";
import { standardCli } from "../../shared/src/cli.ts";
import { listRecipients, selectedInventory } from "./inventory.ts";
import { canonicalUuid, resolveRecipientSelector } from "./recipient-prefix.ts";
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
          "--model",
          "haiku",
          "--effort",
          "low",
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
  const argv = Bun.argv.slice(2);
  const parse = standardCli(cli, packageJson, () => [...argv]);
  const parsed = await attempt(() =>
    parse({
      name: "xmsg",
      parameters: ["[action]"],
      strictFlags: true,
      ignoreArgv(type, flag) {
        if (type !== "unknown-flag") return;
        process.stderr.write(`xmsg: unknown flag ${flag}\n`);
        process.exit(2);
      },
      flags: {
        json: {
          type: Boolean,
          description: "Machine-readable recipient inventory (list only)",
        },
        to: {
          type: String,
          description: "Recipient: codex:<thread> or claude:<session>",
        },
        message: { type: String, description: "Exact text to send" },
        timeoutMs: {
          type: Number,
          default: 60_000,
          description: "Send/discovery deadline in milliseconds",
        },
      },
      help: {
        description:
          "List discoverable recipients with xmsg list [--json], or send once to an existing session. List exits 0 complete, 3 incomplete. Send exit: 0 accepted, 1 rejected, 2 usage, 3 unreachable, 4 acceptance unknown.",
      },
    }),
  );
  if (!parsed.ok) {
    process.stderr.write(`xmsg: ${errorMessage(parsed.error)}\n`);
    return 2;
  }
  const args = parsed.value;
  if (args._.action === "list") {
    if (
      args._.length !== 1 ||
      args.flags.to !== undefined ||
      args.flags.message !== undefined ||
      !Number.isInteger(args.flags.timeoutMs) ||
      args.flags.timeoutMs < 1 ||
      args.flags.timeoutMs > 2_147_483_647
    ) {
      process.stderr.write(
        "xmsg: usage: xmsg list [--json] [--timeout-ms N]\n",
      );
      return 2;
    }
    return listRecipients(args.flags.json ?? false, args.flags.timeoutMs);
  }
  const match = /^(codex|claude):(.+)$/u.exec(args.flags.to ?? "");
  const kind = match?.[1];
  const id = match?.[2];
  const message = args.flags.message;
  const timeoutMs = args.flags.timeoutMs;
  if (
    args._.action !== "send" ||
    args.flags.json !== undefined ||
    args._.length !== 1 ||
    (kind !== "codex" && kind !== "claude") ||
    id === undefined ||
    id === "" ||
    id.trim() !== id ||
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
  const deadline = performance.now() + timeoutMs;
  let target = canonicalUuid(id) ?? id;
  if (canonicalUuid(id) === undefined && /^[0-9a-f-]+$/iu.test(id)) {
    const { recipients, evidence } = await selectedInventory(kind, timeoutMs);
    const resolution = resolveRecipientSelector(
      `${kind}:${id}`,
      recipients,
      evidence,
    );
    if (!resolution.ok) {
      process.stderr.write(`xmsg: ${resolution.reason}\n`);
      process.stderr.write(
        resolution.candidates
          .toSorted((a, b) => a.address.localeCompare(b.address))
          .map(
            (candidate) =>
              `${candidate.address}\tname=${JSON.stringify(candidate.name)}\n`,
          )
          .join(""),
      );
      return evidence.available ? 2 : 3;
    }
    target = canonicalUuid(resolution.recipient.id) ?? resolution.recipient.id;
  }
  const remaining = Math.floor(deadline - performance.now());
  if (remaining < 1) {
    process.stderr.write(
      "xmsg: discovery exhausted the send deadline; no send attempted\n",
    );
    return 3;
  }
  return send(kind, target, message, remaining);
}

if (import.meta.main) {
  const result = await attempt(main);
  process.exitCode = result.ok
    ? result.value
    : unknown(errorMessage(result.error));
}
