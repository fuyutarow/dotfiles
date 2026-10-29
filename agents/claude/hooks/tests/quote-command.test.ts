import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { z } from "../../../hooks/zod.ts";
import { parseJson } from "../../../hooks/narrow.ts";
import { runHook, tempHome } from "./helpers.ts";
import { decoded } from "../../../hooks/tests/decode.ts";

const Output = z.object({ decision: z.string(), reason: z.string() });

function runQuote(
  count: number,
  turnCount: number,
  env: Record<string, string> = {},
  prepareHome?: (home: string) => void,
) {
  const home = tempHome();
  prepareHome?.(home);
  const hooks = join(home, ".claude", "hooks");
  mkdirSync(hooks, { recursive: true });
  const herdrHelper = join(hooks, "copy-via-herdr-pane.ts");
  if (!existsSync(herdrHelper)) {
    writeFileSync(
      herdrHelper,
      `console.error("HERDR_ENV is not 1; this hook is not running in a Herdr pane");\nprocess.exit(3);\n`,
    );
  }
  const session = "quote-test-session";
  const historyDir = join(home, ".cache", "claude", "last-response");
  mkdirSync(historyDir, { recursive: true });
  const turns = Array.from(
    { length: turnCount },
    (_, i) => `response ${i + 1}`,
  );
  writeFileSync(
    join(historyDir, `${session}.jsonl`),
    `${turns.map((text) => JSON.stringify({ text })).join("\n")}\n`,
  );
  const result = runHook(
    "quote-command.ts",
    { session_id: session, cwd: home, command_args: String(count) },
    {
      HOME: home,
      HERDR_ENV: "",
      SSH_CONNECTION: "100.81.222.57 50000 100.110.117.86 2222",
      ...env,
    },
  );
  return {
    home,
    turns,
    result,
    output: decoded(Output, parseJson(result.stdout)),
  };
}

