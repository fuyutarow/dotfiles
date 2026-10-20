import { createReadStream, type ReadStream } from "node:fs";

const ESC = "\u001B[";
export type LiveFrame = string | number;

export interface LiveOptions {
  intervalSeconds: number;
  frame: () => Promise<LiveFrame>;
}

type FrameResult =
  | { kind: "frame"; body: LiveFrame }
  | { kind: "error" }
  | { kind: "cancelled" };

function collectFrame(frame: () => Promise<LiveFrame>): Promise<FrameResult> {
  return frame().then(
    (body): FrameResult => ({ kind: "frame", body }),
    (): FrameResult => ({ kind: "error" }),
  );
}

function raceCancellation(
  rendered: Promise<FrameResult>,
  register: (cancel: () => void) => void,
): Promise<FrameResult> {
  const cancelled = new Promise<FrameResult>((resolve) => {
    register(() => {
      resolve({ kind: "cancelled" });
    });
  });
  return Promise.race([rendered, cancelled]);
}

function intervalWait(milliseconds: number): {
  promise: Promise<void>;
  wake: () => void;
} {
  let finish: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const timer = setTimeout(() => {
    finish?.();
    finish = undefined;
  }, milliseconds);
  const wake = () => {
    clearTimeout(timer);
    finish?.();
    finish = undefined;
  };
  return { promise, wake };
}

function containsInput(
  bytes: Buffer | string,
  numeric: number,
  character: string,
): boolean {
  return typeof bytes === "string"
    ? bytes.includes(character)
    : bytes.includes(numeric);
}

/** Draw a serialized frame loop in place and restore terminal state on every exit path. */
export async function runLive(options: LiveOptions): Promise<number> {
  const stdinTty = process.stdin.isTTY ?? false;
  let quitting = false;
  let exitCode = 0;
  let redrawRequested = true;
  let wake: (() => void) | undefined;
  let cancelFrame: (() => void) | undefined;
  let input: ReadStream | undefined;
  const previousRaw = stdinTty ? process.stdin.isRaw : false;
  const requestQuit = (code: number) => {
    quitting = true;
    exitCode = code;
    wake?.();
    cancelFrame?.();
  };
  const onData = (bytes: Buffer | string) => {
    if (containsInput(bytes, 3, "\u0003")) {
      requestQuit(130);
    } else if (
      containsInput(bytes, 113, "q") ||
      containsInput(bytes, 81, "Q")
    ) {
      requestQuit(0);
    }
  };
  const onResize = () => {
    redrawRequested = true;
    wake?.();
  };
  const onInt = () => {
    requestQuit(130);
  };
  const onTerm = () => {
    requestQuit(143);
  };
  const onInputError = () => {
    process.stderr.write("FATAL: cannot read terminal input\n");
    requestQuit(2);
  };
  const cleanup = () => {
    if (input !== undefined) {
      input.off("data", onData);
      input.off("error", onInputError);
      input.pause();
      input.destroy();
      input = undefined;
    }
    if (stdinTty) process.stdin.setRawMode(previousRaw);
    process.stdout.off("resize", onResize);
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
    process.stdout.write(`${ESC}?25h${ESC}?1049l`);
  };
  const prepare = () => {
    process.stdout.on("resize", onResize);
    process.on("SIGINT", onInt);
    process.on("SIGTERM", onTerm);
    if (stdinTty) {
      input = createReadStream("/dev/tty");
      process.stdin.setRawMode(true);
      input.on("data", onData);
      input.on("error", onInputError);
      input.resume();
    }
    process.stdout.write(`${ESC}?1049h${ESC}?25l`);
  };
  const loop = async (): Promise<number> => {
    const registerCancel = (cancel: () => void) => {
      cancelFrame = cancel;
    };
    for (;;) {
      if (quitting) break;
      redrawRequested = false;
      const rendered = collectFrame(options.frame);
      const result = await raceCancellation(rendered, registerCancel);
      cancelFrame = undefined;
      if (result.kind === "cancelled") break;
      if (result.kind === "error") {
        process.stderr.write("FATAL: live status refresh failed\n");
        return 2;
      }
      if (typeof result.body === "number") {
        exitCode = result.body;
        break;
      }
      process.stdout.write(
        `${ESC}2J${ESC}H${result.body}\n\n${ESC}2mDisplay redraw every ${options.intervalSeconds}s · sample ages are separate · q / Ctrl+C to exit${ESC}0m`,
      );
      if (quitting) break;
      if (redrawRequested) continue;
      const waiting = intervalWait(options.intervalSeconds * 1000);
      wake = waiting.wake;
      await waiting.promise;
      wake = undefined;
    }
    return exitCode;
  };
  return Promise.resolve()
    .then(prepare)
    .then(loop)
    .then(
      (code) => {
        cleanup();
        return code;
      },
      () => {
        cleanup();
        process.stderr.write("FATAL: live status refresh failed\n");
        return 2;
      },
    );
}
