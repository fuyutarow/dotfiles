// jj-commit.ts — the gated commit entrypoint of a colocated jj repository whose commit gates are
// Git-index based (the `hook:pre-commit` verb). jj does not run Git hooks, so a bare `jj commit`
// skips every gate. This script:
//   1. snapshots the working copy and selects the paths to commit (named paths and/or --records),
//   2. stages EXACTLY those paths in the Git index and runs `mise run --jobs 1 hook:pre-commit`
//      (fmt:staged, polysearch pre-commit, ... read that index),
//   3. `jj commit`s exactly those paths (root-file filesets), sets the bookmark to @- explicitly,
//   4. prints receipts, optionally pushes the named bookmark, and runs .githooks/post-commit.
//
//   mise run commit -- -m "<message>" [--records] [--push] [-- <path>...]
//   mise run commit -- -F <message-file> ...
//
// --records  every changed path under research_record/ (@ vs @-), EXCLUDING the directory of a run
//            whose research_record/runs/<id>.json does not exist yet (a run in flight: commit only
//            finished run dirs).
// --push     then `jj git push --bookmark $BOOKMARK --remote origin`.
// BOOKMARK   env, default alpha.
// Exit: 0 committed · 1 the gate refused (nothing committed) · 2 usage or empty selection.
import { $ } from "bun";
import { existsSync } from "node:fs";
import { cli } from "cleye";
import { summaryPaths } from "./jj-summary.ts";

const die = (m: string, code = 2): never => {
  console.error(`jj-commit: ${m}`);
  process.exit(code);
};

const root = (await $`jj root`.text()).trim();
process.chdir(root);
const bookmark = process.env.BOOKMARK ?? "alpha";

// strictFlags alone lets --__proto__ reach type-flag before the unknown-flag check (BG1).
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") die(`unknown option '--${flag}'`);
};

const parsed = cli(
  {
    name: "jj-commit.ts",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: ["[paths...]", "--", "[rest...]"],
    help: { description: "Gated jj commit of exactly the named paths (see the header comment)." },
    flags: {
      message: { type: String, alias: "m", default: "", description: "commit message" },
      file: { type: String, alias: "F", default: "", description: "read the commit message from this file" },
      records: { type: Boolean, default: false, description: "select finished research_record/ paths" },
      push: { type: Boolean, default: false, description: "push the bookmark to origin afterwards" },
    },
  },
  undefined,
  Bun.argv.slice(2),
);
const { records, push } = parsed.flags;
const named: string[] = [...parsed._];
const msg = parsed.flags.file ? await Bun.file(parsed.flags.file).text() : parsed.flags.message;
if (!msg.trim()) die("-m <message> or -F <file> is required");

// snapshot, then the paths changed in @ relative to @-
// jj silently leaves new files above snapshot.max-new-file-size untracked (only a warning on
// stderr); a commit that proceeds would drop them from history without error. Refuse instead.
const snap = await $`jj status`.quiet().nothrow();
if (snap.stderr.toString().includes("Refused to snapshot"))
  die(`jj refused to snapshot some files (size limit); raise snapshot.max-new-file-size or ignore them:\n${snap.stderr.toString().trim()}`);
// Both sides of a rename: `--name-only` prints only the destination, so a moved file's deletion was
// never staged or committed — the gate then linted the vanished source (2026-10-01).
const changed = summaryPaths(await $`jj diff -r @ --summary`.text());

const wanted = new Set<string>();
if (records) {
  for (const p of changed) {
    const m = p.match(/^research_record\/runs\/([^/]+)\//);
    if (m) {
      if (existsSync(`research_record/runs/${m[1]}.json`)) wanted.add(p);
    } else if (p.startsWith("research_record/")) wanted.add(p);
  }
}
for (const raw of named) {
  const p = raw.replace(/\/+$/, "");
  for (const c of changed) if (c === p || c.startsWith(`${p}/`)) wanted.add(c);
}
const sel = [...wanted].sort();
if (sel.length === 0) die("no changed path selected (name paths after -- or use --records)");
console.log(`jj-commit: ${sel.length} path(s)`);

// feed the index-based gates with exactly these paths, then the gate .githooks/pre-commit runs
await $`git reset -q`;
await $`git add -A --pathspec-from-file=- --pathspec-file-nul < ${new Response(sel.join("\0"))}`;
const gate = await $`mise run --jobs 1 hook:pre-commit`.nothrow();
if (gate.exitCode !== 0) die("hook:pre-commit refused; nothing committed", 1);

// fmt:staged may have rewritten files in place; jj snapshots them. Commit exactly the selection.
const filesets = sel.map((c) => `root-file:${JSON.stringify(c)}`);
await $`jj commit -m ${msg} ${filesets}`;
await $`jj bookmark set ${bookmark} -r @-`.nothrow();
// A concurrent jj operation by another writer (agents snapshot the shared working copy) can be
// reconciled so that the bookmark move is lost (observed 2026-10-01). Verify, and re-apply once.
const at = async (r: string) => (await $`jj log --no-graph -r ${r} -T ${"commit_id"}`.nothrow().text()).trim();
if ((await at(bookmark)) !== (await at("@-"))) {
  await $`jj bookmark set ${bookmark} -r @-`.nothrow();
  if ((await at(bookmark)) !== (await at("@-"))) die(`bookmark ${bookmark} did not move to @- (concurrent operation?)`, 1);
}

// receipts
const tpl = 'commit_id.short() ++ " " ++ change_id.short() ++ " " ++ description.first_line() ++ "\\n"';
await $`jj log --no-graph -r @- -T ${tpl}`;
console.log((await $`jj diff -r @- --stat`.text()).trim().split("\n").at(-1));
await $`jj bookmark list ${bookmark}`;

if (push) {
  // In a colocated repo jj refreshes Git HEAD/index after the push; another writer's index.lock
  // (polysearch LAND runs `git add`) can fail that refresh AFTER the remote moved (observed
  // 2026-09-30). Judge the push by the remote bookmark, not by the exit code.
  const r = await $`jj git push --bookmark ${bookmark} --remote origin`.nothrow();
  const onRemote = (await $`jj log --no-graph -r ${`${bookmark} & ${bookmark}@origin`} -T ${'"x"'}`.nothrow().text()).trim();
  if (onRemote !== "x") die(`push failed (exit ${r.exitCode}); ${bookmark}@origin is not at ${bookmark}`, 1);
  if (r.exitCode !== 0) console.log("jj-commit: push landed; the local Git refresh failed (index.lock) and is re-imported by the next jj command");
  await $`jj bookmark list ${bookmark} --all-remotes`;
}

// `git reset -q` above drops the stat cache of every index entry; until refreshed, every tracked file
// looks possibly-modified to Git clients, and polysearch's changed-file scan then streamed hundreds of
// files through `git cat-file --batch-check` and deadlocked on the pipe (observed 2026-10-01). Refresh it.
await $`git update-index -q --refresh`.quiet().nothrow();

// post-commit: warm the search index (fail-open, same as .githooks/post-commit)
if (existsSync(".githooks/post-commit")) await $`.githooks/post-commit`.nothrow();
