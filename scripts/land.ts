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

type HostExecution = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

type HostExecutionResult =
  | { ok: true; value: HostExecution }
  | { ok: false; reason: string };

async function runHost(
  cwd: string,
  argv: string[],
): Promise<HostExecutionResult> {
  const result = await attempt(async () => {
    const signal = AbortSignal.timeout(600_000);
    const child = Bun.spawn(argv, {
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal,
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { code, stdout, stderr, timedOut: signal.aborted };
  });
  return result.ok ? result : { ok: false, reason: errorMessage(result.error) };
}

function extractSmoke(
  stdout: string,
  begin: string,
  end: string,
): { output: string; smoke: string | undefined } {
  const beginToken = `\n${begin}\n`;
  const endToken = `\n${end}\n`;
  const start = stdout.lastIndexOf(beginToken);
  if (start < 0) return { output: stdout, smoke: undefined };
  const finish = stdout.indexOf(endToken, start + beginToken.length);
  if (finish < 0) return { output: stdout, smoke: undefined };
  return {
    output: stdout.slice(0, start) + stdout.slice(finish + endToken.length),
    smoke: stdout.slice(start + beginToken.length, finish).trim(),
  };
}

function printSmoke(host: string, smoke: string | undefined): void {
  if (smoke === undefined) return;
  emit(`[land] smoke: ${host}${smoke === "" ? " (empty)" : ""}`);
  if (smoke !== "") emit(smoke);
}

function hostDiagnostic(stderr: string): string {
  return stderr.trim().replaceAll(/\s+/gu, " ").slice(-1000);
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
      message: {
        type: String,
        alias: "m",
        description: "Commit message for the landed workspace.",
      },
      smoke: {
        type: String,
        description:
          "Run this command on each deployed host after pull and deps, and print its output.",
      },
      dryRun: {
        type: Boolean,
        default: false,
        description:
          "Preview the landing and host results without committing or deploying.",
      },
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
      for (const host of LAND_HOSTS)
        hostResults.set(
          host.alias,
          host.deploy ? "pending" : `skipped (${host.reason ?? "disabled"})`,
        );
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
      const smokeBegin = `__LAND_SMOKE_BEGIN_${process.pid}__`;
      const smokeEnd = `__LAND_SMOKE_END_${process.pid}__`;
      for (const host of LAND_HOSTS) {
        if (!host.deploy) {
          const reason = host.reason ?? "disabled";
          hostResults.set(host.alias, `skipped (${reason})`);
          emit(`[land] deploy: skipped ${host.alias} (${reason})`);
          continue;
        }
        if (parsed.flags.dryRun) {
          hostResults.set(host.alias, "would pull, deps and smoke");
          emit(`[land] deploy: ok ${host.alias} preview`);
          continue;
        }
        const smokeStep =
          parsed.flags.smoke === undefined
            ? ""
            : ` && { printf '\\n${smokeBegin}\\n'; ( ${parsed.flags.smoke}\n ) 2>&1; _land_smoke_status=$?; printf '\\n${smokeEnd}\\n'; exit "$_land_smoke_status"; }`;
        const command = `cd ~/dotfiles && mise run pull && mise run deps${smokeStep}`;
        const deployed = await runHost(mainRoot, [
          process.env.LAND_SSH ?? "ssh",
          "-o",
          "BatchMode=yes",
          host.alias,
          command,
        ]);
        if (!deployed.ok) {
          const state = `FAIL ${deployed.reason}`;
          hostResults.set(host.alias, state);
          emit(`[land] deploy: FAIL ${host.alias}: ${deployed.reason}`);
          continue;
        }
        const capturedSmoke = extractSmoke(
          deployed.value.stdout,
          smokeBegin,
          smokeEnd,
        );
        printSmoke(host.alias, capturedSmoke.smoke);
        const diagnostic = hostDiagnostic(deployed.value.stderr);
        if (deployed.value.timedOut) {
          const reason = `SSH command timed out${diagnostic === "" ? "" : `: ${diagnostic}`}`;
          hostResults.set(host.alias, `FAIL ${reason}`);
          emit(`[land] deploy: FAIL ${host.alias}: ${reason}`);
          continue;
        }
        if (deployed.value.code === 255) {
          const reason = diagnostic.length > 0 ? diagnostic : "ssh exited 255";
          hostResults.set(host.alias, `unreachable ${reason}`);
          emit(`[land] deploy: unreachable ${host.alias}: ${reason}`);
          continue;
        }
        if (deployed.value.code !== 0) {
          const reason = `remote command exited ${deployed.value.code}${diagnostic === "" ? "" : `: ${diagnostic}`}`;
          hostResults.set(host.alias, `FAIL ${reason}`);
          emit(`[land] deploy: FAIL ${host.alias}: ${reason}`);
          continue;
        }
        hostResults.set(host.alias, "ok");
        emit(`[land] deploy: ok ${host.alias}`);
      }
      const failedHosts = [...hostResults.values()].some(
        (status) =>
          status.startsWith("FAIL ") || status.startsWith("unreachable "),
      );
      if (failedHosts) return reject("one or more host deployments failed");
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
