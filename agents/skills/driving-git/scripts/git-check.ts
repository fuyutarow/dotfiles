// git-check — the deterministic floor for git OPERATIONS (driving-git).
//
// **THIS IS NOT A SEMANTIC CHECK.** It cannot tell you whether a commit is the RIGHT commit, whether
// a rewrite is worth its blast radius, or what the message should say — that is judgment
// (SKILL.md G1–G4). What it does is print the observables those gates key on, and refuse when a
// state the gates forbid is present. It exists because every state it detects is SILENT: git
// prints nothing when you commit on the wrong branch, nothing when a peer's paused rebase has
// reverted the working tree under you, nothing when `push -q` hangs on a 882 MB blob, and
// nothing when `--amend --only` re-reads a file from disk that you meant to drop.
//
// Subcommands (each prints one machine-readable line first, details after):
//   state   — branch, HEAD, in-progress operation, dirty/untracked/stash counts, ahead/behind,
//             worktree. Exit 1 when an operation is paused, paths are unmerged, or HEAD is detached (G2).
//   staged  — every staged path with its blob size; flags blobs over --max-bytes (default 50 MB)
//             and secret-shaped names. Exit 1 on any flag, or when nothing is staged (G1).
//   push    — `git push <remote> <branch>` with a wall-clock timeout, never quiet, then the
//             RECEIPT: local tip == remote-tracking tip. Exit 1 on timeout or mismatch (G4).
//             `--lease <sha>` adds `--force-with-lease=<branch>:<sha>` (explicit expect: a background
//             fetch cannot widen it; `--force-if-includes` is a documented no-op with this form).
//   lint    — scan scripts/config for the deny-list idioms (checkout, add -A, push -f, push -q,
//             reset --hard, clean -f, --no-verify, filter-branch, gc --prune=now, -Xtheirs).
//             Comment lines are skipped: a mention is not an action. Exit 1 on findings.
//
// Exit: 0 clean, 1 findings/refusal, 2 FATAL (not a git repo, git missing, bad args).

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { $ } from "bun";
import { cli } from "cleye";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

const fatal = (msg: string): never => {
  process.stdout.write(`FATAL ${msg}\n`);
  process.exit(2);
};

/** Trimmed stdout of a git command in `cwd`; undefined on non-zero exit. */
async function git(cwd: string, ...args: string[]): Promise<string | undefined> {
  const r = await $`git -C ${cwd} ${args}`.quiet().nothrow();
  return r.exitCode === 0 ? r.stdout.toString().trim() : undefined;
}

async function repoRoot(cwd: string): Promise<{ top: string; gitDir: string }> {
  const top = await git(cwd, "rev-parse", "--show-toplevel");
  const gitDirRaw = await git(cwd, "rev-parse", "--git-dir");
  if (top === undefined || gitDirRaw === undefined) return fatal(`not a git repository: ${cwd}`);
  // --git-dir is per-worktree (…/.git/worktrees/<name>), which is exactly where a paused
  // rebase's sentinel lives for THIS checkout. Resolve relative forms against cwd, not top.
  return { top, gitDir: resolve(cwd, gitDirRaw) };
}

// ---------------------------------------------------------------- state (G2)

/** The sentinel files git leaves while an operation is paused. Names are git's own. */
const OPERATIONS: readonly (readonly [string, string])[] = [
  ["rebase-merge", "rebase"],
  ["rebase-apply", "rebase/am"],
  ["MERGE_HEAD", "merge"],
  ["CHERRY_PICK_HEAD", "cherry-pick"],
  ["REVERT_HEAD", "revert"],
  ["BISECT_LOG", "bisect"],
];

