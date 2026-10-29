import { lstat, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { runProbe } from "./disk-probe.ts";
import { ripRecords } from "./lib/graveyards.ts";
import { stateDir, waitForLock } from "./receipt.ts";
import { workerMutationRefusal } from "./lib/worker-guard.ts";
import { fromAsyncThrowable } from "neverthrow";

const Check = z.object({
  verdict: z.enum(["safe", "deny", "unknown"]),
  reason: z.string(),
});
const fingerprint = async (path: string) => {
  const s = await lstat(path);
  return `${s.dev}:${s.ino}:${s.mode}:${s.uid}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
};
type Item = {
  id: string;
  target: null;
  path: string;
  verdict: string;
  reason: string;
  fingerprint: string | null;
  effect: string;
  logical_bytes: null;
  allocated_bytes: null;
  eligible_at: null;
  error: string | null;
  detail: { destination: string | null };
};
const receiptFailure = (items: Item[], error: unknown) => {
  for (const item of items.filter((row) => row.effect !== "none")) {
    item.verdict = "unknown";
    item.error = `receipt failed: ${String(error)}`;
  }
};
export async function movePaths(
  paths: string[],
  deadline: number,
  start: number,
  progress: boolean,
  probe = runProbe,
) {
  const graveyard = resolve(
    process.env["GRAVEYARD"] ??
      process.env["RIP_GRAVEYARD"] ??
      join(
        process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local/share"),
        "graveyard",
      ),
  );
  const remaining = () => Math.floor(deadline - (performance.now() - start));
  const report = (stage: string) => {
    if (progress)
      process.stderr.write(
        `disk: move paths ${stage}; elapsed ${Math.floor(performance.now() - start)}ms / deadline ${deadline}ms\n`,
      );
  };
  const items: Item[] = paths.map((path) => ({
    id: path,
    target: null,
    path,
    verdict: "unknown",
    reason: "not attempted",
    fingerprint: null,
    effect: "none",
    logical_bytes: null,
    allocated_bytes: null,
    eligible_at: null,
    error: null,
    detail: { destination: null },
  }));
  const failAll = (reason: string) => {
    for (const item of items) item.reason = reason;
    return { items, graveyard, receipt: null, busy: false };
  };
  const guard = workerMutationRefusal();
  if (guard !== null) {
    for (const item of items) {
      item.verdict = "deny";
      item.reason = guard;
    }
    return { items, graveyard, receipt: null, busy: false };
  }
  report("checking graveyard");
  if (remaining() <= 0) return failAll("deadline expired");
  const statArgs =
    process.platform === "darwin"
      ? ["stat", "-f", "%T", graveyard]
      : ["stat", "-f", "-c", "%T", "--", graveyard];
  const fs = await probe(statArgs, remaining());
  const type = fs.out.trim().toLowerCase();
  if (fs.exit !== 0 || fs.timedOut || type === "")
    return failAll("graveyard filesystem unavailable");
  if (type === "tmpfs" || type === "ramfs") {
    for (const item of items) {
      item.verdict = "deny";
      item.reason = `graveyard is on ${type}`;
    }
    return { items, graveyard, receipt: null, busy: false };
  }
  if (remaining() <= 0) return failAll("deadline expired");
  const lockResult = await fromAsyncThrowable(() =>
    waitForLock("move", stateDir(), report, Math.min(10, remaining() / 1000)),
  )();
  if (lockResult.isErr())
    return failAll(`lock unavailable: ${String(lockResult.error)}`);
  const lock = lockResult.value;
  if (lock.release === null)
    return {
      ...failAll(lock.error ?? "lock unavailable"),
      busy: lock.exit === 3,
    };
  using _lock = { [Symbol.dispose]: lock.release };
  const started = Temporal.Now.instant().toString();
  for (const item of items) {
    if (remaining() <= 0) {
      item.reason = "deadline expired before action";
      continue;
    }
    report(`checking ${item.path}`);
    const first = await fromAsyncThrowable(() => fingerprint(item.path))();
    if (first.isErr()) {
      item.reason = String(first.error);
      continue;
    }
    const before = first.value;
    item.fingerprint = before;
    const check = await probe(
      [
        process.execPath,
        "-e",
        `import { checkMove } from ${JSON.stringify(join(import.meta.dir, "disk-move-check.ts"))}; console.log(JSON.stringify(await checkMove(process.env.DISK_MOVE_PATH, process.env.DISK_MOVE_GRAVEYARD)));`,
      ],
      remaining(),
      {
        ...process.env,
        DISK_MOVE_PATH: item.path,
        DISK_MOVE_GRAVEYARD: graveyard,
      },
    );
    const parsed = jsonOf(Check).safeParse(check.out);
    if (check.exit !== 0 || check.timedOut || !parsed.success) {
      item.reason = "safety check unavailable or deadline exceeded";
      continue;
    }
    if (parsed.data.verdict !== "safe") {
      item.verdict = parsed.data.verdict;
      item.reason = parsed.data.reason;
      continue;
    }
    const current = await fromAsyncThrowable(() => fingerprint(item.path))();
    if (current.isErr()) {
      item.reason = "identity unavailable after safety check";
      continue;
    }
    if (before !== current.value) {
      item.verdict = "changed";
      item.reason = "identity changed after safety check";
      continue;
    }
    if (remaining() <= 0) {
      item.reason = "deadline expired before burial";
      continue;
    }
    const previous = ripRecords(graveyard).length;
    report(`burying ${item.path}`);
    const result = await probe(
      ["rip", "--graveyard", graveyard, "--", item.path],
      remaining(),
      { ...process.env, GRAVEYARD: graveyard, RIP_GRAVEYARD: graveyard },
    );
    const records = ripRecords(graveyard)
      .slice(previous)
      .filter(
        (r) =>
          resolve(r.original) === resolve(item.path) &&
          resolve(r.destination).startsWith(`${graveyard}${sep}`),
      );
    const record = records.at(-1);
    if (record !== undefined) item.detail.destination = record.destination;
    const sourceMissing = await lstat(item.path).then(
      () => false,
      (error: NodeJS.ErrnoException) => error.code === "ENOENT",
    );
    const destinationExists =
      record !== undefined &&
      (await lstat(record.destination).then(
        () => true,
        () => false,
      ));
    if (
      result.exit === 0 &&
      !result.timedOut &&
      sourceMissing &&
      record !== undefined &&
      destinationExists
    ) {
      item.verdict = "completed";
      item.reason = "recoverable burial recorded";
      item.effect = "move";
    } else {
      item.reason = result.timedOut
        ? "burial timed out; effects may be partial"
        : `burial result unconfirmed: ${result.err.trim()}`;
      item.effect = "mixed";
    }
    report(`finished ${item.path}`);
  }
  let receipt: { id: string; path: string; delivery_error: null } | null = null;
  if (items.some((item) => item.effect !== "none")) {
    const written = await fromAsyncThrowable(async () => {
      const id = crypto.randomUUID();
      const dir = join(stateDir(), "move-receipts");
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const path = join(dir, `${id}.json`);
      await writeFile(
        path,
        JSON.stringify({
          schema: "disk.move-receipt/1",
          id,
          started,
          ended: Temporal.Now.instant().toString(),
          graveyard,
          items,
        }),
        { flag: "wx", mode: 0o600 },
      );
      return { id, path, delivery_error: null };
    })();
    if (written.isOk()) receipt = written.value;
    else receiptFailure(items, written.error);
  }
  return { items, graveyard, receipt, busy: false };
}
