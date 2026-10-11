import { typeFlag } from "type-flag";
import { attempt, errorMessage } from "../../hooks/attempt.ts";

const MOUSE_MODES = new Set([
  9, 1000, 1001, 1002, 1003, 1005, 1006, 1015, 1016,
]);
const MAX_PENDING = 4096;

/** Streaming, byte-preserving CSI filter. Only DECSET mouse-tracking parameters are removed. */
export class MouseModeFilter {
  #state: "ground" | "escape" | "csi" | "string" | "string-escape" = "ground";
  #stringKind: "osc" | "control-string" = "control-string";
  #pending: number[] = [];

  write(input: Uint8Array): Uint8Array {
    const output: number[] = [];
    for (const byte of input) this.#consume(byte, output);
    return new Uint8Array(output);
  }

  flush(): Uint8Array {
    const remainder = new Uint8Array(this.#pending);
    this.#pending = [];
    this.#state = "ground";
    return remainder;
  }

  get pendingBytes(): number {
    return this.#pending.length;
  }

  #consume(byte: number, output: number[]): void {
    if (this.#state === "ground") {
      if (byte === 0x1b) {
        this.#state = "escape";
        this.#pending = [byte];
      } else output.push(byte);
      return;
    }

    if (this.#state === "escape") {
      this.#pending.push(byte);
      if (byte === 0x5b) this.#state = "csi";
      else if ([0x5d, 0x50, 0x5e, 0x5f].includes(byte)) {
        output.push(...this.#pending);
        this.#pending = [];
        this.#stringKind = byte === 0x5d ? "osc" : "control-string";
        this.#state = "string";
      } else {
        output.push(...this.#pending);
        this.#pending = [];
        this.#state = "ground";
      }
      return;
    }

    if (this.#state === "string") {
      output.push(byte);
      if (byte === 0x07 && this.#stringKind === "osc") this.#state = "ground";
      else if (byte === 0x1b) this.#state = "string-escape";
      return;
    }

    if (this.#state === "string-escape") {
      output.push(byte);
      if (byte === 0x5c) this.#state = "ground";
      else if (byte !== 0x1b) this.#state = "string";
      return;
    }

    this.#consumeCsi(byte, output);
  }

  #consumeCsi(byte: number, output: number[]): void {
    this.#pending.push(byte);
    if (this.#pending.length > MAX_PENDING) {
      output.push(...this.#pending);
      this.#pending = [];
      this.#state = "ground";
      return;
    }
    if (byte < 0x40 || byte > 0x7e) return;
    output.push(...this.#filterCsi(new Uint8Array(this.#pending)));
    this.#pending = [];
    this.#state = "ground";
  }

  #filterCsi(sequence: Uint8Array): Uint8Array {
    if (
      sequence[0] !== 0x1b ||
      sequence[1] !== 0x5b ||
      sequence[2] !== 0x3f ||
      sequence.at(-1) !== 0x68
    )
      return sequence;
    const parameterBytes = sequence.subarray(3, -1);
    if (
      parameterBytes.some(
        (byte) => !(byte >= 0x30 && byte <= 0x39) && byte !== 0x3b,
      )
    )
      return sequence;
    const parameters = new TextDecoder().decode(parameterBytes);
    const retained = parameters
      .split(";")
      .filter((part) => !MOUSE_MODES.has(Number(part)));
    if (retained.length === 0) return new Uint8Array();
    return new TextEncoder().encode(`\u001B[?${retained.join(";")}h`);
  }
}

function writeOutput(bytes: Uint8Array): void {
  if (bytes.byteLength > 0) process.stdout.write(bytes);
}

async function run(command: string, args: string[]): Promise<number> {
  const filter = new MouseModeFilter();
  const previousRaw = process.stdin.isRaw ?? false;
  await using terminal = new Bun.Terminal({
    cols: process.stdout.columns ?? 80,
    rows: process.stdout.rows ?? 24,
    name: process.env.TERM ?? "xterm-256color",
    data: (_terminal, data) => {
      writeOutput(filter.write(data));
    },
  });
  let child: Bun.Subprocess | undefined;
  let pendingSignal: NodeJS.Signals | undefined;
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const stopChild = (signal: NodeJS.Signals): void => {
    if (child === undefined) {
      pendingSignal = signal;
      return;
    }
    const activeChild = child;
    activeChild.kill(signal);
    if (forceTimer !== undefined) clearTimeout(forceTimer);
    forceTimer = setTimeout(() => {
      activeChild.kill("SIGKILL");
    }, 1000);
  };
  const onResize = () => {
    const cols = process.stdout.columns ?? 80;
    const rows = process.stdout.rows ?? 24;
    terminal.resize(cols, rows);
    if (resizeTimer !== undefined) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      child?.kill("SIGWINCH");
    }, 100);
  };
  const onTerminate = (): void => {
    stopChild("SIGTERM");
  };
  const onHangup = (): void => {
    stopChild("SIGHUP");
  };
  const removeListeners = (): void => {
    process.off("SIGWINCH", onResize);
    process.off("SIGTERM", onTerminate);
    process.off("SIGHUP", onHangup);
  };
  process.on("SIGWINCH", onResize);
  process.on("SIGTERM", onTerminate);
  process.on("SIGHUP", onHangup);
  const rawMode = await attempt(() => process.stdin.setRawMode(true));
  if (!rawMode.ok) {
    removeListeners();
    process.stderr.write(
      `codex-mouse-bridge: could not enter raw input mode: ${errorMessage(rawMode.error)}\n`,
    );
    return 1;
  }
  const readerResult = await attempt(() => Bun.stdin.stream().getReader());
  if (!readerResult.ok) {
    const restored = await attempt(() => process.stdin.setRawMode(previousRaw));
    removeListeners();
    process.stderr.write(
      `codex-mouse-bridge: could not read terminal input: ${errorMessage(readerResult.error)}\n`,
    );
    if (!restored.ok)
      process.stderr.write(
        `codex-mouse-bridge: could not restore input mode: ${errorMessage(restored.error)}\n`,
      );
    return 1;
  }
  const reader = readerResult.value;
  // bounded: foreground Codex TUI; the user exits it interactively.
  const spawned = await attempt(() =>
    Bun.spawn([command, ...args], {
      env: process.env,
      cwd: process.cwd(),
      terminal,
    }),
  );
  if (!spawned.ok) {
    await attempt(() => reader.cancel());
    const restored = await attempt(() => process.stdin.setRawMode(previousRaw));
    removeListeners();
    process.stderr.write(
      `codex-mouse-bridge: could not start Codex: ${errorMessage(spawned.error)}\n`,
    );
    if (!restored.ok)
      process.stderr.write(
        `codex-mouse-bridge: could not restore input mode: ${errorMessage(restored.error)}\n`,
      );
    return 1;
  }
  const activeChild = spawned.value;
  child = activeChild;
  if (pendingSignal !== undefined) stopChild(pendingSignal);
  const lifecycle = await attempt(async () => {
    const pumpInput = async (): Promise<void> => {
      let next = await reader.read();
      while (!next.done) {
        terminal.write(next.value);
        next = await reader.read();
      }
      stopChild("SIGHUP");
    };
    const inputPump = pumpInput().then(
      () => ({ ok: true as const }),
      (error: unknown) => {
        stopChild("SIGTERM");
        return { ok: false as const, error };
      },
    );
    const code = await activeChild.exited;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
    await attempt(() => reader.cancel());
    const input = await inputPump;
    if (!input.ok) {
      process.stderr.write(
        `codex-mouse-bridge: terminal input failed: ${errorMessage(input.error)}\n`,
      );
      return 1;
    }
    return code ?? 1;
  });
  if (!lifecycle.ok && activeChild.exitCode === null) {
    activeChild.kill("SIGKILL");
    await attempt(() => activeChild.exited);
  }
  await attempt(() => reader.cancel());
  if (forceTimer !== undefined) clearTimeout(forceTimer);
  if (resizeTimer !== undefined) clearTimeout(resizeTimer);
  process.off("SIGWINCH", onResize);
  process.off("SIGTERM", onTerminate);
  process.off("SIGHUP", onHangup);
  const restored = await attempt(() => process.stdin.setRawMode(previousRaw));
  writeOutput(filter.flush());
  if (!restored.ok) {
    process.stderr.write(
      `codex-mouse-bridge: could not restore terminal input mode: ${errorMessage(restored.error)}\n`,
    );
    return 1;
  }
  if (!lifecycle.ok) {
    process.stderr.write(
      `codex-mouse-bridge: terminal session failed: ${errorMessage(lifecycle.error)}\n`,
    );
    return 1;
  }
  return lifecycle.value;
}

async function main(): Promise<void> {
  // argv-forwarding: codex
  const args = Bun.argv.slice(2);
  const parsed = typeFlag({}, [...args], {
    ignore: (kind) => kind === "unknown-flag",
  });
  if (
    Object.getPrototypeOf(parsed.unknownFlags) !== Object.prototype ||
    Object.keys(parsed.unknownFlags).length > 0
  ) {
    process.stderr.write("type-flag forwarding invariant violated\n");
    process.exitCode = 1;
    return;
  }
  const command = args[0] ?? Bun.which("codex");
  const childArgs = args.slice(args[0] === undefined ? 0 : 1);
  if (command === undefined || command === null || command.length === 0) {
    process.stderr.write(
      "codex-mouse-bridge: codex executable was not found on PATH\n",
    );
    process.exitCode = 127;
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    // bounded: exact non-TTY passthrough ends with the downstream command.
    const child = Bun.spawn([command, ...childArgs], {
      env: process.env,
      cwd: process.cwd(),
      stdio: ["inherit", "inherit", "inherit"],
    });
    const code = await child.exited;
    process.exitCode = code ?? 1;
    return;
  }
  process.exitCode = await run(command, childArgs);
}

if (import.meta.main) await main();