async function state(cwd: string, allowDetached: boolean): Promise<number> {
  const { top, gitDir } = await repoRoot(cwd);
  const ops = OPERATIONS.filter(([f]) => existsSync(join(gitDir, f))).map(([, n]) => n);
  const branch = (await git(cwd, "symbolic-ref", "--short", "-q", "HEAD")) ?? "DETACHED";
  const head = (await git(cwd, "rev-parse", "--short", "HEAD")) ?? "unborn";
  const porcelain = (await git(cwd, "status", "--porcelain=v2", "--branch")) ?? "";
  const lines = porcelain.split("\n").filter((l) => l !== "");
  const entries = lines.filter((l) => !l.startsWith("#"));
  const untracked = entries.filter((l) => l.startsWith("?")).length;
  // `u` rows are unmerged paths. They outlive a `stash pop` conflict with NO sentinel file, so the
  // op check alone would call the tree clean (found by running this on the dotfiles repo, 2026-09-21).
  const unmerged = entries.filter((l) => l.startsWith("u ")).length;
  const dirty = entries.length - untracked;
  const ab = lines.find((l) => l.startsWith("# branch.ab"))?.split(" ") ?? [];
  const ahead = ab[2]?.replace("+", "") ?? "?";
  const behind = ab[3]?.replace("-", "") ?? "?";
  const upstream = lines.find((l) => l.startsWith("# branch.upstream"))?.split(" ")[2] ?? "-";
  const stash = ((await git(cwd, "stash", "list")) ?? "").split("\n").filter((l) => l !== "").length;
  const worktrees = ((await git(cwd, "worktree", "list", "--porcelain")) ?? "")
    .split("\n")
    .filter((l) => l.startsWith("worktree ")).length;

  process.stdout.write(
    `STATE branch=${branch} head=${head} op=${ops.length === 0 ? "none" : ops.join("+")} ` +
      `dirty=${dirty} unmerged=${unmerged} untracked=${untracked} stash=${stash} upstream=${upstream} ` +
      `ahead=${ahead} behind=${behind} worktrees=${worktrees} top=${top}\n`,
  );
  let rc = 0;
  if (ops.length > 0) {
    process.stdout.write(
      `REFUSE G2: an operation is paused (${ops.join(", ")}) in ${gitDir}. In a shared checkout this is a global stop: finish it (--continue), abort it (--abort), or wait for its owner. Do not launch anything that reads tracked files.\n`,
    );
    rc = 1;
  }
  if (unmerged > 0) {
    process.stdout.write(
      `REFUSE G2: ${unmerged} unmerged path(s) (conflict markers, often from a stash pop). Resolve and \`git add -- <path>\`, or \`git restore --merge -- <path>\`, before any commit.\n`,
    );
    rc = 1;
  }
  if (branch === "DETACHED" && !allowDetached) {
    process.stdout.write(
      `REFUSE G2: HEAD is detached at ${head}. A commit here is reachable only through the reflog. \`git switch -c <branch>\` first, or pass --allow-detached for a deliberate inspection.\n`,
    );
    rc = 1;
  }
  return rc;
}

// ---------------------------------------------------------------- staged (G1)

/** Names that should never enter history without a human saying so. Case-insensitive on the basename. */
const SECRET_SHAPED = [
  /^\.env(\..+)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /credentials?(\.json|\.ya?ml|\.toml)?$/i,
  /secrets?(\.json|\.ya?ml|\.toml)?$/i,
  /\.(netrc|npmrc|pypirc)$/i,
  /^\.?token$/i,
];

async function staged(cwd: string, maxBytes: number): Promise<number> {
  await repoRoot(cwd);
  const raw = (await git(cwd, "diff", "--cached", "--name-status", "-z")) ?? "";
  const fields = raw.split("\0").filter((f) => f !== "");
  // -z output: STATUS\0path\0 for A/M/D/T; STATUS\0src\0dst\0 for R/C (status carries a score).
  const paths: { status: string; path: string }[] = [];
  for (let i = 0; i < fields.length; ) {
    const status = fields[i] ?? "";
    const kind = status[0] ?? "";
    if (kind === "R" || kind === "C") {
      paths.push({ status: kind, path: fields[i + 2] ?? "" });
      i += 3;
    } else {
      paths.push({ status: kind, path: fields[i + 1] ?? "" });
      i += 2;
    }
  }
  if (paths.length === 0) {
    process.stdout.write("STAGED count=0 bytes=0 max=0\nREFUSE G1: nothing is staged. Enumerate paths and `git add -- <paths>` (or `git add -p`) before committing; a commit built by `-a`/`-A` is not enumerated.\n");
    return 1;
  }
  const rows: { path: string; status: string; bytes: number }[] = [];
  for (const { status, path } of paths) {
    if (status === "D") {
      rows.push({ path, status, bytes: 0 });
      continue;
    }
    const size = await git(cwd, "cat-file", "-s", `:${path}`);
    rows.push({ path, status, bytes: size === undefined ? 0 : Number(size) });
  }
  const total = rows.reduce((a, r) => a + r.bytes, 0);
  const largest = rows.reduce((a, r) => (r.bytes > a.bytes ? r : a), rows[0] ?? { path: "", status: "", bytes: 0 });
  process.stdout.write(`STAGED count=${rows.length} bytes=${total} max=${largest.bytes} largest=${largest.path}\n`);
  let rc = 0;
  for (const r of rows) {
    const base = r.path.split("/").pop() ?? r.path;
    const flags: string[] = [];
    if (r.bytes > maxBytes) flags.push(`OVER-SIZE ${r.bytes} > ${maxBytes}`);
    if (SECRET_SHAPED.some((re) => re.test(base))) flags.push("SECRET-SHAPED name");
    process.stdout.write(`  ${r.status} ${String(r.bytes).padStart(11)}  ${r.path}${flags.length > 0 ? `   <-- ${flags.join("; ")}` : ""}\n`);
    if (flags.length > 0) rc = 1;
  }
  if (rc !== 0) {
    process.stdout.write(
      `REFUSE G1: unstage the flagged paths (\`git restore --staged -- <path>\`) or state in the commit why they belong. GitHub refuses blobs over 100 MB and the push hangs silently under -q; secrets pushed once must be rotated, not just removed.\n`,
    );
  }
  return rc;
}

