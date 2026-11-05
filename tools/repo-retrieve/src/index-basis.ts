// What a certified watermark lets `rr index` assume about ccc's memo (see IncrementalBasis in
// index-plan.ts). ccc 0.2.42 / cocoindex 1.0.25 reuse a file's embeddings when its memo entry hits:
//   memo key   = process_file identity + file path + table target   (a new or renamed path misses)
//   file state = mtime unchanged, or mtime changed with equal content hash
//   logic      = AST of process_file and the coco.fn it calls       (a ccc upgrade can miss all)
//   context    = EMBEDDER (detect_change=True): pickled model name, device, trust_remote_code
// The walk (include/exclude/max_file_size/.gitignore) decides which files exist at all, so a
// change there adds files that git cannot show as changed. Everything below therefore reads
// "full rebuild" unless each of those is ruled out from a recorded fact.
import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "@dotfiles/shared/src/zod.ts";
import { err, fromAsyncThrowable, ok, type Result } from "neverthrow";
import { resolveDbDir } from "./ccc-db-dir.ts";
import { requireExecutable, runChildCaptured } from "./child.ts";
import type { IncrementalBasis } from "./index-plan.ts";

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

// Recorded in the watermark by the index run that certified it.
export const BasisRecordSchema = z.object({
  ccc: z.string().min(1),
  settings: z.string().regex(/^[0-9a-f]{64}$/u),
  // Paths that differed from HEAD while that index ran: the index holds their dirty content.
  dirty: z.array(z.string()),
});
export type BasisRecord = z.infer<typeof BasisRecordSchema>;

export type WatermarkState =
  | { kind: "missing" }
  | { kind: "invalid" }
  | {
      kind: "ok";
      source: "index" | "stamp";
      head: string | null;
      basis: BasisRecord | undefined;
    };

// The two files ccc reads settings from: the project's and the user's global one. The walk
// rules and the embedder both come from them.
export async function settingsDigest(
  project: string,
  userDir = process.env["COCOINDEX_CODE_DIR"] ??
    join(homedir(), ".cocoindex_code"),
): Promise<string> {
  const hash = createHash("sha256");
  for (const path of [
    join(project, ".cocoindex_code", "settings.yml"),
    join(userDir, "global_settings.yml"),
  ]) {
    const file = Bun.file(path);
    hash.update(
      (await file.exists())
        ? createHash("sha256")
            .update(new Uint8Array(await file.arrayBuffer()))
            .digest()
        : "absent",
    );
  }
  return hash.digest("hex");
}

async function gitZ(
  project: string,
  args: string[],
): Promise<Result<string[], Error>> {
  const git = requireExecutable("git");
  if (git.isErr()) return err(git.error);
  const child = await runChildCaptured(
    [git.value, "--no-optional-locks", "-C", project, ...args, "-z"],
    30_000,
    false,
  );
  return child.exitCode === 0
    ? ok(child.stdout.split("\0").filter(Boolean))
    : err(new Error(`git ${args[0]} failed: ${child.stderr.trim()}`));
}

// Tracked paths whose worktree content differs from `from`, plus untracked unignored paths.
// A trailing "/" names a nested repository, whose files git cannot enumerate: ccc_plan.py bills
// everything under it.
async function changesSince(
  project: string,
  from: string,
): Promise<Result<string[], Error>> {
  const tracked = await gitZ(project, [
    "diff",
    "--name-only",
    "--no-renames",
    "--relative",
    from,
  ]);
  if (tracked.isErr()) return err(tracked.error);
  const untracked = await gitZ(project, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);
  if (untracked.isErr()) return err(untracked.error);
  return ok([...new Set([...tracked.value, ...untracked.value])]);
}

export async function captureBasisRecord(
  project: string,
  cccVersion: string,
): Promise<Result<BasisRecord, Error>> {
  if (cccVersion === "" || cccVersion === "unknown")
    return err(new Error("ccc version unknown"));
  const dirty = await changesSince(project, "HEAD");
  if (dirty.isErr()) return err(dirty.error);
  return ok({
    ccc: cccVersion,
    settings: await settingsDigest(project),
    dirty: dirty.value,
  });
}

// The index ran between the two captures; certify only if nothing the memo depends on moved.
export function mergeBasisRecords(
  before: Result<BasisRecord, Error>,
  after: Result<BasisRecord, Error>,
): BasisRecord | undefined {
  if (before.isErr() || after.isErr()) return undefined;
  if (
    before.value.ccc !== after.value.ccc ||
    before.value.settings !== after.value.settings
  )
    return undefined;
  return {
    ...after.value,
    dirty: [
      ...new Set([...before.value.dirty, ...after.value.dirty]),
    ].toSorted(),
  };
}

// ccc keeps memo entries in cocoindex.db and chunks in target_sqlite.db; without both, ccc
// re-embeds everything whatever the watermark says.
async function memoStorePresent(project: string): Promise<boolean> {
  const dir = await resolveDbDir(project);
  if (dir.isErr()) return false;
  const memo = await fromAsyncThrowable(
    () => readdir(join(dir.value, "cocoindex.db")),
    asError,
  )();
  const chunks = await fromAsyncThrowable(
    () => stat(join(dir.value, "target_sqlite.db")),
    asError,
  )();
  return memo.isOk() && memo.value.length > 0 && chunks.isOk();
}

const full = (reason: string): IncrementalBasis => ({ mode: "full", reason });
const isGitignore = (path: string) =>
  path === ".gitignore" || path.endsWith("/.gitignore");

export async function incrementalBasis(
  project: string,
  watermark: WatermarkState,
): Promise<IncrementalBasis> {
  if (watermark.kind === "missing")
    return full("no index watermark: first index of this root");
  if (watermark.kind === "invalid")
    return full("index watermark is unreadable or corrupt");
  if (watermark.source === "stamp")
    return full("legacy stamp watermark certifies no index run");
  const { head, basis: recorded } = watermark;
  if (head === null)
    return full("watermark recorded no git HEAD to diff against");
  if (recorded === undefined)
    return full(
      "watermark predates the recorded memo basis (ccc version, settings digest, dirty paths)",
    );
  if (!(await memoStorePresent(project)))
    return full("ccc memo store or chunk table is missing under the DB dir");
  if (recorded.settings !== (await settingsDigest(project)))
    return full(
      "ccc settings changed (project settings.yml or global_settings.yml): walk rules or embedder differ",
    );
  const changes = await changesSince(project, head);
  if (changes.isErr())
    return full(
      `cannot diff the worktree against the watermark HEAD: ${changes.error.message}`,
    );
  const changed = [...new Set([...changes.value, ...recorded.dirty])];
  if (changed.some((path) => isGitignore(path)))
    return full(
      ".gitignore changed or was dirty at index time: newly visible files are not in any git diff",
    );
  return {
    mode: "incremental",
    since: head.slice(0, 12),
    recordedCcc: recorded.ccc,
    changed,
  };
}
