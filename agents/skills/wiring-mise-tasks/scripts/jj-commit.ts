#!/usr/bin/env bun
// jj-commit.ts — the gated commit entrypoint of a jj repository. jj does not run Git hooks, so a bare `jj commit`
// skips every gate. This script:
//   1. snapshots the working copy and selects the paths to commit (named paths and/or --records),
//   2. passes PRECOMMIT_VCS=jj, PRECOMMIT_PATHS_FILE (NUL-delimited), PRECOMMIT_REV (@ commit ID)
//      and PRECOMMIT_BASE (@- commit ID) to `mise run --jobs 1 hook:pre-commit`,
//   3. `jj commit`s exactly those paths (literal root filesets), sets the bookmark to @- explicitly,
//   4. prints receipts, optionally pushes the named bookmark (rebasing and retrying push races),
//      and runs .githooks/post-commit.
//
//   mise run commit -- -m "<message>" [--records] [--push] [-- <path>...]
//   mise run commit -- -F <message-file> ...
//
// --records  every changed path under research_record/ (@ vs @-), EXCLUDING the directory of a run
//            whose research_record/runs/<id>.json does not exist yet (a run in flight: commit only
//            finished run dirs).
// --push     fetches and pushes the bookmark; if another writer moves the remote, rebase this
//            commit onto it and retry, bounded to three attempts (never force-push).
// --bookmark / BOOKMARK env, default alpha outside agx workspaces.
// Exit: 0 committed · 1 the gate refused (nothing committed) · 2 usage or empty selection.
import { $ } from "bun";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { cli } from "cleye";
import {
  filesets,
  jjChanged,
  jjFiles,
  selected,
  validPath,
} from "./jj-precommit.ts";

const die = (m: string, code = 2): never => {
  console.error(`jj-commit: ${m}`);
  process.exit(code);
};

const envBookmark = process.env.BOOKMARK;

// strictFlags alone lets --__proto__ reach type-flag before the unknown-flag check (BG1).
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__")
    die(`unknown option '--${flag}'`);
};

const parsed = cli(
  {
    name: "jj-commit.ts",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: ["[paths...]", "--", "[rest...]"],
    help: {
      description:
        "Gated jj commit of exactly the named paths (see the header comment).",
    },
    flags: {
      message: {
        type: String,
        alias: "m",
        default: "",
        description: "commit message",
      },
      file: {
        type: String,
        alias: "F",
        default: "",
        description: "read the commit message from this file",
      },
      records: {
        type: Boolean,
        default: false,
        description: "select finished research_record/ paths",
      },
      push: {
        type: Boolean,
        default: false,
        description: "push the bookmark to origin afterwards",
      },
      bookmark: {
        type: String,
        default: envBookmark ?? "",
        description: "bookmark to move to the commit (or set BOOKMARK)",
      },
    },
  },
  undefined,
  Bun.argv.slice(2),
);
// After argv: --help and usage errors must answer anywhere, not only inside a jj repository
// (outside one, `jj root` failed before Cleye ever saw --help — 2026-10-06, a plain git clone).
const rootRun = await $`jj root`.quiet().nothrow();
if (rootRun.exitCode !== 0)
  die(
    `not inside a jj repository (jj root: ${rootRun.stderr.toString().trim()}) — run this from a jj checkout`,
  );
