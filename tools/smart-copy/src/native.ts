// The native route: feed this machine's own clipboard tool, if it has one.
//
// Copying the same text to a second clipboard is harmless, so this route never asks whether the human
// is "here": a tool on PATH is fed, always. Which tool: the first present of
//   clip.exe (WSL; UTF-16LE, started through the desktop session's interop socket)
//   pbcopy   (macOS; UTF-8)
//   xclip    (Linux; UTF-8)
//   xsel     (Linux; UTF-8)
//
// WSL. Windows clipboards are per Windows session. A pane that kept the WSL_INTEROP it inherited may
// point at a dead socket or at session 0, and clip.exe then fills a clipboard nobody reads.
// scripts/wsl-interop-session.ts (via tools/shared/src/desktop-interop.ts) names the live socket of the
// owner's desktop session; only clip.exe's environment gets it. When none qualifies the inherited
// WSL_INTEROP stays and the status text says so.
//
// BOUND. The tool is cut at NATIVE_MS; one still running then is stopped (SIGKILL) and reported, never
// waited out. xclip and xsel fork a background process that keeps the clipboard and inherits our pipes,
// so stdout is not captured and stderr is read only for a short grace period after the tool exits.
//
// TEST SEAMS (not route switches; never SSH_*/HERDR_* names): SMART_COPY_NATIVE_MS shortens the bound,
// SMART_COPY_INTEROP_HELPER replaces the interop helper command (words split on spaces).
import {
  desktopInterop,
  repoHelperCommand,
} from "@dotfiles/shared/src/desktop-interop.ts";
import { errorMessage, Result } from "@dotfiles/shared/src/result.ts";

export const NATIVE_MS = 5_000;
const STDERR_GRACE_MS = 200;

export type NativeResult =
  | { ok: true; tool: string; note: string }
  | { ok: false; tool: string | undefined; reason: string };

type Tool = { name: string; args: string[]; utf16: boolean };

/** In order of preference; the first present on PATH is the one fed. */
export const TOOLS: readonly Tool[] = [
  { name: "clip.exe", args: [], utf16: true },
  { name: "pbcopy", args: [], utf16: false },
  { name: "xclip", args: ["-selection", "clipboard"], utf16: false },
  { name: "xsel", args: ["--clipboard", "--input"], utf16: false },
];

export function nativeBound(env: Record<string, string | undefined>): number {
  const seam = Number(env["SMART_COPY_NATIVE_MS"] ?? "");
  return Number.isInteger(seam) && seam > 0 ? seam : NATIVE_MS;
}

/** The first line of `text` that has content, from the end — the tool's own last word. */
const lastLine = (text: string): string =>
  text.trim().split("\n").at(-1)?.trim() ?? "";

async function readUpTo(
  stream: ReadableStream<Uint8Array>,
  graceMs: number,
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  const done = Result.tryPromise({
    try: async () => {
      for (;;) {
        const next = await reader.read();
        if (next.done) return;
        chunks.push(next.value);
      }
    },
    catch: (error: unknown) => error,
  });
  await Promise.race([done, Bun.sleep(graceMs)]);
  await Result.tryPromise({
    try: () => reader.cancel(),
    catch: (error: unknown) => error,
  });
  return Buffer.concat(chunks).toString("utf8");
}

/** Run `tool` with `payload` on stdin, bounded by `ms`. Never throws. */
async function feed(
  path: string,
  tool: Tool,
  payload: Uint8Array,
  env: Record<string, string | undefined>,
  ms: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const signal = AbortSignal.timeout(ms);
  const spawned = Result.try({
    try: () =>
      Bun.spawn([path, ...tool.args], {
        stdin: "pipe",
        stdout: "ignore",
        stderr: "pipe",
        env,
        signal,
        killSignal: "SIGKILL",
      }),
    catch: (error: unknown) => error,
  });
  if (spawned.isErr())
    return {
      ok: false,
      reason: `cannot run ${tool.name}: ${errorMessage(spawned.error)}`,
    };
  const proc = spawned.value;
  // A tool that exits without reading everything closes the pipe under us; its exit is the verdict.
  void Result.tryPromise({
    try: async () => {
      await proc.stdin.write(payload);
      await proc.stdin.end();
    },
    catch: (error: unknown) => error,
  });
  const code = await proc.exited;
  if (signal.aborted)
    return {
      ok: false,
      reason: `${tool.name} still running after ${ms} ms; stopped it`,
    };
  const said = lastLine(await readUpTo(proc.stderr, STDERR_GRACE_MS));
  if (code === 0) return { ok: true };
  const how =
    proc.signalCode === null
      ? `exited ${code}`
      : `killed by ${proc.signalCode}`;
  return {
    ok: false,
    reason: `${tool.name} ${how}${said === "" ? "" : `: ${said}`}`,
  };
}

/** Feed the first clipboard tool on PATH with `text`. */
export async function copyNative(
  text: string,
  env: Record<string, string | undefined>,
  path = env["PATH"],
): Promise<NativeResult> {
  const found = TOOLS.map((tool) => ({
    tool,
    path: Bun.which(tool.name, path === undefined ? {} : { PATH: path }),
  })).find((candidate) => candidate.path !== null);
  const toolPath = found?.path ?? null;
  if (found === undefined || toolPath === null)
    return {
      ok: false,
      tool: undefined,
      reason: `no clipboard tool on PATH (looked for ${TOOLS.map((t) => t.name).join(", ")})`,
    };
  const { tool } = found;
  const payload = tool.utf16
    ? Buffer.from(text, "utf16le")
    : Buffer.from(text, "utf8");
  let toolEnv = env;
  let note = "";
  if (tool.utf16) {
    const interop = await desktopInterop(
      repoHelperCommand(env["SMART_COPY_INTEROP_HELPER"]),
    );
    if (interop.ok) toolEnv = { ...env, WSL_INTEROP: interop.socket };
    else note = `inherited WSL_INTEROP kept: ${interop.reason}`;
  }
  const fed = await feed(toolPath, tool, payload, toolEnv, nativeBound(env));
  return fed.ok
    ? { ok: true, tool: tool.name, note }
    : { ok: false, tool: tool.name, reason: fed.reason };
}
