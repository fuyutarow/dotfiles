import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "../../hooks/zod.ts";

const dotfiles = join(import.meta.dir, "..", "..", "..");
const temporaryHomes: string[] = [];
const thread = "11111111-2222-4333-8444-555555555555";
const turnOne = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const turnTwo = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

afterEach(() => {
  for (const path of temporaryHomes.splice(0))
    rmSync(path, { recursive: true, force: true });
});

function record(type: string, payload: unknown): string {
  return JSON.stringify({ type, payload });
}

function message(
  id: string,
  turn: string,
  phase: string,
  text: string,
): string {
  return record("response_item", {
    type: "message",
    id,
    role: "assistant",
    phase,
    content: [{ type: "output_text", text }],
    internal_chat_message_metadata_passthrough: { turn_id: turn },
  });
}

function fixture(): {
  home: string;
  rollout: string;
  capture: string;
  bin: string;
  temporary: string;
} {
  const home = mkdtempSync(join(tmpdir(), "codex-quote-test-"));
  temporaryHomes.push(home);
  const sessions = join(home, "codex", "sessions", "2026", "10", "11");
  const bin = join(home, "bin");
  const temporary = join(home, "tmp");
  mkdirSync(sessions, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(temporary, { recursive: true });
  const rollout = join(sessions, `rollout-2026-10-11T10-00-00-${thread}.jsonl`);
  const capture = join(home, "clipboard.txt");
  writeFileSync(join(bin, "uname"), "#!/bin/sh\nprintf 'Darwin\\n'\n");
  writeFileSync(
    join(bin, "pbcopy"),
    '#!/bin/sh\ncat > "$QUOTE_TEST_CAPTURE"\n',
  );
  chmodSync(join(bin, "uname"), 0o755);
  chmodSync(join(bin, "pbcopy"), 0o755);
  const rows = [
    record("session_meta", { session_id: thread, id: thread }),
    message("msg-1", turnOne, "final_answer", "completed reply one"),
    record("event_msg", {
      type: "task_complete",
      thread_id: thread,
      turn_id: turnOne,
    }),
    message(
      "msg-2-commentary",
      turnTwo,
      "commentary",
      "intermediate commentary",
    ),
    message(
      "msg-2-draft",
      turnTwo,
      "final_answer",
      "blocked or unfinished draft",
    ),
    record("response_item", {
      type: "custom_tool_call_output",
      output: "tool output must stay out",
    }),
    message("msg-2-final", turnTwo, "final_answer", "completed reply two"),
    record("event_msg", {
      type: "task_complete",
      thread_id: thread,
      turn_id: turnTwo,
    }),
  ];
  writeFileSync(rollout, `${rows.join("\n")}\n`);
  return { home, rollout, capture, bin, temporary };
}

function run(args: string[], extraEnv: Record<string, string> = {}) {
  const f = fixture();
  const result = Bun.spawnSync(
    ["bun", join(import.meta.dir, "..", "hooks", "quote-command.ts"), ...args],
    {
      cwd: f.home,
      env: {
        ...process.env,
        HOME: f.home,
        CODEX_HOME: join(f.home, "codex"),
        DOTFILES: dotfiles,
        PATH: `${f.bin}:${process.env.PATH ?? ""}`,
        QUOTE_TEST_CAPTURE: f.capture,
        TMPDIR: f.temporary,
        SSH_CONNECTION: "",
        SSH_TTY: "",
        HERDR_ENV: "",
        ...extraEnv,
      },
    },
  );
  return {
    ...f,
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("Codex quote adapter", () => {
  test("quote prompt keeps valid shared frontmatter for the Claude hook", () => {
    const prompt = readFileSync(
      join(import.meta.dir, "..", "..", "commands", "quote.md"),
      "utf8",
    );
    expect(prompt.startsWith("---\n")).toBe(true);
    const closing = prompt.indexOf("\n---\n", 4);
    expect(closing).toBeGreaterThan(4);
    const metadata = z
      .object({
        description: z.string(),
        "argument-hint": z.string(),
        "disable-model-invocation": z.boolean(),
      })
      .safeParse(parse(prompt.slice(4, closing)));
    expect(metadata.success).toBe(true);
    if (metadata.success) {
      expect(metadata.data.description).toContain(
        "Quote this session's recent responses",
      );
      expect(metadata.data["argument-hint"]).toContain("default 1");
      expect(metadata.data["disable-model-invocation"]).toBe(true);
    }
  });

  test("deployed symlink resolves the repository clipboard route without DOTFILES", () => {
    const f = fixture();
    const codex = join(f.home, ".codex");
    mkdirSync(codex, { recursive: true });
    symlinkSync(
      join(import.meta.dir, "..", "hooks"),
      join(codex, "hooks"),
      "dir",
    );
    const result = Bun.spawnSync(
      ["bun", join(codex, "hooks", "quote-command.ts"), "--thread", thread],
      {
        env: {
          ...process.env,
          HOME: f.home,
          CODEX_HOME: join(f.home, "codex"),
          DOTFILES: "",
          PATH: `${f.bin}:${process.env.PATH ?? ""}`,
          QUOTE_TEST_CAPTURE: f.capture,
          TMPDIR: f.temporary,
          SSH_CONNECTION: "",
          SSH_TTY: "",
          HERDR_ENV: "",
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(readFileSync(f.capture, "utf8")).toContain("completed reply two");
  });

  test("copies only completed final answers from the explicitly selected thread", () => {
    const result = run(["--thread", thread, "--count", "2"]);
    expect(result.code).toBe(0);
    const copied = readFileSync(result.capture, "utf8");
    expect(copied).toContain(`from codex:${thread} | `);
    expect(copied).toContain("| turns: 2 | ");
    expect(copied).toContain(
      "completed reply one\n\n---\n\ncompleted reply two",
    );
    expect(copied).not.toContain("commentary");
    expect(copied).not.toContain("unfinished draft");
    expect(copied).not.toContain("tool output");
    expect(result.stdout).toContain("Copied to clipboard");
    expect(result.stdout).not.toContain("completed reply");
  });

  test("defaults to one and rejects missing thread, malformed counts, and bounds", () => {
    const defaulted = run(["--thread", thread]);
    expect(defaulted.code).toBe(0);
    expect(readFileSync(defaulted.capture, "utf8")).toContain("| turns: 1 | ");
    expect(run([]).stderr).toContain("explicit Codex thread UUID is required");
    expect(run(["--thread", thread, "--count", "1.5"]).stderr).toContain(
      "whole number",
    );
    expect(run(["--thread", thread, "--count", "1025"]).stderr).toContain(
      "between 1 and 1024",
    );
    expect(
      run(["--thread", "99999999-2222-4333-8444-555555555555"]).stderr,
    ).toContain("no rollout found");
    const maximum = run(["--thread", thread, "--count", "1024"], {
      QUOTE_DOWNLOAD_SSH_TARGET: "workbox",
    });
    expect(maximum.code).toBe(0);
    expect(maximum.stdout).toContain("Download command copied");
  });

  test("50 replies still use the direct clipboard route", () => {
    const result = run(["--thread", thread, "--count", "50"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Copied to clipboard");
    expect(readFileSync(result.capture, "utf8")).toContain(
      "completed reply two",
    );
    expect(result.stdout).not.toContain("Download command");
  });

  test("rejects an exact thread filename collision instead of choosing a rollout", () => {
    const f = fixture();
    const other = join(f.home, "codex", "sessions", "2026", "10", "12");
    mkdirSync(other, { recursive: true });
    writeFileSync(
      join(other, `rollout-2026-10-12T10-00-00-${thread}.jsonl`),
      readFileSync(f.rollout),
    );
    const result = Bun.spawnSync(
      [
        "bun",
        join(import.meta.dir, "..", "hooks", "quote-command.ts"),
        "--thread",
        thread,
      ],
      {
        env: {
          ...process.env,
          HOME: f.home,
          CODEX_HOME: join(f.home, "codex"),
          DOTFILES: dotfiles,
        },
      },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain(
      "thread ID collision: 2 exact rollout filenames",
    );
  });

  test("missing clipboard route reports its cause and removes the temporary payload", () => {
    const f = fixture();
    const result = Bun.spawnSync(
      [
        "bun",
        join(import.meta.dir, "..", "hooks", "quote-command.ts"),
        "--thread",
        thread,
      ],
      {
        env: {
          ...process.env,
          HOME: f.home,
          CODEX_HOME: join(f.home, "codex"),
          DOTFILES: join(f.home, "missing-dotfiles"),
          TMPDIR: f.temporary,
          SSH_CONNECTION: "",
          SSH_TTY: "",
          HERDR_ENV: "",
        },
      },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("clipboard route is missing");
    expect(readdirSync(f.temporary)).toEqual([]);
  });

  test("51 replies save an export and copy only the scp command through fake pbcopy", () => {
    const f = fixture();
    const rows: string[] = [];
    for (let index = 0; index < 51; index++) {
      const turn = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      rows.push(
        message(`msg-${index}`, turn, "final_answer", `reply ${index + 1}`),
        record("event_msg", {
          type: "task_complete",
          thread_id: thread,
          turn_id: turn,
        }),
      );
    }
    writeFileSync(
      f.rollout,
      `${record("session_meta", { session_id: thread })}\n${rows.join("\n")}\n`,
    );
    const result = Bun.spawnSync(
      [
        "bun",
        join(import.meta.dir, "..", "hooks", "quote-command.ts"),
        "--thread",
        thread,
        "--count",
        "51",
      ],
      {
        env: {
          ...process.env,
          HOME: f.home,
          CODEX_HOME: join(f.home, "codex"),
          DOTFILES: dotfiles,
          PATH: `${f.bin}:${process.env.PATH ?? ""}`,
          QUOTE_TEST_CAPTURE: f.capture,
          SSH_CONNECTION: "",
          SSH_TTY: "",
          HERDR_ENV: "",
          QUOTE_DOWNLOAD_SSH_TARGET: "workbox",
        },
      },
    );
    expect(result.exitCode).toBe(0);
    const command = readFileSync(f.capture, "utf8");
    expect(command).toMatch(/^scp 'workbox:/u);
    expect(command).toContain("quote-exports");
    expect(command).not.toContain("reply 1\n");
  });
});