const root = rootRun.stdout.toString().trim();
process.chdir(root);
function isAgxWorkspace(workspaceRoot: string): boolean {
  const workspaceList = Bun.spawnSync(["jj", "workspace", "list"], {
    cwd: workspaceRoot,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  if (workspaceList.exitCode !== 0)
    die(
      `cannot inspect jj workspaces: ${workspaceList.stderr.toString().trim()}`,
      1,
    );
  const current = resolve(workspaceRoot);
  const currentName = basename(current);
  for (const line of workspaceList.stdout.toString().split("\n")) {
    if (line.trim() === "") continue;
    const separator = line.indexOf(":");
    if (separator < 0) die(`cannot parse jj workspace entry: ${line}`, 1);
    const name = line.slice(0, separator).trim();
    const otherRoot = Bun.spawnSync(
      ["jj", "workspace", "root", "--name", name],
      { cwd: workspaceRoot, stdout: "pipe", stderr: "pipe", timeout: 10_000 },
    );
    if (otherRoot.exitCode !== 0)
      die(
        `cannot inspect jj workspace ${name}: ${otherRoot.stderr.toString().trim()}`,
        1,
      );
    if (
      resolve(otherRoot.stdout.toString().trim()) !== current &&
      currentName.startsWith(
        `${basename(resolve(otherRoot.stdout.toString().trim()))}-arm-`,
      )
    ) {
      return true;
    }
  }
  return false;
}
const agxWorkspace = isAgxWorkspace(root);
const explicitBookmark = parsed.flags.bookmark !== "";
if (agxWorkspace && !explicitBookmark)
  die(
    "agx workspace commit needs an explicit target: pass `--bookmark <name>` or set `BOOKMARK`; trunk targets must go through `mise run land`",
    1,
  );
const bookmark = parsed.flags.bookmark !== "" ? parsed.flags.bookmark : "alpha";
if (agxWorkspace) {
  const trunkRevset = "trunk()";
  const trunkBookmarks =
    await $`jj --ignore-working-copy log --no-graph -r ${trunkRevset} -T ${"bookmarks"}`
      .quiet()
      .nothrow();
  if (trunkBookmarks.exitCode !== 0)
    die(
      `cannot inspect repository trunk: ${trunkBookmarks.stderr.toString().trim()}`,
      1,
    );
  const configuredTrunk = trunkBookmarks.stdout
    .toString()
    .split(/[\\s,]+/u)
    .filter(Boolean);
  const isTrunk = new Set(["alpha", "main", "trunk", ...configuredTrunk]).has(
    bookmark,
  );
  if (isTrunk)
    die(
      `cannot move trunk bookmark '${bookmark}' from an agx workspace; use mise run land`,
      1,
    );
}
const { records, push } = parsed.flags;
const named: string[] = [...parsed._];
const msg =
  parsed.flags.file !== ""
    ? await Bun.file(parsed.flags.file).text()
    : parsed.flags.message;
if (msg.trim() === "") die("-m <message> or -F <file> is required");
for (const path of named) {
  if (!validPath(path))
    die(`invalid repo-relative path: ${JSON.stringify(path)}`);
}

// snapshot, then the paths changed in @ relative to @-
// jj silently leaves new files above snapshot.max-new-file-size untracked (only a warning on
// stderr); a commit that proceeds would drop them from history without error. Refuse instead.
const snap = await $`jj status`.quiet().nothrow();
if (snap.exitCode !== 0)
  die(`snapshot failed: ${snap.stderr.toString().trim()}`);
if (snap.stderr.toString().includes("Refused to snapshot"))
  die(
    `jj refused to snapshot some files (size limit); raise snapshot.max-new-file-size or ignore them:\n${snap.stderr.toString().trim()}`,
  );
// Both sides of a rename: `--name-only` prints only the destination, so a moved file's deletion was
// never staged or committed — the gate then linted the vanished source (2026-10-01).
const at = async (r: string) =>
  (
    await $`jj --ignore-working-copy log --no-graph -r ${r} -T ${"commit_id"}`.text()
  ).trim();
const rev = await at("@");
const base = await at("@-");
if (!/^[0-9a-f]{40,64}$/u.test(base))
  die("the snapshot must have exactly one parent");
const changed = jjChanged({ root, rev, base, paths: ["."] });
const known = [...new Set([...jjFiles(rev, root), ...jjFiles(base, root)])];
for (const path of named) {
  if (!known.some((candidate) => selected([path], candidate)))
    die(`path is absent from the snapshot and base: ${JSON.stringify(path)}`);
}

const wanted = new Set<string>();
function addRecordPaths(): void {
  for (const path of changed) {
    if (!path.startsWith("research_record/")) continue;
    const match = path.match(/^research_record\/runs\/([^/]+)\//u);
    if (match === null) {
      wanted.add(path);
      continue;
    }
    if (existsSync(`research_record/runs/${match[1]}.json`)) wanted.add(path);
  }
}
if (records) addRecordPaths();
// Preserve explicit paths, order and duplicates byte-for-byte in the consumer interface.
// --records appends its resolved changed files; it never expands an explicitly named directory.
const sel = [
  ...named,
  ...[...wanted].toSorted().filter((path) => !named.includes(path)),
];
if (!changed.some((path) => selected(sel, path)))
  die("no changed path selected (name paths after -- or use --records)");
console.log(`jj-commit: ${sel.length} path(s)`);

const tmp = mkdtempSync(join(tmpdir(), "jj-precommit-"));
const pathsFile = join(tmp, "paths");
await Bun.write(pathsFile, `${sel.join("\0")}\0`);
// The gate's output goes straight to the caller's stdout/stderr, never through a Bun Shell pipe:
// that pipe is non-blocking, and a gate that prints a lot (soks's okf: ~400 lines) died mid-write
// with "failed printing to stdout: Resource temporarily unavailable (os error 11)", refusing every
// commit while the same gate passed when run directly. It is the caller's to read anyway.
// bounded: the repo's own gate; each task it runs carries its own bound.
const gate = Bun.spawn(["mise", "run", "--jobs", "1", "hook:pre-commit"], {
  stdin: "ignore",
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
    PRECOMMIT_VCS: "jj",
    PRECOMMIT_PATHS_FILE: pathsFile,
    PRECOMMIT_REV: rev,
    PRECOMMIT_BASE: base,
  },
});
const gateCode = await gate.exited.finally(() => {
  rmSync(tmp, { recursive: true, force: true });
});
if (gateCode !== 0) die("hook:pre-commit refused; nothing committed", 1);

async function rerunGate(revision: string, parent: string): Promise<void> {
  const rerunDir = mkdtempSync(join(tmpdir(), "jj-precommit-rebase-"));
  const rerunPaths = join(rerunDir, "paths");
  await Bun.write(rerunPaths, `${sel.join("\0")}\0`);
  const rerun = Bun.spawn(["mise", "run", "--jobs", "1", "hook:pre-commit"], {
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      PRECOMMIT_VCS: "jj",
      PRECOMMIT_PATHS_FILE: rerunPaths,
      PRECOMMIT_REV: revision,
      PRECOMMIT_BASE: parent,
    },
  });
  const code = await rerun.exited.finally(() => {
    rmSync(rerunDir, { recursive: true, force: true });
  });
  if (code !== 0)
    die(
      "hook:pre-commit refused the rebased commit; commit kept, not pushed",
      1,
    );
}

// Reject changed candidate bytes or a changed parent after the gate checked an immutable snapshot.
const selection = filesets(sel);
const drift =
  await $`jj diff --from ${rev} --to @ --name-only -- ${selection}`.text();
if (drift !== "" || (await at("@-")) !== base)
  die(
    "selected paths or parent changed during hook:pre-commit; rerun the gate",
    1,
  );
await $`jj commit -m ${msg} -- ${selection}`;
await $`jj bookmark set ${bookmark} -r @-`.nothrow();
// A concurrent jj operation by another writer (agents snapshot the shared working copy) can be
// reconciled so that the bookmark move is lost (observed 2026-10-01). Verify, and re-apply once.
if ((await at(bookmark)) !== (await at("@-"))) {
  await $`jj bookmark set ${bookmark} -r @-`.nothrow();
  if ((await at(bookmark)) !== (await at("@-")))
    die(`bookmark ${bookmark} did not move to @- (concurrent operation?)`, 1);
}

// receipts
const tpl =
  'commit_id.short() ++ " " ++ change_id.short() ++ " " ++ description.first_line() ++ "\\n"';
await $`jj log --no-graph -r @- -T ${tpl}`;
console.log((await $`jj diff -r @- --stat`.text()).trim().split("\n").at(-1));
await $`jj bookmark list ${bookmark}`;

async function rebaseCandidate(
  candidate: string,
  remoteId: string,
  remote: string,
): Promise<string> {
  const competing = remoteId.slice(0, 12);
  console.error(
    `jj-commit: push race with competing commit ${competing}; rebasing ${candidate.slice(0, 12)} onto ${remote}`,
  );
  const rebase = await $`jj rebase -b ${bookmark} -d ${remote}`.nothrow();
  if (rebase.exitCode !== 0) {
    const conflicts = (await $`jj status`.nothrow().text()).trim();
    die(
      `push race with competing commit ${competing}; rebase conflicted. Resolve the listed paths with \`jj resolve\`, then run \`jj git push --bookmark ${bookmark} --remote origin\`:\n${conflicts}`,
      1,
    );
  }
  const rebased = await at(bookmark);
  const rebasedPaths = (
    await $`jj diff --from ${candidate} --to ${rebased} --name-only`.text()
  )
    .trim()
    .split("\n")
    .filter((path) => path !== "");
  const invalidated = rebasedPaths.filter((path) => selected(sel, path));
  if (invalidated.length > 0) {
    await rerunGate(rebased, remoteId);
    console.log(
      `jj-commit: pre-commit gate rerun because rebase changed selected path(s): ${invalidated.join(", ")}`,
    );
  } else {
    console.log(
      "jj-commit: rebase was clean and touched no selected paths; pre-commit gate not rerun",
    );
  }
  return rebased;
}

async function pushWithRetry(): Promise<void> {
  const remote = `${bookmark}@origin`;
  const original = await at(bookmark);
  let candidate = original;
  const maxAttempts = 3;
  let landed = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const fetched = await $`jj git fetch --remote origin`.quiet().nothrow();
    if (fetched.exitCode !== 0)
      die(
        `push race recovery: fetch failed before attempt ${attempt}/${maxAttempts}; competing commit unknown`,
        1,
      );
    // A rejected push can leave local and tracking refs conflicted. Keep our rebased candidate
    // explicit while the remote tracking ref advances.
    await $`jj bookmark set ${bookmark} -r ${candidate} --allow-backwards`
      .quiet()
      .nothrow();
    await $`jj bookmark track ${remote}`.quiet().nothrow();
    const remoteId = (
      await $`jj log --no-graph -r ${`present(${remote})`} -T ${"commit_id"}`
        .nothrow()
        .text()
    ).trim();
    const localId = await at(bookmark);
    const competingCommits =
      remoteId === ""
        ? ""
        : (
            await $`jj log --no-graph -r ${`${remote} ~ ::${bookmark}`} -T ${'commit_id ++ "\\n"'}`
              .nothrow()
              .text()
          ).trim();
    if (remoteId !== "" && remoteId !== localId && competingCommits !== "") {
      candidate = await rebaseCandidate(candidate, remoteId, remote);
    }
    // In a colocated repo jj refreshes Git HEAD/index after the push; another writer's index.lock
    // can fail that refresh AFTER the remote moved. Judge by the remote bookmark, not exit alone.
    const r =
      await $`jj git push --bookmark ${bookmark} --remote origin`.nothrow();
    const onRemote = (
      await $`jj log --no-graph -r ${`${bookmark} & ${bookmark}@origin`} -T ${'"x"'}`
        .nothrow()
        .text()
    ).trim();
    if (onRemote === "x" && r.exitCode !== 0)
      console.log(
        "jj-commit: push landed; the local Git refresh failed (index.lock) and is re-imported by the next jj command",
      );
    if (onRemote === "x") {
      landed = true;
      break;
    }
    const latest = (
      await $`jj log --no-graph -r ${`present(${remote})`} -T ${"commit_id"}`
        .nothrow()
        .text()
    ).trim();
    if (attempt === maxAttempts)
      die(
        `push race with competing commit ${latest === "" ? "unknown" : latest.slice(0, 12)}; retry limit ${maxAttempts} reached (local commit ${original.slice(0, 12)} kept, not pushed)`,
        1,
      );
    console.error(
      `jj-commit: push race with competing commit ${latest === "" ? "unknown" : latest.slice(0, 12)}; fetching and retrying (${attempt + 1}/${maxAttempts})`,
    );
  }
  if (!landed)
    die(
      `push race: ${bookmark} was not pushed after ${maxAttempts} attempts`,
      1,
    );
  await $`jj bookmark list ${bookmark} --all-remotes`;
}
if (push) await pushWithRetry();

// post-commit: warm the search index (fail-open, same as .githooks/post-commit)
if (existsSync(".githooks/post-commit"))
  await $`.githooks/post-commit`.nothrow();
