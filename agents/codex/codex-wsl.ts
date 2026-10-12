#!/usr/bin/env bun
// argv-forwarding: Windows desktop Codex; no wrapper-owned flags.
import { join } from "node:path";
import {
  hasExplicitWorkingDirectory,
  resolveDesktopRuntime,
  windowsArguments,
  windowsPath,
} from "./runtime.ts";

export const MAX_CONPTY_CONFIG_BYTES = 24 * 1024;
export const MAX_CONPTY_INPUT_BYTES = 64 * 1024;

type TerminalSize = { cols: number; rows: number };
type LaunchConfig = {
  executable: string;
  args: string[];
  cwd: string;
  codeXHome: string;
  cols: number;
  rows: number;
};

async function terminalSize(): Promise<TerminalSize> {
  const signal = AbortSignal.timeout(1_000);
  const size = Bun.spawn(["stty", "size"], {
    stdin: "inherit",
    stdout: "pipe",
    stderr: "ignore",
    signal,
  });
  const [stdout, code] = await Promise.all([
    new Response(size.stdout).text(),
    size.exited,
  ]);
  const values = stdout.trim().split(/\s+/u).map(Number);
  const rows = values[0] ?? 0;
  const cols = values[1] ?? 0;
  return {
    cols:
      !signal.aborted && code === 0 && Number.isSafeInteger(cols) && cols > 0
        ? cols
        : 80,
    rows:
      !signal.aborted && code === 0 && Number.isSafeInteger(rows) && rows > 0
        ? rows
        : 24,
  };
}

export function shouldUseConpty(
  stdinIsTTY = process.stdin.isTTY,
  stdoutIsTTY = process.stdout.isTTY,
  forwarded: readonly string[] = [],
): boolean {
  const first = forwarded[0];
  const direct =
    first === "exec" ||
    first === "app-server" ||
    first === "--version" ||
    first === "version" ||
    first === "--help" ||
    first === "-h";
  return stdinIsTTY && stdoutIsTTY && !direct;
}

export function conptyConfigArgument(config: LaunchConfig): string | undefined {
  const encoded = Buffer.from(JSON.stringify(config), "utf8").toString(
    "base64",
  );
  if (encoded.length > MAX_CONPTY_CONFIG_BYTES) return undefined;
  return encoded;
}

/** WSL only forwards named variables to Windows interop through WSLENV. */
export function conptyEnvironment(
  env: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  const entries = (env.WSLENV ?? "").split(":").filter((entry) => entry !== "");
  if (!entries.some((entry) => entry.split("/", 1)[0] === "TERM"))
    entries.push("TERM");
  // The Windows client is attached to a VT ConPTY, not the inherited Linux
  // terminal. In particular, Herdr's headless bridge truthfully sets its own
  // Linux side to TERM=dumb, which would make Codex reject the ConPTY TUI.
  return { ...env, TERM: "xterm-256color", WSLENV: entries.join(":") };
}

function controlFrame(frame: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(frame)}\n`);
}

function writeFrame(
  writer: Bun.FileSink,
  frame: Record<string, unknown>,
): void {
  void writer.write(controlFrame(frame));
  void writer.flush();
}

async function relayInput(writer: Bun.FileSink): Promise<void> {
  for await (const chunk of process.stdin) {
    const bytes = new Uint8Array(chunk);
    for (let start = 0; start < bytes.length; start += MAX_CONPTY_INPUT_BYTES) {
      const part = bytes.subarray(start, start + MAX_CONPTY_INPUT_BYTES);
      writeFrame(writer, {
        type: "input",
        data: Buffer.from(part).toString("base64"),
      });
    }
  }
}

export async function desktopArguments(
  executable: string,
  cwd: string,
  forwarded: readonly string[],
  translate: (path: string) => string | Promise<string> = windowsPath,
): Promise<string[]> {
  return [
    executable,
    ...(hasExplicitWorkingDirectory(forwarded)
      ? []
      : ["-C", await translate(cwd)]),
    ...(await windowsArguments(forwarded, translate)),
  ];
}

async function main(): Promise<void> {
  const runtime = await resolveDesktopRuntime(join(import.meta.dir, "../.."));
  const forwarded = Bun.argv.slice(2);
  const args = await desktopArguments(
    runtime.executable,
    process.cwd(),
    forwarded,
  );
  const codeXHome = await windowsPath(join(runtime.home, ".codex"));
  if (!shouldUseConpty(process.stdin.isTTY, process.stdout.isTTY, forwarded)) {
    const child = Bun.spawn(args, {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, CODEX_HOME: codeXHome },
    });
    const interrupt = () => {
      child.kill("SIGINT");
    };
    const terminate = () => {
      child.kill("SIGTERM");
    };
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    const exit = await child.exited.finally(() => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    });
    process.exit(exit);
  }
  const bridge = join(runtime.home, ".codex/runtime/conpty/codex-conpty.exe");
  if (!(await Bun.file(bridge).exists())) {
    process.stderr.write(
      `codex: interactive Windows ConPTY bridge is missing: ${bridge}; run bun ~/dotfiles/agents/codex/codex-runtime.ts deploy\n`,
    );
    process.exit(2);
  }
  const cwd = await windowsPath(process.cwd());
  const size = await terminalSize();
  const config = conptyConfigArgument({
    executable: await windowsPath(args[0] ?? runtime.executable),
    args: args.slice(1),
    cwd,
    codeXHome,
    cols: size.cols,
    rows: size.rows,
  });
  if (config === undefined) {
    process.stderr.write("codex: ConPTY launch configuration exceeds 24 KiB\n");
    process.exit(2);
  }
  const child = Bun.spawn([bridge, config], {
    stdin: "pipe",
    stdout: "inherit",
    stderr: "inherit",
    // bounded: foreground ConPTY bridge; the terminal owns its lifetime.
    env: conptyEnvironment(),
  });
  const writer = child.stdin;
  const wasRaw = process.stdin.isRaw;
  if (process.stdin.isTTY && !wasRaw) process.stdin.setRawMode(true);
  const restoreRawMode = () => {
    if (process.stdin.isTTY && !wasRaw) process.stdin.setRawMode(false);
  };
  const sendResize = async () => {
    const next = await terminalSize();
    writeFrame(writer, { type: "resize", ...next });
  };
  process.on("SIGWINCH", () => {
    void sendResize().catch(() => null);
  });
  process.on("SIGINT", () => {
    void Promise.resolve()
      .then(() => {
        writeFrame(writer, { type: "interrupt" });
      })
      .catch(() => null);
  });
  process.on("SIGTERM", () => {
    void Promise.resolve()
      .then(() => {
        writeFrame(writer, { type: "terminate" });
      })
      .catch(() => null);
  });
  void relayInput(writer).then(
    () => {
      void writer.end();
    },
    (error: unknown) => {
      process.stderr.write(
        `codex: ConPTY input relay failed: ${String(error)}\n`,
      );
      void Promise.resolve()
        .then(() => {
          writeFrame(writer, { type: "terminate" });
        })
        .catch(() => null);
      void writer.end();
    },
  );
  const exit = await child.exited.finally(() => {
    restoreRawMode();
    void writer.end();
  });
  process.exit(exit);
}

if (import.meta.main) await main();
