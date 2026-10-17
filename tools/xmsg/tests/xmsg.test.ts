import { afterAll, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { jsonOf, z } from "../../shared/src/zod.ts";

const cli = resolve(import.meta.dir, "../src/xmsg.ts");
const roots: string[] = [];
const message = "Literal ' $(touch nope)\n日本語";
const msgId = "de2d35d2-4ad8-4bd3-a28d-21184c0218ca";
const use = {
  type: "assistant",
  message: {
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: "send-1",
        name: "SendMessage",
        input: { to: "peer", message },
      },
    ],
  },
};
const result = (content: unknown, toolUseId = "send-1", isError = false) => ({
  type: "user",
  message: {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: toolUseId,
        is_error: isError,
        content,
      },
    ],
  },
});
const accepted = result([
  { type: "text", text: JSON.stringify({ success: true, msg_id: msgId }) },
]);
const stream = (...events: unknown[]) =>
  events.map((event) => JSON.stringify(event)).join("\n") + "\n";

afterAll(async () => {
  await Promise.all(
    roots.map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function run(
  options: {
    args?: string[];
    kind?: "claude" | "codex";
    output?: string;
    exit?: number;
    delay?: number;
    missing?: boolean;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "xmsg-test-"));
  roots.push(root);
  const kind = options.kind ?? "claude";
  const argsFile = join(root, "argv.json");
  if (options.missing !== true) {
    const fake = join(root, kind);
    await Bun.write(
      fake,
      `#!${process.execPath}\nawait Bun.write(process.env.XMSG_FAKE_ARGS, JSON.stringify(Bun.argv.slice(2)));\nprocess.stdout.write(process.env.XMSG_FAKE_OUTPUT ?? "");\nawait Bun.sleep(Number(process.env.XMSG_FAKE_DELAY ?? 0));\nprocess.exit(Number(process.env.XMSG_FAKE_EXIT ?? 0));\n`,
    );
    await chmod(fake, 0o755);
  }
  const proc = Bun.spawn(
    [
      process.execPath,
      cli,
      ...(options.args ?? [
        "send",
        "--to",
        `${kind}:peer`,
        "--message",
        message,
      ]),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: root,
        XMSG_FAKE_ARGS: argsFile,
        XMSG_FAKE_OUTPUT: options.output ?? "",
        XMSG_FAKE_EXIT: String(options.exit ?? 0),
        XMSG_FAKE_DELAY: String(options.delay ?? 0),
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    },
  );
  const [stdout, stderr, exit] = await Promise.all([
    proc.stdout.text(),
    proc.stderr.text(),
    proc.exited,
  ]);
  const called = await Bun.file(argsFile).exists();
  const parsed = called
    ? jsonOf(z.array(z.string())).safeParse(await Bun.file(argsFile).text())
    : undefined;
  return {
    stdout,
    stderr,
    exit,
    called,
    argv: parsed?.success === true ? parsed.data : [],
  };
}

test("Claude acceptance requires a correlated tool result and hard tool restriction", async () => {
  const r = await run({ output: stream(use, accepted) });
  expect(r.exit).toBe(0);
  expect(r.stdout).toContain(msgId);
  expect(r.argv).toContain("--tools=ListAgents,SendMessage");
  expect(r.argv).toContain("--allowedTools=ListAgents,SendMessage");
  expect(r.argv).toContain("stream-json");
  expect(r.argv).toContain("--verbose");
  expect(r.argv.at(-1)).toContain(JSON.stringify(message));
});

test.each([
  ["model text alone", stream({ type: "result", result: "XMSG_ACCEPTED" })],
  ["missing tool_result", stream(use)],
  ["missing tool_use", stream(accepted)],
  [
    "unrelated result id",
    stream(
      use,
      result(JSON.stringify({ success: true, msg_id: msgId }), "other"),
    ),
  ],
  [
    "different tool",
    stream(
      {
        ...use,
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "send-1",
              name: "ListAgents",
              input: { message },
            },
          ],
        },
      },
      accepted,
    ),
  ],
  [
    "different message",
    stream(
      {
        ...use,
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "send-1",
              name: "SendMessage",
              input: { message: "changed" },
            },
          ],
        },
      },
      accepted,
    ),
  ],
  ["missing msg_id", stream(use, result(JSON.stringify({ success: true })))],
  ["malformed output", "not JSON\n"],
  ["nested relay", stream({ ...use, parent_tool_use_id: "nested" }, accepted)],
])("Claude %s leaves acceptance unknown", async (_name, output) => {
  const r = await run({ output });
  expect(r.exit).toBe(4);
  expect(r.stderr).toContain("acceptance unknown");
  expect(r.stderr).toContain("do not resend without checking");
  expect(r.stdout).not.toContain("accepted for");
});

