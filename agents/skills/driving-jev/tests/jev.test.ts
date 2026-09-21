import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

const script = join(import.meta.dir, "..", "scripts", "jev.ts");
const temporaryDirectories: string[] = [];

type RunResult = Readonly<{ exitCode: number; stdout: string; stderr: string }>;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function requestBody(): Record<string, unknown> {
  return {
    state: { message: "refund me" },
    model: "jev-test",
    questions: {
      asks_for_refund: {
        type: "noul",
        instructions: "Does `message` ask for a refund?",
      },
    },
  };
}

async function run(
  args: readonly string[],
  stdin = "",
  env: Record<string, string | undefined> = {},
): Promise<RunResult> {
  const child = Bun.spawn([process.execPath, script, ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, TYPESAFE_API_KEY: "fixture-key", ...env },
  });
  child.stdin.write(stdin);
  child.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function requestFile(body: unknown = requestBody()): Promise<string> {
  const directory = mkdtempSync(join(tmpdir(), "driving-jev-test-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "request.json");
  await Bun.write(path, JSON.stringify(body));
  return path;
}

describe("driving-jev runner", () => {
  test("relays one successful typed response and preserves the request", async () => {
    let observedAuthorization = "";
    let observedBody: unknown;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        observedAuthorization = request.headers.get("authorization") ?? "";
        observedBody = await request.json();
        return Response.json({
          model: "jev-test",
          answers: { asks_for_refund: { type: "noul", noul: 0.9 } },
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      },
    });
    try {
      const file = await requestFile();
      const result = await run([
        file,
        "--base-url",
        `http://127.0.0.1:${server.port}`,
        "--allow-custom-base-url",
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        model: "jev-test",
        answers: { asks_for_refund: { type: "noul", noul: 0.9 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      });
      expect(observedAuthorization).toBe("Bearer fixture-key");
      expect(observedBody).toEqual(requestBody());
    } finally {
      server.stop(true);
    }
  });

  test("accepts one request on stdin", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({ model: "jev-test", answers: {}, usage: {} });
      },
    });
    try {
      const result = await run(
        [
          "-",
          "--base-url",
          `http://127.0.0.1:${server.port}`,
          "--allow-custom-base-url",
        ],
        JSON.stringify(requestBody()),
      );
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).model).toBe("jev-test");
    } finally {
      server.stop(true);
    }
  });

  test("rejects invalid local requests before the network", async () => {
    const file = await requestFile({
      state: "x",
      model: "jev-test",
      questions: {},
    });
    const result = await run([file]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "request requires a non-empty questions object",
    );
  });

  test("requires explicit acknowledgement before a custom endpoint receives the key", async () => {
    const file = await requestFile();
    const result = await run([file, "--base-url", "http://127.0.0.1:9"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "custom --base-url requires --allow-custom-base-url",
    );
  });

  test("maps authentication and retryable failures to distinct exits", async () => {
    let status = 401;
    const server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({ error: "fixture" }, { status });
      },
    });
    try {
      const file = await requestFile();
      const common = [
        file,
        "--base-url",
        `http://127.0.0.1:${server.port}`,
        "--allow-custom-base-url",
      ];
      const auth = await run(common);
      expect(auth.exitCode).toBe(3);
      status = 429;
      const retryable = await run(common);
      expect(retryable.exitCode).toBe(4);
    } finally {
      server.stop(true);
    }
  });

  test("keeps help, unknown flags, prototype flags, and extra operands distinct", async () => {
    const help = await run(["--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("<request>");

    const unknown = await run(["request.json", "--unknown"]);
    expect(unknown.exitCode).toBe(1);

    const prototype = await run(["request.json", "--__proto__", "x"]);
    expect(prototype.exitCode).toBe(2);
    expect(prototype.stderr).toContain("__proto__");

    const extra = await run(["one.json", "two.json"]);
    expect(extra.exitCode).toBe(2);
    expect(extra.stderr).toContain("exactly one request path");
  });

  test("never accepts an API key on argv", async () => {
    const result = await run(["request.json", "--api-key", "secret"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toContain("secret");
  });
});
