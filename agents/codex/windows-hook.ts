// Windows Codex invokes this through wsl.exe; hook implementations remain in WSL.
import { attempt } from "../../tools/shared/src/attempt.ts";
import { obj } from "../hooks/narrow.ts";
import { jsonText } from "../hooks/zod.ts";

const command = Bun.argv[2];
if (command === undefined) process.exit(2);

async function linuxPath(value: string): Promise<string> {
  const signal = AbortSignal.timeout(5_000);
  const translated = await attempt(async () => {
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
  });
  if (!translated.ok || translated.value.timedOut) return value;
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

const received = await attempt(() => Bun.stdin.text());
if (!received.ok) process.exit(2);
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
const forwardedChild = await attempt(async () => {
  await child.stdin.write(new TextEncoder().encode(forwarded));
  await child.stdin.end();
  return child.exited;
});
process.exit(forwardedChild.ok ? forwardedChild.value : 2);
