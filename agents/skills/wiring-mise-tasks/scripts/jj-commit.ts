// jj-commit.ts — the gated commit entrypoint of a jj repository. jj does not run Git hooks, so a bare `jj commit`
// skips every gate. This script:
//   1. snapshots the working copy and selects the paths to commit (named paths and/or --records),
//   2. passes PRECOMMIT_VCS=jj, PRECOMMIT_PATHS_FILE (NUL-delimited), PRECOMMIT_REV (@ commit ID)
//      and PRECOMMIT_BASE (@- commit ID) to `mise run --jobs 1 hook:pre-commit`,
//   3. `jj commit`s exactly those paths (literal root filesets), sets the bookmark to @- explicitly,
//   4. prints receipts, optionally pushes the named bookmark, and runs .githooks/post-commit.
//
//   mise run commit -- -m "<message>" [--records] [--push] [-- <path>...]
//   mise run commit -- -F <message-file> ...
//
// --records  every changed path under research_record/ (@ vs @-), EXCLUDING the directory of a run
//            whose research_record/runs/<id>.json does not exist yet (a run in flight: commit only
//            finished run dirs).
// --push     then `jj git push --bookmark $BOOKMARK --remote origin` — fast-forward only: it fetches
//            first and refuses (exit 1, commit kept) when $BOOKMARK@origin is not an ancestor.
// BOOKMARK   env, default alpha.
// Exit: 0 committed · 1 the gate refused (nothing committed) · 2 usage or empty selection.
import { $ } from "bun";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const bookmark = process.env.BOOKMARK ?? "alpha";

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

if (push) {
  // Fast-forward only. `jj git push` moves a bookmark SIDEWAYS whenever the remote still matches the
  // last fetch, i.e. it force-pushes; on 2026-10-06 that dropped two commits from alpha@origin that
  // the local alpha did not contain. Fetch, and refuse unless the remote bookmark is an ancestor.
  await $`jj git fetch --remote origin`.quiet().nothrow();
  const remote = `${bookmark}@origin`;
  const exists = (
    await $`jj log --no-graph -r ${`present(${remote})`} -T ${'"x"'}`
      .nothrow()
      .text()
  ).trim();
  const behind = (
    await $`jj log --no-graph -r ${`::${remote} ~ ::${bookmark}`} -T ${'commit_id.short() ++ " " ++ description.first_line() ++ "\\n"'}`
      .nothrow()
      .text()
  ).trim();
  if (exists === "x" && behind !== "")
    die(
      `not pushed: ${remote} has commits ${bookmark} lacks (a push would drop them) — run \`mise run pull\`, then push:\n${behind}`,
      1,
    );
  // In a colocated repo jj refreshes Git HEAD/index after the push; another writer's index.lock
  // (polysearch LAND runs `git add`) can fail that refresh AFTER the remote moved (observed
  // 2026-09-30). Judge the push by the remote bookmark, not by the exit code.
  const r =
    await $`jj git push --bookmark ${bookmark} --remote origin`.nothrow();
  const onRemote = (
    await $`jj log --no-graph -r ${`${bookmark} & ${bookmark}@origin`} -T ${'"x"'}`
      .nothrow()
      .text()
  ).trim();
  if (onRemote !== "x")
    die(
      `push failed (exit ${r.exitCode}); ${bookmark}@origin is not at ${bookmark}`,
      1,
    );
  if (r.exitCode !== 0)
    console.log(
      "jj-commit: push landed; the local Git refresh failed (index.lock) and is re-imported by the next jj command",
    );
  await $`jj bookmark list ${bookmark} --all-remotes`;
}

// post-commit: warm the search index (fail-open, same as .githooks/post-commit)
if (existsSync(".githooks/post-commit"))
  await $`.githooks/post-commit`.nothrow();
