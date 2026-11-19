import { describe, expect, test } from "bun:test";
import {
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
  // The hook's only clipboard route is $DOTFILES/zsh/copy-to-clipboard.sh. The default stand-in
  // fails the way the real script does when no terminal is reachable.
  const clipScript = join(home, "dotfiles", "zsh", "copy-to-clipboard.sh");
  if (!existsSync(clipScript)) {
    mkdirSync(join(home, "dotfiles", "zsh"), { recursive: true });
    writeFileSync(
      clipScript,
      `cat > /dev/null\necho "copy-to-clipboard: no terminal reachable for OSC 52 (tried /dev/tty)" >&2\nexit 1\n`,
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
      DOTFILES: join(home, "dotfiles"),
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

// A stand-in clipboard script that records what it was given and whether it was told to be quiet.
function capturingClipboard(home: string): void {
  mkdirSync(join(home, "dotfiles", "zsh"), { recursive: true });
  writeFileSync(
    join(home, "dotfiles", "zsh", "copy-to-clipboard.sh"),
    `cat > "${home}/clipboard.txt"\nprintf "%s" "$COPY_TO_CLIPBOARD_QUIET" > "${home}/clipboard.quiet"\n`,
  );
}

describe("quote-command: output mode follows the requested count", () => {
  test("50 requests the clipboard path", () => {
    const { home, result, output } = runQuote(50, 51);
    expect(result.code).toBe(0);
    expect(output.decision).toBe("block");
    expect(output.reason).toContain("Could not copy this quote");
    expect(output.reason).toContain("no terminal reachable for OSC 52");
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

  test("the download command goes through the one clipboard script", () => {
    const { home, output } = runQuote(51, 1, {}, capturingClipboard);
    expect(output.reason).toContain("Download command copied");
    // The block message carries the same header the quote starts with.
    expect(output.reason).toMatch(
      /for from \S+ \| \d{2}-\d{2} \d{2}:\d{2}[+-]\d{2}(?:\d{2})? \| turns: \d+ \| \d+B \| [^\s@|]+@[^\s@|.]+/u,
    );
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

  test("a quote of 1-50 turns is piped to the clipboard script, quietly", () => {
    const { home, output } = runQuote(1, 1, {}, capturingClipboard);
    expect(output.reason).toContain(
      "Copied to clipboard — from quote-test-session",
    );
    const copied = readFileSync(join(home, "clipboard.txt"), "utf8");
    expect(copied).toMatch(/^from quote-test-session \| /u);
    expect(copied).toContain("response 1");
    expect(readFileSync(join(home, "clipboard.quiet"), "utf8")).toBe("1");
  });

  test("a failed copy says why and prints the quote for hand-copying", () => {
    const { output } = runQuote(1, 1);
    expect(output.reason).toContain(
      "Could not copy this quote: copy-to-clipboard: no terminal reachable",
    );
    expect(output.reason).toContain("Select this to copy it by hand");
    expect(output.reason).toContain("response 1");
  });
});
