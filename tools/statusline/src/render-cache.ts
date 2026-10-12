import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
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
    join(process.env.HOME ?? "", ".cache/claude/statusline/sources");
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
    .catch(() => null);
  return value;
}

const RenderOwner = z.object({
  pid: z.number(),
  host: z.string(),
  at: z.number(),
});
const renderPath = (root: string, sid: string): string =>
  join(root, `${safeKey(sid)}.json`);

async function staleLock(lockPath: string): Promise<boolean> {
  const ownerText = await readFile(join(lockPath, "owner.json"), "utf8").catch(
    () => null,
  );
  if (ownerText === null)
    return stat(lockPath)
      .then((info) => now() - info.mtimeMs > 2_000)
      .catch(() => false);
  const decoded = jsonText.safeParse(ownerText);
  if (!decoded.success) return false;
  const owner = RenderOwner.safeParse(decoded.data);
  if (
    !owner.success ||
    owner.data.host !== hostname() ||
    now() - owner.data.at <= 2_000
  )
    return false;
  const alive = fromThrowable(() => process.kill(owner.data.pid, 0))();
  if (alive.isOk()) return false;
  const error = z.object({ code: z.string() }).safeParse(alive.error);
  return error.success && error.data.code === "ESRCH";
}

async function renderWithLock(
  lockPath: string,
  outputPath: string,
  render: () => Promise<string>,
  reuseCompleted: boolean,
): Promise<string> {
  const completed = reuseCompleted
    ? await readFile(outputPath, "utf8").catch(() => null)
    : null;
  if (completed !== null) {
    await rm(lockPath, { recursive: true, force: true }).catch(() => null);
    return completed;
  }
  await writeFile(
    join(lockPath, "owner.json"),
    JSON.stringify({ pid: process.pid, host: hostname(), at: now() }),
    { mode: 0o600 },
  ).catch(() => null);
  return render()
    .then(async (output) => {
      const temp = `${outputPath}.${process.pid}.tmp`;
      await writeFile(temp, output, { mode: 0o600 })
        .then(() => rename(temp, outputPath))
        .catch(() => null);
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
  options: { root?: string; waitMs?: number; pollMs?: number } = {},
): Promise<string> {
  const root =
    options.root ??
    join(process.env.HOME ?? "", ".cache/claude/statusline/renders");
  const outputPath = renderPath(root, sid);
  const lockPath = `${outputPath}.lock`;
  await mkdir(root, { recursive: true }).catch(() => null);
  const deadline = now() + (options.waitMs ?? 10_000);
  let waited = false;
  for (;;) {
    const got = await mkdir(lockPath).then(
      () => true,
      () => false,
    );
    if (got) return renderWithLock(lockPath, outputPath, render, waited);
    const previous = await readFile(outputPath, "utf8").catch(() => null);
    if (previous !== null) return previous;
    waited = true;
    if (await staleLock(lockPath)) {
      await rm(lockPath, { recursive: true, force: true }).catch(() => null);
      continue;
    }
    if (now() >= deadline) return "";
    await Bun.sleep(options.pollMs ?? 20);
  }
}
