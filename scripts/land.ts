// Consumer: human/agent. Stage verdicts; stop on the first failure. Test seams are executable
// paths LAND_MISE and LAND_SSH (argv is never interpreted by a local shell).
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { cli } from "cleye";
import { err, ok, ResultAsync, safeTry } from "neverthrow";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import {
  filesets,
  validPath,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";
import { LAND_HOSTS } from "./config-registry.ts";

const emit = (text: string): void => {
  process.stdout.write(`${text}\n`);
};
const reject = (reason: string) => err(new Error(reason));
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("FATAL: unknown option --__proto__\n");
    process.exit(2);
  }
};

function run(cwd: string, argv: string[]): ResultAsync<string, Error> {
  return safeTry(async function* () {
    const signal = AbortSignal.timeout(600_000);
    const child = Bun.spawn(argv, {
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal,
    });
    const [stdout, stderr, code] = yield* ResultAsync.fromPromise(
      Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]),
      (error: unknown) => new Error(errorMessage(error)),
    );
    if (signal.aborted || code !== 0) {
      // Preserve hook refusal lines and the real process exit status, without a shell pipe.
      process.stderr.write(`${stdout.slice(-131072)}${stderr.slice(-131072)}`);
      return reject(
        `${argv[0]} exited ${code}${signal.aborted ? " (timeout)" : ""}`,
      );
    }
    if (stderr.includes("Refused to snapshot")) return reject(stderr.trim());
    return ok(stdout);
  });
}

const jj = (cwd: string, argv: string[]) =>
  run(cwd, ["jj", "--no-pager", "--color", "never", ...argv]);
const read = (cwd: string, argv: string[]) =>
  jj(cwd, ["--ignore-working-copy", "--at-operation=@", ...argv]);
const at = (cwd: string, rev: string, template = "commit_id") =>
  read(cwd, ["log", "--no-graph", "-r", rev, "-T", template]).map((text) =>
    text.trim(),
  );

function paths(
  cwd: string,
  from: string,
  to: string,
): ResultAsync<string[], Error> {
  return safeTry(async function* () {
    // TreeDiffEntry.source/target retain BOTH sides of renames, including embedded newlines.
    const raw = yield* read(cwd, [
      "diff",
      "--from",
      from,
      "--to",
      to,
      "-T",
      'source.path() ++ "\\0" ++ target.path() ++ "\\0"',
    ]);
    const result = [
      ...new Set(raw.split("\0").filter((path) => path !== "")),
    ].toSorted();
    if (!result.every((path) => validPath(path)))
      return reject("diff contains invalid repository paths");
    return ok(result);
  });
}