// ---------------------------------------------------------------- push (G4)

async function push(cwd: string, remote: string, branch: string, timeoutS: number, lease: string | undefined): Promise<number> {
  await repoRoot(cwd);
  const local = await git(cwd, "rev-parse", branch);
  if (local === undefined) return fatal(`no local branch ${branch}`);
  const args = ["push", remote, branch];
  if (lease !== undefined) args.push(`--force-with-lease=${branch}:${lease}`);
  process.stdout.write(`PUSH ${remote} ${branch} local=${local.slice(0, 12)} timeout=${timeoutS}s${lease === undefined ? "" : ` lease=${lease.slice(0, 12)}`}\n`);
  // Native timeout (writing-bun-scripts facts §3). SIGKILL, because a push wedged in send-pack
  // is exactly the process that ignores politer signals. Timed out = signalCode set; `killed`
  // is true after a CLEAN exit too and must not be read.
  const proc = Bun.spawn(["git", "-C", cwd, ...args], {
    stdout: "inherit",
    stderr: "inherit",
    timeout: timeoutS * 1000,
    killSignal: "SIGKILL",
  });
  const code = await proc.exited;
  if (code !== 0) {
    const how = proc.signalCode !== null ? ` (killed by ${proc.signalCode} at the ${timeoutS}s timeout)` : "";
    process.stdout.write(`REFUSE G4: push exited ${code}${how}. A silent or hanging push is a failed push: check staged blob sizes (\`git-check staged\` on the commits), \`git ls-tree -r -l HEAD\`, and \`pgrep -a 'git push'\` for zombies.\n`);
    return 1;
  }
  const tracking = await git(cwd, "rev-parse", `refs/remotes/${remote}/${branch}`);
  if (tracking !== local) {
    process.stdout.write(`REFUSE G4: push returned 0 but ${remote}/${branch}=${tracking ?? "missing"} != local ${local}. Run \`git fetch ${remote} ${branch}\` and compare before claiming done.\n`);
    return 1;
  }
  process.stdout.write(`RECEIPT ${remote}/${branch}=${tracking.slice(0, 12)} == local\n`);
  return 0;
}

// ---------------------------------------------------------------- lint (deny-list)