test.each([
  result("permission denied", "send-1", true),
  result(JSON.stringify({ success: false })),
])("Claude tool rejection exits 1", async (rejected) => {
  expect((await run({ output: stream(use, rejected) })).exit).toBe(1);
});

test("a child failure cannot turn a tool receipt into success", async () => {
  const r = await run({ output: stream(use, accepted), exit: 1 });
  expect(r.exit).toBe(4);
  expect(r.stdout).not.toContain("accepted for");
});

test.each(["claude", "codex"] satisfies Array<"claude" | "codex">)(
  "%s timeout has unknown acceptance",
  async (kind) => {
    const r = await run({
      kind,
      args: [
        "send",
        "--to",
        `${kind}:peer`,
        "--message",
        message,
        "--timeout-ms",
        "300",
      ],
      output: stream(use, accepted),
      delay: 5_000,
    });
    expect(r.exit).toBe(4);
    expect(r.stderr).toContain("timed out");
    expect(r.stderr).toContain("do not resend without checking");
  },
);

test("Codex needs only its selected CLI and preserves literal arguments", async () => {
  const r = await run({
    kind: "codex",
    output: "Queued message for thread peer\n",
  });
  expect(r.exit).toBe(0);
  expect(r.argv).toEqual(["queue", "--thread", "peer", "--message", message]);
  expect(r.stdout).toContain("Queued message");
});
test("Codex failure exits 1", async () => {
  expect((await run({ kind: "codex", exit: 7 })).exit).toBe(1);
});
test.each(["claude", "codex"] satisfies Array<"claude" | "codex">)(
  "missing %s is unreachable",
  async (kind) => {
    expect((await run({ kind, missing: true })).exit).toBe(3);
  },
);
test.each(
  [
    [],
    ["send"],
    ["other"],
    ["--unknown"],
    ["--__proto__"],
    ["--constructor"],
    ["send", "--to"],
    ["send", "--to", "bad", "--message", "hi"],
    ["send", "extra", "--to", "codex:peer", "--message", "hi"],
    ["send", "--to", "codex:peer", "--message", "hi", "--timeout-ms", "0"],
  ].map((args) => ({ args })),
)("usage errors exit 2 without sending: %j", async ({ args }) => {
  const r = await run({ args });
  expect(r.exit).toBe(2);
  expect(r.called).toBe(false);
});
test("help and both version aliases need no transport", async () => {
  expect((await run({ args: ["--help"], missing: true })).exit).toBe(0);
  for (const flag of ["-V", "--version"]) {
    const r = await run({ args: [flag], missing: true });
    expect(r.exit).toBe(0);
    expect(r.stdout).toMatch(/^xmsg \d+\.\d+\.\d+\n$/u);
  }
});

test("Claude relay explicitly selects Haiku and low effort", async () => {
  const r = await run({ output: stream(use, accepted) });
  expect(r.exit).toBe(0);
  const modelIndex = r.argv.indexOf("--model");
  const effortIndex = r.argv.indexOf("--effort");
  expect(r.argv.slice(modelIndex, modelIndex + 2)).toEqual([
    "--model",
    "haiku",
  ]);
  expect(r.argv.slice(effortIndex, effortIndex + 2)).toEqual([
    "--effort",
    "low",
  ]);
});