function overlap(left: string[], right: string[]): string[] {
  return left.filter((a) =>
    right.some(
      (b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`),
    ),
  );
}

const previewFilter = (src: string) => basename(src) !== "node_modules";

function previewCopies(
  primary: string,
  worker: string,
  tmp: string,
): { main: string; worker: string } {
  const copyMain = join(tmp, "main");
  const copyWorker = join(tmp, "worker");
  cpSync(primary, copyMain, { recursive: true, filter: previewFilter });
  cpSync(worker, copyWorker, { recursive: true, filter: previewFilter });
  // Colocated stores may use an absolute Git target. Keep every preview write in the copy.
  writeFileSync(
    join(copyMain, ".jj", "repo", "store", "git_target"),
    join(copyMain, ".git"),
  );
  writeFileSync(join(copyWorker, ".jj", "repo"), join(copyMain, ".jj", "repo"));
  return { main: copyMain, worker: copyWorker };
}

function format(root: string, changed: string[]): ResultAsync<void, Error> {
  return safeTry(async function* () {
    // Skip deletions, directories and symlinks: formatting a symlink could write outside the set.
    const existing = changed.filter(
      (path) =>
        existsSync(join(root, path)) && lstatSync(join(root, path)).isFile(),
    );
    const groups = [
      { extensions: [".ts"], command: ["bunx", "--bun", "oxfmt"] },
      { extensions: [".md"], command: ["rumdl", "fmt"] },
      {
        extensions: [".sh", ".bash", ".zsh"],
        command: [
          "shfmt",
          "-w",
          "-ln",
          "bash",
          "-i",
          "2",
          "-ci",
          "-sr",
          "-bn",
          "-s",
        ],
      },
    ];
    for (const group of groups) {
      const selected = existing.filter((path) =>
        group.extensions.includes(extname(path)),
      );
      // ./ forces a leading dash filename to be a path for every formatter.
      if (selected.length > 0)
        yield* run(root, [
          ...group.command,
          ...selected.map((path) => `./${path}`),
        ]);
    }
    return ok(undefined);
  });
}

async function main(): Promise<number> {
  const parsed = cli({
    name: "land",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: ["<workspace-name>"],
    flags: {
      message: { type: String, alias: "m" },
      hosts: { type: String },
      smoke: { type: String },
      dryRun: { type: Boolean, default: false },
    },
  });
  let stage = "preflight";
  let commit: string | undefined;
  let tmp: string | undefined;
  const hostResults = new Map<string, string>();
  const captured = await attempt(() =>
    safeTry(async function* () {
      if (parsed._.length !== 1 || (parsed.flags.message?.trim() ?? "") === "")
        return reject("one workspace and -m <message> are required");
      const hosts =
        parsed.flags.hosts === undefined
          ? [...LAND_HOSTS]
          : parsed.flags.hosts.split(",");
      if (
        hosts.length === 0 ||
        hosts.some((host) => !/^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/u.test(host))
      )
        return reject("hosts must be non-empty SSH aliases");
      for (const host of hosts) hostResults.set(host, "pending");
      const root = (yield* read(process.cwd(), ["workspace", "root"])).trim();
      const repoEntry = join(root, ".jj", "repo");
      const repo = lstatSync(repoEntry).isFile()
        ? realpathSync(
            resolve(dirname(repoEntry), readFileSync(repoEntry, "utf8").trim()),
          )
        : realpathSync(repoEntry);
      let mainRoot = dirname(dirname(repo));
      let workerRoot = (yield* read(root, [
        "workspace",
        "root",
        "--name",
        parsed._[0] ?? "",
      ])).trim();
      if (workerRoot === mainRoot || !existsSync(workerRoot))
        return reject(
          "worker workspace must exist and differ from the main checkout",
        );
      tmp = parsed.flags.dryRun
        ? mkdtempSync(join(tmpdir(), "land-preview-"))
        : undefined;
      if (tmp !== undefined) {
        const copies = previewCopies(mainRoot, workerRoot, tmp);
        mainRoot = copies.main;
        workerRoot = copies.worker;
      }
      yield* jj(workerRoot, ["status"]);
      yield* jj(mainRoot, ["status"]);
      const alpha = yield* at(mainRoot, "alpha");
      if ((yield* at(workerRoot, "@", "conflict")) !== "false")
        return reject("workspace change has conflicts");
      const initial = yield* paths(workerRoot, "@-", "@");
      if (initial.length === 0) return reject("workspace change is empty");
      const dirty = yield* paths(mainRoot, "@-", "@");
      const refused = overlap(initial, dirty);
      if (refused.length > 0)
        return reject(
          `dirty main checkout overlaps: ${JSON.stringify(refused)}`,
        );
      if ((yield* at(mainRoot, "@-", "commit_id")) !== alpha)
        return reject(
          "main checkout parent must be alpha; run mise run pull first",
        );
      emit(
        "[land] preflight: ok workspace is non-empty, conflict-free and disjoint",
      );
      stage = "rebase";
      yield* jj(workerRoot, ["rebase", "-r", "@", "-o", alpha]);
      if ((yield* at(workerRoot, "@", "conflict")) !== "false")
        return reject("rebase introduced conflicts");
      emit(
        `[land] rebase: ok ${parsed.flags.dryRun ? "preview " : ""}onto alpha`,
      );
      stage = "paths";
      const changed = yield* paths(workerRoot, alpha, "@");
      if (changed.length === 0)
        return reject("workspace change is empty after rebase");
      const collisions = overlap(changed, dirty);
      if (collisions.length > 0)
        return reject(
          `dirty main checkout overlaps: ${JSON.stringify(collisions)}`,
        );
      emit(`[land] paths: ok ${JSON.stringify(changed)}`);
      stage = "restore";
      const rev = yield* at(workerRoot, "@");
      if (!parsed.flags.dryRun)
        yield* jj(mainRoot, [
          "restore",
          "--from",
          rev,
          "--",
          ...filesets(changed),
        ]);
      emit(
        `[land] restore: ok ${parsed.flags.dryRun ? "would restore" : "restored"} ${changed.length} paths`,
      );
      stage = "format";
      if (!parsed.flags.dryRun) yield* format(mainRoot, changed);
      emit(
        `[land] format: ok ${parsed.flags.dryRun ? "would format existing paths" : "formatted existing paths"}`,
      );
      stage = "commit";
      if (!parsed.flags.dryRun) {
        const before = yield* at(mainRoot, "@-");
        const committed = await run(mainRoot, [
          process.env.LAND_MISE ?? "mise",
          "run",
          "commit",
          "--",
          "-m",
          parsed.flags.message ?? "",
          "--push",
          "--",
          ...changed,
        ]);
        const after = await at(mainRoot, "@-");
        if (after.isOk() && after.value !== before) commit = after.value;
        if (committed.isErr()) return committed;
        if (after.isErr()) return after;
        commit = after.value;
      }
      emit(`[land] commit: ok ${commit ?? "would gated commit --push"}`);
      stage = "deploy";
      for (const host of hosts) {
        if (parsed.flags.dryRun) {
          hostResults.set(host, "would pull, deps and smoke");
          emit(`[land] deploy: ok ${host} preview`);
          continue;
        }
        const command = `cd ~/dotfiles && mise run pull && mise run deps${parsed.flags.smoke === undefined ? "" : ` && ( ${parsed.flags.smoke}\n)`}`;
        const deployed = await run(mainRoot, [
          process.env.LAND_SSH ?? "ssh",
          "-o",
          "BatchMode=yes",
          host,
          command,
        ]);
        hostResults.set(host, deployed.isOk() ? "ok" : "FAIL");
        if (deployed.isErr())
          return reject(`${host}: ${errorMessage(deployed.error)}`);
        emit(`[land] deploy: ok ${host}`);
      }
      return ok(undefined);
    }),
  ).finally(() => {
    if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true });
  });
  const result = captured.ok
    ? captured.value
    : reject(errorMessage(captured.error));
  if (result.isErr())
    emit(`[land] ${stage}: FAIL ${errorMessage(result.error)}`);
  emit(
    `[land] summary: ${result.isOk() ? "ok" : "FAIL"} commit=${commit ?? "none"} hosts=${JSON.stringify(Object.fromEntries(hostResults))}`,
  );
  return result.isOk() ? 0 : 1;
}

if (import.meta.main)
  process.exitCode = await main().catch((error: unknown) => {
    process.stderr.write(`FATAL: ${errorMessage(error)}\n`);
    return 2;
  });
