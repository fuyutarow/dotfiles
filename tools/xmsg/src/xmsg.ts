#!/usr/bin/env bun
import { cli } from "cleye";
import packageJson from "../package.json" with { type: "json" };
import { attempt, errorMessage } from "../../shared/src/attempt.ts";

type Destination = { kind: "codex" | "claude"; id: string };

function destination(value: string): Destination | undefined {
  const match = /^(codex|claude):(.+)$/u.exec(value);
  const kind = match?.[1];
  const id = match?.[2]?.trim();
  if ((kind !== "codex" && kind !== "claude") || id === undefined || id === "")
    return undefined;
  return { kind, id };
}

function claudePrompt(target: string, message: string): string {
  return [
    "Send one message to an existing Claude Code session using the built-in ListAgents and SendMessage tools.",
    `Target identifier supplied by the user: ${JSON.stringify(target)}`,
    "Find exactly one live session matching that identifier. If there is no exact, unique match, do not send and report why.",
    `Send this exact message text, without editing it: ${JSON.stringify(message)}`,
    "Do not use any other tools or perform any other actions. If SendMessage reports success, respond with exactly XMSG_ACCEPTED. Otherwise respond with exactly XMSG_FAILED: followed by a short reason. An accepted message is an enqueue receipt, not proof that the recipient replied.",
  ].join("\n");
}

async function run(
  command: string,
  args: string[],
  captureStdout = false,
): Promise<{ code: number; stdout: string }> {
  const timeout = AbortSignal.timeout(60_000);
  const spawned = await attempt(() =>
    Bun.spawn([command, ...args], {
      stdin: "ignore",
      stdout: captureStdout ? "pipe" : "inherit",
      stderr: "inherit",
      signal: timeout,
      killSignal: "SIGKILL",
    }),
  );
  if (!spawned.ok) {
    process.stderr.write(
      `xmsg: cannot start ${command}: ${errorMessage(spawned.error)}\n`,
    );
    return { code: 127, stdout: "" };
  }
  const stdout =
    captureStdout && spawned.value.stdout !== null
      ? new Response(spawned.value.stdout).text()
      : Promise.resolve("");
  const [code, output] = await Promise.all([spawned.value.exited, stdout]);
  if (timeout.aborted) {
    process.stderr.write(`xmsg: ${command} timed out after 60 seconds\n`);
    return { code: 124, stdout: output };
  }
  return { code, stdout: output };
}

async function main(): Promise<void> {
  if (
    Bun.argv.length === 3 &&
    ["-V", "--version"].includes(Bun.argv[2] ?? "")
  ) {
    process.stdout.write(`xmsg ${packageJson.version}\n`);
    return;
  }
  const args = cli({
    name: "xmsg",
    parameters: ["<action>"],
    flags: {
      to: {
        type: String,
        description: "Recipient: codex:<thread> or claude:<session>",
      },
      message: { type: String, description: "Message text to send" },
    },
    strictFlags: true,
    help: {
      description:
        "Send a message to an existing Codex or Claude session. Sending does not prove delivery or a reply.",
    },
  });
  if (
    args._.action !== "send" ||
    args.flags.to === undefined ||
    args.flags.message === undefined
  ) {
    process.stderr.write(
      "xmsg: usage: xmsg send --to codex:<thread>|claude:<session> --message TEXT\n",
    );
    process.exitCode = 2;
    return;
  }
  const to = destination(args.flags.to);
  if (to === undefined) {
    process.stderr.write(
      "xmsg: --to must be codex:<thread> or claude:<session>\n",
    );
    process.exitCode = 2;
    return;
  }
  const result =
    to.kind === "codex"
      ? await run("codex", [
          "queue",
          "--thread",
          to.id,
          "--message",
          args.flags.message,
        ])
      : await run(
          "claude",
          [
            "--print",
            "--allowedTools=ListAgents,SendMessage",
            "--output-format",
            "text",
            claudePrompt(to.id, args.flags.message),
          ],
          true,
        );
  if (result.code !== 0) {
    process.exitCode = result.code;
    return;
  }
  if (to.kind === "claude") {
    if (result.stdout.trim() !== "XMSG_ACCEPTED") {
      process.stderr.write(
        `xmsg: Claude did not return an accepted-send receipt${result.stdout.trim() === "" ? "" : `: ${result.stdout.trim()}`}\n`,
      );
      process.exitCode = 3;
      return;
    }
    process.stdout.write(`xmsg: queued for claude:${to.id}\n`);
  }
}

if (import.meta.main) await main();
