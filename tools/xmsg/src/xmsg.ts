#!/usr/bin/env bun
import { cli } from "cleye";
import packageJson from "../package.json" with { type: "json" };
import { attempt, errorMessage } from "../../shared/src/attempt.ts";
import { standardCli } from "../../shared/src/cli.ts";
import { listRecipients, selectedInventory } from "./inventory.ts";
import {
  canonicalUuid,
  resolveGlobalRecipientSelector,
  resolveRecipientSelector,
} from "./recipient-prefix.ts";
import { claudeReceipt } from "./claude-receipt.ts";

const unknownSender =
  "unknown (caller identity unavailable or inherited; use --from backend:<full-session-id>)";

function explicitSender(value: string): string | undefined {
  const match = /^(codex|claude):(.+)$/u.exec(value);
  const id = canonicalUuid(match?.[2] ?? "");
  return match === null || id === undefined ? undefined : `${match[1]}:${id}`;
}

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
  sender: string,
): Promise<number> {
  // Only the first line is envelope metadata; never parse or strip the body.
  message = `from: ${sender}\n\n${message}`;
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
  if (code !== 0)
    return unknown(
      `Claude relay process exited ${code}; inspect the Claude stderr above and check the recipient`,
    );
  if (receipt?.accepted === "no-send") {
    process.stderr.write(
      `xmsg: no SendMessage attempted; Claude relay step failed: ${receipt.step} for claude:${JSON.stringify(id)} (process exit 0)\n` +
        `xmsg: evidence: ${receipt.evidence}\n` +
        (receipt.step === "target resolution / SendMessage invocation"
          ? "xmsg: ListAgents completed but the relay did not select and send to a unique peer. Session UUIDs from claude agents --json may not appear in ListAgents. Verify the intended peer's exact native name with ListAgents in Claude; if uniquely identified, use xmsg send --to 'claude:<exact-native-name>'. Do not guess from a similar name.\n"
          : "xmsg: inspect Claude's tool availability and permissions for ListAgents and SendMessage; run ListAgents in Claude to check the intended peer before trying again.\n"),
    );
    return 3;
  }
  if (receipt?.accepted === false) {
    process.stderr.write("xmsg: SendMessage rejected the request\n");
    return 1;
  }
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
          description:
            "Recipient: [codex:|claude:]<UUID, UUID prefix or exact native name>; unqualified requires both inventories",
        },
        from: {
          type: String,
          description:
            "Declared sender: codex:<full-UUID> or claude:<full-UUID>; no inherited environment inference",
        },
        message: {
          type: String,
          description: "Exact body below the sender envelope",
        },
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
      args.flags.from !== undefined ||
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
  let kind = match?.[1];
  const selector = args.flags.to;
  const id = match?.[2] ?? selector;
  const message = args.flags.message;
  const timeoutMs = args.flags.timeoutMs;
  if (
    args._.action !== "send" ||
    args.flags.json !== undefined ||
    args._.length !== 1 ||
    (kind === undefined && selector?.includes(":") === true) ||
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
      "xmsg: usage: xmsg send --to [codex:|claude:]<UUID|UUID-prefix|exact-name> --message TEXT [--from backend:<full-session-UUID>] [--timeout-ms N]\n",
    );
    return 2;
  }
  const sender =
    args.flags.from === undefined
      ? unknownSender
      : explicitSender(args.flags.from);
  if (sender === undefined) {
    process.stderr.write(
      "xmsg: invalid --from; use codex:<full-session-UUID> or claude:<full-session-UUID> (no prefixes or names)\n",
    );
    return 2;
  }
  const deadline = performance.now() + timeoutMs;
  let target = canonicalUuid(id) ?? id;
  if (kind === undefined) {
    const inventories = await Promise.all([
      selectedInventory(
        "codex",
        Math.max(1, Math.floor(deadline - performance.now())),
      ),
      selectedInventory(
        "claude",
        Math.max(1, Math.floor(deadline - performance.now())),
      ),
    ]);
    const resolution = resolveGlobalRecipientSelector(
      id,
      inventories.flatMap((inventory) => inventory.recipients),
      inventories.map((inventory) => inventory.evidence),
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
      return resolution.error === "discovery-unavailable" ? 3 : 2;
    }
    kind = resolution.recipient.vendor;
    target = resolution.recipient.id;
  } else if (canonicalUuid(id) === undefined && /^[0-9a-f-]+$/iu.test(id)) {
    if (kind !== "codex" && kind !== "claude") return 2;
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
  if (kind !== "codex" && kind !== "claude") return 2;
  return send(kind, target, message, remaining, sender);
}

if (import.meta.main) {
  const result = await attempt(main);
  process.exitCode = result.ok
    ? result.value
    : unknown(errorMessage(result.error));
}