describe("quote-command: output mode follows the requested count", () => {
  test("50 requests the clipboard path", () => {
    const { home, result, output } = runQuote(50, 51);
    expect(result.code).toBe(0);
    expect(output.decision).toBe("block");
    expect(output.reason).toContain("Could not copy this quote");
    expect(output.reason).toContain("Herdr pane:");
    expect(output.reason).toContain("SSH OSC 52:");
    expect(output.reason).toContain("response 2");
    expect(output.reason).not.toContain("response 1\n");
    expect(readdirSync(join(home, ".cache", "claude"))).not.toContain(
      "quote-exports",
    );
  });

  test("51 saves the selected turns to a text file", () => {
    const { result, output } = runQuote(51, 51);
    expect(result.code).toBe(0);
    expect(output.decision).toBe("block");
    const file = output.reason.match(/ at (\/\S+\.txt)\./u)?.[1];
    expect(file).toBeDefined();
    const text = readFileSync(file ?? "", "utf8");
    // Head: from <name> | MM-DD HH:MM | turns: N | <bytes>B | <user>@<host> — no cwd.
    expect(text.split("\n")[0]).toMatch(
      /^from quote-test-session \| \d{2}-\d{2} \d{2}:\d{2}[+-]\d{2}(?:\d{2})? \| turns: 51 \| \d+B \| [^\s@|]+@[^\s@|]+$/u,
    );
    expect(text).toContain("turns: 51");
    expect(text).toContain("response 1");
    expect(text).toContain("response 51");
    expect(output.reason).toContain("scp -P 2222");
    expect(output.reason).toContain(`${userInfo().username}@100.110.117.86:`);
    expect(output.reason).toContain("in a local terminal");
  });

  test("51 saves a file even when only one turn has been captured", () => {
    const { result, output } = runQuote(51, 1);
    expect(result.code).toBe(0);
    expect(output.reason).toContain("only 1 turn captured so far");
    expect(output.reason).toContain("/quote-exports/");
  });

  test("an explicit SSH alias works without inherited SSH connection metadata", () => {
    const { output } = runQuote(51, 1, {
      SSH_CONNECTION: "",
      QUOTE_DOWNLOAD_SSH_TARGET: "workbox",
    });
    expect(output.reason).toContain("scp 'workbox:");
  });

  test("the download command uses the existing Herdr clipboard helper", () => {
    const { home, output } = runQuote(51, 1, {}, (testHome) => {
      const hooks = join(testHome, ".claude", "hooks");
      mkdirSync(hooks, { recursive: true });
      writeFileSync(
        join(hooks, "copy-via-herdr-pane.ts"),
        `import { readFileSync, writeFileSync } from "node:fs";\n` +
          `writeFileSync(${JSON.stringify(join(testHome, "clipboard.txt"))}, readFileSync(process.env.COPY_PAYLOAD_FILE!, "utf8"));\n` +
          `console.log("pane-test");\n`,
      );
    });
    expect(output.reason).toContain("Download command copied");
    // The block message carries the same header the quote starts with.
    expect(output.reason).toMatch(
      /for from \S+ \| \d{2}-\d{2} \d{2}:\d{2}[+-]\d{2}(?:\d{2})? \| turns: \d+ \| \d+B \| [^\s@|]+@[^\s@|.]+/u,
    );
    expect(output.reason).toContain("[pane-test]");
    const copied = readFileSync(join(home, "clipboard.txt"), "utf8");
    expect(copied).toMatch(/^scp -P 2222 /u);
    expect(copied).toContain("@100.110.117.86:");
    expect(copied).not.toContain("response 1");
  });

  test("missing SSH metadata never claims a local download happened", () => {
    const { output } = runQuote(51, 1, { SSH_CONNECTION: "" });
    expect(output.reason).toContain("No SSH download target is available");
    expect(output.reason).not.toContain("Download command copied");
  });

  test("SSH_TTY receives OSC 52 when the Herdr route is unavailable", () => {
    const { output } = runQuote(1, 1, { SSH_TTY: "/dev/null" });
    expect(output.reason).toContain("Copied to clipboard via SSH OSC 52");
  });

  test("the hand-copy message states why each available route failed", () => {
    const { output } = runQuote(1, 1, { SSH_TTY: "" });
    expect(output.reason).toContain("Herdr pane:");
    expect(output.reason).toContain("HERDR_ENV is not 1");
    expect(output.reason).toContain("SSH OSC 52:");
    expect(output.reason).toContain("SSH_TTY is not set");
    expect(output.reason).toContain("Select this to copy it by hand");
  });

  test("a local macOS hook child falls back to pbcopy", () => {
    if (process.platform !== "darwin") return;
    const home = tempHome();
    const bin = join(home, "bin");
    const captured = join(home, "pbcopy-input.txt");
    mkdirSync(bin);
    const pbcopy = join(bin, "pbcopy");
    writeFileSync(pbcopy, `#!/bin/sh\ncat > "$QUOTE_TEST_PBCOPY_CAPTURE"\n`);
    chmodSync(pbcopy, 0o755);
    const session = "quote-test-session";
    const historyDir = join(home, ".cache", "claude", "last-response");
    mkdirSync(historyDir, { recursive: true });
    writeFileSync(
      join(historyDir, `${session}.jsonl`),
      `${JSON.stringify({ text: "macOS clipboard quote" })}\n`,
    );
    const result = runHook(
      "quote-command.ts",
      { session_id: session, cwd: home, command_args: "1" },
      {
        HOME: home,
        HERDR_ENV: "",
        SSH_CONNECTION: "",
        SSH_TTY: "",
        PATH: `${bin}:${process.env["PATH"] ?? ""}`,
        QUOTE_TEST_PBCOPY_CAPTURE: captured,
      },
    );
    const output = decoded(Output, parseJson(result.stdout));
    expect(result.code).toBe(0);
    expect(output.reason).toContain("Copied to clipboard via pbcopy");
    expect(readFileSync(captured, "utf8")).toContain("macOS clipboard quote");
  });
});
