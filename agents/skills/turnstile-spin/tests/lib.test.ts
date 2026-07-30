/**
 * Characterization tests for agents/skills/turnstile-spin/scripts/lib.ts.
 *
 * These pin CURRENT behavior of `command()`, `output()`, and `diagnostic()`
 * as a bracket for a later refactor (G2: oracle-first characterization).
 * Fixtures are harmless: /bin/true, /bin/false, /bin/echo, /bin/pwd, `cat`,
 * and tiny `bun -e` one-liners — never wrangler/degit/network calls.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  command,
  diagnostic,
  nonEmptyString,
  output,
  rejectUnexpectedArguments,
  rejectUnknownFlag,
} from "../scripts/lib.ts";

const BUN_BIN = process.execPath;

describe("argv guards", () => {
  test("rejectUnknownFlag throws before an unknown name reaches unknownFlags", () => {
    expect(() => rejectUnknownFlag("unknown-flag", "__proto__")).toThrow(
      "unknown option '--__proto__'",
    );
    expect(() => rejectUnknownFlag("known-flag", "path")).not.toThrow();
    expect(() => rejectUnknownFlag("argument", "value")).not.toThrow();
  });

  test("rejectUnexpectedArguments detects a prototype-mutated unknownFlags table", () => {
    const poisoned: Record<string, (string | boolean)[]> = {};
    Object.setPrototypeOf(poisoned, ["__proto__"]);
    expect(Object.keys(poisoned)).toEqual([]);
    expect(() => rejectUnexpectedArguments(poisoned, [])).toThrow(
      "unknown option '--__proto__'",
    );
  });

  test("nonEmptyString rejects both missing and empty option values", () => {
    expect(() => nonEmptyString(undefined)).toThrow("option value required");
    expect(() => nonEmptyString("")).toThrow("option value required");
    expect(nonEmptyString("value")).toBe("value");
  });
});

describe("command()", () => {
  test("captures stdout and reports exit code 0 on success", async () => {
    const result = await command(["/bin/echo", "hello"]);
    expect(result).toEqual({ exitCode: 0, output: "hello\n" });
  });

  test("propagates a non-zero exit code from the child", async () => {
    const result = await command(["/bin/false"]);
    expect(result).toEqual({ exitCode: 1, output: "" });
  });

  test("propagates the child's exact exit code, not just pass/fail", async () => {
    const result = await command([BUN_BIN, "-e", "process.exit(3)"]);
    expect(result.exitCode).toBe(3);
    expect(result.output).toBe("");
  });

  test("returns an empty output string when both streams are empty", async () => {
    const result = await command(["/bin/true"]);
    expect(result).toEqual({ exitCode: 0, output: "" });
  });

  test("merges stdout and stderr into one string, stdout-then-stderr regardless of write order", async () => {
    // The child writes stderr FIRST, stdout SECOND — if `output` merged
    // chronologically this would read "ERR\nOUT\n". It does not: lib.ts
    // builds `output` as `${stdout}${stderr}` (two fully-buffered streams
    // concatenated in that fixed order), so it reads "OUT\nERR\n".
    const script =
      'process.stderr.write("ERR\\n"); process.stdout.write("OUT\\n");';
    const result = await command([BUN_BIN, "-e", script]);
    expect(result).toEqual({ exitCode: 0, output: "OUT\nERR\n" });
  });

  test("the returned promise resolves to exactly {exitCode, output}", async () => {
    const result = await command(["/bin/echo", "x"]);
    expect(Object.keys(result).sort()).toEqual(["exitCode", "output"]);
    expect(typeof result.exitCode).toBe("number");
    expect(typeof result.output).toBe("string");
  });

  test("without a stdin argument, the child's stdin is ignored (immediate EOF, no hang)", async () => {
    // `cat` with no piped stdin and stdio "ignore" reads EOF immediately
    // instead of blocking on a terminal-like stdin.
    const result = await command(["cat"]);
    expect(result).toEqual({ exitCode: 0, output: "" });
  });

  test("a provided stdin string is written to the child and the child sees it", async () => {
    const result = await command(["cat"], undefined, "hello-stdin\n");
    expect(result).toEqual({ exitCode: 0, output: "hello-stdin\n" });
  });

  test("an empty-string stdin is still piped (not treated as `undefined`)", async () => {
    // stdin is compared with `=== undefined`, so "" still takes the "pipe"
    // branch (unlike requiredEnv/requiredValue elsewhere in lib.ts, which
    // treat "" as absent). Pin that distinction here.
    const result = await command(["cat"], undefined, "");
    expect(result).toEqual({ exitCode: 0, output: "" });
  });

  test("cwd is passed through to the child process", async () => {
    const dir = await mkdtemp(join(tmpdir(), "turnstile-lib-test-"));
    try {
      const resolvedDir = await realpath(dir);
      const result = await command(["/bin/pwd"], dir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe(`${resolvedDir}\n`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("without cwd, the child inherits the caller's working directory", async () => {
    const result = await command(["/bin/pwd"]);
    const resolvedCwd = await realpath(process.cwd());
    expect(result).toEqual({ exitCode: 0, output: `${resolvedCwd}\n` });
  });
});

describe("output()", () => {
  function captureStdout(fn: () => void): string[] {
    const original = process.stdout.write.bind(process.stdout);
    const chunks: string[] = [];
    // biome-ignore lint: intentional monkeypatch for characterization
    (process.stdout as any).write = (chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    };
    try {
      fn();
    } finally {
      process.stdout.write = original;
    }
    return chunks;
  }

  function captureStderr(fn: () => void): string[] {
    const original = process.stderr.write.bind(process.stderr);
    const chunks: string[] = [];
    // biome-ignore lint: intentional monkeypatch for characterization
    (process.stderr as any).write = (chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    };
    try {
      fn();
    } finally {
      process.stderr.write = original;
    }
    return chunks;
  }

  test("writes a single JSON.stringify'd line, newline-terminated, to stdout only", () => {
    const stderrChunks = captureStderr(() => {
      const stdoutChunks = captureStdout(() => {
        output({ ok: true, n: 1, list: [1, 2, 3] });
      });
      expect(stdoutChunks).toEqual([
        `${JSON.stringify({ ok: true, n: 1, list: [1, 2, 3] })}\n`,
      ]);
    });
    expect(stderrChunks).toEqual([]);
  });

  test("writes exactly one call to stdout.write per invocation (single line, not pre-split)", () => {
    const chunks = captureStdout(() => {
      output("plain-string-value");
    });
    expect(chunks).toEqual([`${JSON.stringify("plain-string-value")}\n`]);
    expect(chunks.length).toBe(1);
  });
});

describe("diagnostic()", () => {
  function captureStdout(fn: () => void): string[] {
    const original = process.stdout.write.bind(process.stdout);
    const chunks: string[] = [];
    // biome-ignore lint: intentional monkeypatch for characterization
    (process.stdout as any).write = (chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    };
    try {
      fn();
    } finally {
      process.stdout.write = original;
    }
    return chunks;
  }

  function captureStderr(fn: () => void): string[] {
    const original = process.stderr.write.bind(process.stderr);
    const chunks: string[] = [];
    // biome-ignore lint: intentional monkeypatch for characterization
    (process.stderr as any).write = (chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    };
    try {
      fn();
    } finally {
      process.stderr.write = original;
    }
    return chunks;
  }

  test("writes the raw message plus a trailing newline to stderr only (no JSON encoding)", () => {
    const stdoutChunks = captureStdout(() => {
      const stderrChunks = captureStderr(() => {
        diagnostic("plain diagnostic text");
      });
      expect(stderrChunks).toEqual(["plain diagnostic text\n"]);
    });
    expect(stdoutChunks).toEqual([]);
  });
});
