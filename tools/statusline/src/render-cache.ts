import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
  unlink,
} from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fromThrowable, jsonText, z } from "./zod.ts";

const now = (): number => Temporal.Now.instant().epochMilliseconds;
const safeKey = (key: string): string =>
  new Bun.CryptoHasher("sha256").update(key).digest("hex");

function freshValue<T extends z.ZodType>(
  text: string,
  schema: T,
  ttlMs: number,
): z.output<T> | null {
  const decoded = jsonText.safeParse(text);
  if (!decoded.success) return null;
  const saved = z
    .object({ at: z.number(), value: z.unknown() })
    .safeParse(decoded.data);
  if (!saved.success) return null;
  const age = now() - saved.data.at;
  if (age < 0 || age >= ttlMs) return null;
  const value = schema.safeParse(saved.data.value);
  return value.success ? value.data : null;
}

/** Persistent TTL cache for expensive render sources; rejected loads do not update the cache. */
export async function cachedSource<T extends z.ZodType>(options: {
  key: string;
  ttlMs: number;
  schema: T;
  load: () => Promise<z.output<T>>;
  root?: string;
}): Promise<z.output<T>> {
  const root =
    options.root ??
    join(process.env["HOME"] ?? "", ".cache/claude/statusline/sources");
  const path = join(root, `${safeKey(options.key)}.json`);
  const text = await readFile(path, "utf8").catch(() => null);
  const hit =
    text === null ? null : freshValue(text, options.schema, options.ttlMs);
  if (hit !== null) return hit;
  const value = await options.load();
  await mkdir(dirname(path), { recursive: true }).catch(() => null);
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify({ at: now(), value }), { mode: 0o600 })
    .then(() => rename(temp, path))
    .catch(async () => {
      await unlink(temp).catch(() => null);
    });
  return value;
}

const RenderOwner = z.object({
  pid: z.number(),
  host: z.string(),
  at: z.number(),
});
const RenderFrame = z.object({
  at: z.number(),
  input: z.unknown(),
  output: z.string(),
});
const LOCK_STALE_MS = 2_000;
const FRAME_FRESH_MS = 5_000;
const renderPath = (root: string, sid: string): string =>
  join(root, `${safeKey(sid)}.json`);

async function lockAge(lockPath: string): Promise<number | null> {
  return stat(lockPath)
    .then((info) => now() - info.mtimeMs)
    .catch(() => null);
}

async function staleLock(lockPath: string): Promise<boolean> {
  const ownerText = await readFile(join(lockPath, "owner.json"), "utf8").catch(
    () => null,
  );
  if (ownerText === null) {
    const age = await lockAge(lockPath);
    return age !== null && age > LOCK_STALE_MS;
  }
  const decoded = jsonText.safeParse(ownerText);
  if (!decoded.success) {
    const age = await lockAge(lockPath);
    return age !== null && age > LOCK_STALE_MS;
  }
  const owner = RenderOwner.safeParse(decoded.data);
  if (!owner.success) {
    const age = await lockAge(lockPath);
    return age !== null && age > LOCK_STALE_MS;
  }
  if (now() - owner.data.at > LOCK_STALE_MS) return true;
  if (owner.data.host !== hostname()) return false;
  const alive = fromThrowable(() => process.kill(owner.data.pid, 0))();
  if (alive.isOk()) return false;
  const error = z.object({ code: z.string() }).safeParse(alive.error);
  return error.success && error.data.code === "ESRCH";
}

async function liveOwner(lockPath: string): Promise<boolean> {
  const ownerText = await readFile(join(lockPath, "owner.json"), "utf8").catch(
    () => null,
  );
  if (ownerText === null) return false;
  const decoded = jsonText.safeParse(ownerText);
  if (!decoded.success) return false;
  const owner = RenderOwner.safeParse(decoded.data);
  if (
    !owner.success ||
    owner.data.host !== hostname() ||
    now() - owner.data.at > LOCK_STALE_MS
  )
    return false;
  return fromThrowable(() => process.kill(owner.data.pid, 0))().isOk();
}

async function freshFrame(
  outputPath: string,
  inputText: string,
): Promise<string | null> {
  const text = await readFile(outputPath, "utf8").catch(() => null);
  if (text === null) return null;
  const decoded = jsonText.safeParse(text);
  if (!decoded.success) return null;
  const frame = RenderFrame.safeParse(decoded.data);
  if (
    !frame.success ||
    now() - frame.data.at < 0 ||
    now() - frame.data.at >= FRAME_FRESH_MS ||
    JSON.stringify(frame.data.input) !== inputText
  )
    return null;
  return frame.data.output;
}

async function renderWithLock(
  lockPath: string,
  outputPath: string,
  render: () => Promise<string>,
  input: unknown,
): Promise<string> {
  await writeFile(
    join(lockPath, "owner.json"),
    JSON.stringify({ pid: process.pid, host: hostname(), at: now() }),
    { mode: 0o600 },
  ).catch(() => null);
  return render()
    .then(async (output) => {
      const temp = `${outputPath}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify({ at: now(), input, output }), {
        mode: 0o600,
      })
        .then(() => rename(temp, outputPath))
        .catch(async () => {
          await unlink(temp).catch(() => null);
        });
      // Keep the owner visible briefly after publishing, so contenders can observe and reuse
      // this completed fresh frame before the next process acquires the lock.
      await Bun.sleep(50);
      return output;
    })
    .finally(() => {
      void rm(lockPath, { recursive: true, force: true }).catch(() => null);
    });
}

/** Serialize render work per session across processes, returning the last output to contenders. */
export async function withSessionRender(
  sid: string,
  render: () => Promise<string>,
  options: {
    root?: string;
    waitMs?: number;
    pollMs?: number;
    input?: unknown;
  } = {},
): Promise<string> {
  const root =
    options.root ??
    join(process.env["HOME"] ?? "", ".cache/claude/statusline/renders");
  const outputPath = renderPath(root, sid);
  const lockPath = `${outputPath}.lock`;
  const input = options.input ?? null;
  const inputText = JSON.stringify(input);
  await mkdir(root, { recursive: true }).catch(() => null);
  const deadline = now() + (options.waitMs ?? LOCK_STALE_MS);
  for (;;) {
    const got = await mkdir(lockPath).then(
      () => true,
      () => false,
    );
    if (got) return renderWithLock(lockPath, outputPath, render, input);
    if (await staleLock(lockPath)) {
      await rm(lockPath, { recursive: true, force: true }).catch(() => null);
      continue;
    }
    const ownerIsLive = await liveOwner(lockPath);
    const previous = ownerIsLive
      ? await freshFrame(outputPath, inputText)
      : null;
    if (previous !== null) return previous;
    if (now() >= deadline) {
      await rm(lockPath, { recursive: true, force: true }).catch(() => null);
      continue;
    }
    await Bun.sleep(options.pollMs ?? 20);
  }
}