/** Deny-list idioms as they appear in scripts, aliases, hooks, and task bodies. */
const DENY: readonly (readonly [string, RegExp, string])[] = [
  ["CHECKOUT", /\bgit\s+checkout\b/, "git switch / git restore"],
  ["ADD-ALL", /\bgit\s+add\s+(-A|--all|\.|:\/)(\s|$)/, "enumerate paths; git add -p"],
  ["FORCE-PUSH", /\bgit\s+push\b(?![^\n]*--force-with-lease)[^\n]*(\s-f\b|\s--force\b)/, "--force-with-lease=<ref>:<sha>"],
  ["QUIET-PUSH", /\bgit\s+push\b[^\n]*(\s-q\b|\s--quiet\b)/, "never quiet a push; timeout + rev-parse receipt"],
  ["RESET-HARD", /\bgit\s+reset\s+(--hard|--merge)\b/, "safety ref first; git restore for files"],
  ["CLEAN-FORCE", /\bgit\s+clean\b(?![^\n]*(\s-[a-zA-Z]*n|--dry-run))[^\n]*\s-[a-zA-Z]*f/, "preview the same enumerated paths and ignore flags with -n first"],
  ["NO-VERIFY", /--no-verify\b/, "fix what the hook reports"],
  ["FILTER-BRANCH", /\bgit\s+filter-branch\b/, "git filter-repo"],
  ["PRUNE-NOW", /\b(gc|prune)\b[^\n]*--prune=now|--expire=now/, "measure first; preserve recovery history; select maintenance tasks only in an idle common object store"],
  ["THEIRS-MERGE", /-X\s*theirs\b/, "resolve conflicts; rerere"],
  ["AMEND-ONLY", /--amend\b[^\n]*\s(-o|--only)\b|\s(-o|--only)\b[^\n]*--amend\b/, "git rm --cached then --amend --no-edit"],
];

function lint(paths: string[]): number {
  let rc = 0;
  for (const p of paths) {
    const abs = resolve(p);
    if (!existsSync(abs)) return fatal(`no such file: ${p}`);
    if (statSync(abs).isDirectory()) return fatal(`lint takes files, not directories: ${p}`);
    const src = readFileSync(abs, "utf8");
    let inAlias = false; // gitconfig [alias] bodies omit the `git` prefix: `co = checkout`
    src.split("\n").forEach((raw, i) => {
      const t = raw.trimStart();
      if (t.startsWith("#") || t.startsWith("//") || t.startsWith("*") || t.startsWith("<!--")) return; // a mention is not an action
      if (/^\[/.test(t)) inAlias = /^\[alias\]/i.test(t);
      let line = raw;
      const alias = inAlias ? /^\s*[\w.-]+\s*=\s*(!?)\s*(.*)$/.exec(raw) : null;
      if (alias !== null) line = alias[1] === "!" ? (alias[2] ?? "") : `git ${alias[2] ?? ""}`;
      for (const [tag, re, fix] of DENY) {
        if (re.test(line)) {
          process.stdout.write(`DENY ${tag} ${p}:${i + 1}: ${t.slice(0, 110)}\n      -> ${fix}\n`);
          rc = 1;
        }
      }
    });
  }
  process.stdout.write(rc === 0 ? "LINT clean\n" : "LINT findings above; each is a deny-list idiom (driving-git SKILL.md)\n");
  return rc;
}

// ---------------------------------------------------------------- cli

async function main(): Promise<number> {
const argv = cli({
  name: "git-check",
  ignoreArgv: rejectPrototypeFlag,
  strictFlags: true,
  parameters: ["<subcommand>", "[args...]"],
  flags: {
    cwd: { type: String, default: process.cwd(), description: "repository path (default: cwd)" },
    allowDetached: { type: Boolean, default: false, description: "state: a detached HEAD is deliberate" },
    maxBytes: { type: Number, default: 50_000_000, description: "staged: largest blob allowed (bytes)" },
    timeout: { type: Number, default: 120, description: "push: seconds before the push is killed" },
    lease: { type: String, description: "push: expected remote sha for --force-with-lease=<branch>:<sha>" },
  },
  help: {
    description: "Floor checks for git operations — prints the observables the driving-git gates key on.",
    examples: [
      "git-check state",
      "git-check staged --max-bytes 50000000",
      "git-check push origin alpha",
      "git-check push origin feat --lease 0123abcd",
      "git-check lint git/gitconfig .githooks/pre-commit",
    ],
  },
}, undefined, Bun.argv.slice(2));

const sub = argv._.subcommand;
const rest = argv._.args;
const cwd = resolve(argv.flags.cwd);

return await (async (): Promise<number> => {
  if (sub === "state") return state(cwd, argv.flags.allowDetached);
  if (sub === "staged") return staged(cwd, argv.flags.maxBytes);
  if (sub === "push") {
    const [remote, branch] = rest;
    if (remote === undefined || branch === undefined) return fatal("push needs <remote> <branch>");
    return push(cwd, remote, branch, argv.flags.timeout, argv.flags.lease);
  }
  if (sub === "lint") {
    if (rest.length === 0) return fatal("lint needs at least one file");
    return lint(rest);
  }
  return fatal(`unknown subcommand ${sub} (state | staged | push | lint)`);
})();
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`FATAL: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  });
