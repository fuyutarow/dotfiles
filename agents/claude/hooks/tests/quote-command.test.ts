import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { parseJson } from "../../../hooks/narrow.ts";
import { runHook, tempHome } from "./helpers.ts";

const Output = z.object({ decision: z.string(), reason: z.string() });

function runQuote(
  count: number,
  turnCount: number,
  env: Record<string, string> = {},
  prepareHome?: (home: string) => void,
) {
  const home = tempHome();
  prepareHome?.(home);
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
  return { home, turns, result, output: Output.parse(parseJson(result.stdout)) };
}

describe("quote-command: output mode follows the requested count", () => {
  test("50 requests the clipboard path", () => {
    const { home, result, output } = runQuote(50, 51);
    expect(result.code).toBe(0);
    expect(output.decision).toBe("block");
    expect(output.reason).toContain("nothing was copied");
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
    const file = output.reason.match(/ at (\/\S+\.txt)\./)?.[1];
    expect(file).toBeDefined();
    const text = readFileSync(file ?? "", "utf8");
    // PS1-shaped head: from <name> | user@host:MM-DD HH:MM|~ | turns: N | <bytes>B
    expect(text.split("\n")[0]).toMatch(
      new RegExp(
        `^from quote-test-session \\| ${userInfo().username}@[^:|]+:\\d{2}-\\d{2} \\d{2}:\\d{2}\\|~ \\| turns: 51 \\| \\d+B$`,
      ),
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
    expect(output.reason).toContain("[pane-test]");
    const copied = readFileSync(join(home, "clipboard.txt"), "utf8");
    expect(copied).toMatch(/^scp -P 2222 /);
    expect(copied).toContain("@100.110.117.86:");
    expect(copied).not.toContain("response 1");
  });

  test("missing SSH metadata never claims a local download happened", () => {
    const { output } = runQuote(51, 1, { SSH_CONNECTION: "" });
    expect(output.reason).toContain("No SSH download target is available");
    expect(output.reason).not.toContain("Download command copied");
  });
});
