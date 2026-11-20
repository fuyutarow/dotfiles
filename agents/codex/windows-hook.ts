// Windows Codex invokes this through wsl.exe; hook implementations remain in WSL.
import { Result } from "../../tools/shared/src/result.ts";
import { obj } from "../hooks/narrow.ts";
import { jsonText } from "../hooks/zod.ts";

const command = Bun.argv[2];
if (command === undefined) process.exit(2);

async function linuxPath(value: string): Promise<string> {
  const signal = AbortSignal.timeout(5_000);
  const translated = await Result.tryPromise({
    try: async () => {
      const proc = Bun.spawn(["wslpath", "-u", value], {
        stdout: "pipe",
        stderr: "ignore",
        signal,
      });
      const [stdout, code] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited,
      ]);
      return { code, stdout, timedOut: signal.aborted };
    },
    catch: (e: unknown) => e,
  });
  if (translated.isErr() || translated.value.timedOut) return value;
  return translated.value.code === 0 ? translated.value.stdout.trim() : value;
}

async function convertNativePaths(
  payload: Record<string, unknown>,
): Promise<void> {
  for (const key of ["cwd", "transcript_path"]) {
    const value = payload[key];
    if (typeof value !== "string" || !/^(?:[a-z]:[\\/]|\\\\)/iu.test(value))
      continue;
    payload[key] = await linuxPath(value);
  }
}

const received = await Result.tryPromise({
  try: () => Bun.stdin.text(),
  catch: (e: unknown) => e,
});
if (received.isErr()) process.exit(2);
const input = received.value;
const decoded = jsonText.safeParse(input);
const payload = decoded.success ? { ...obj(decoded.data) } : undefined;
if (payload !== undefined) await convertNativePaths(payload);
const cwd = payload?.["cwd"];
const child = Bun.spawn(["zsh", "-lc", command], {
  ...(typeof cwd === "string" ? { cwd } : {}),
  stdin: "pipe",
  stdout: "inherit",
  stderr: "inherit",
  timeout: 60_000,
});
const forwarded = payload === undefined ? input : JSON.stringify(payload);
const forwardedChild = await Result.tryPromise({
  try: async () => {
    await child.stdin.write(new TextEncoder().encode(forwarded));
    await child.stdin.end();
    return child.exited;
  },
  catch: (e: unknown) => e,
});
process.exit(forwardedChild.isOk() ? forwardedChild.value : 2);
