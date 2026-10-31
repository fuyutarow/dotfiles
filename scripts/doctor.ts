import { DoctorStatus } from "@dotfiles/shared/src/doctor-record.ts";
// `mise run doctor` — does THIS machine realize what the dotfiles declare? READ-ONLY: every check
// compares a declared source of truth against the live machine and changes nothing. Consumer: a
// human or agent reading verdict lines; each FAIL carries the command that repairs it.
//
// It owns no rules of its own. Each check delegates to the file that already owns the fact:
//   rip-graveyard tools/disk-reclaim/src/lib/graveyards.ts
//                                                effective path is disk-backed and within its size cap
//   links       scripts/link-dots.ts --check     every declared symlink realized, no dangling ones
//   rendered    scripts/render-home.ts           ~/.claude/settings.json, ~/.codex/hooks.json and
//                                                ~/.claude/CLAUDE.md == a fresh render
//   skills      scripts/skills-doctor.ts + tool homes
//                                                repo skill policy, copied Codex skills, no repo links
//   brew        Brewfile.core                    core tools installed on every OS
//   brew-ondemand Brewfile.ondemand              on-demand formulas and casks installed (INFO only)
//   deps        package.json + node_modules      every pinned dependency installed at its pin
//   bins        package.json `bin`               each PATH command in ~/.bun/bin resolves here;
//                                                no dangling link left by a renamed bin
//   git-hooks   .githooks                        core.hooksPath points at it
//   login-shell zsh                              the account's login shell is zsh
//   mise-scope  scripts/test-mise-scope.ts       INV-6: no implicit global toolchain
//   bun-floor   package.json engines.bun         PATH, mise and Homebrew binaries satisfy the minimum
//   mcp         .mcp.json                        every declared server registered in Claude Code
//   codex-config agents/codex/config.declared.toml + .mcp.json
//                                                Codex settings and managed MCP entries match declarations
//   codex-remote agents/codex/app-server.toml     Codex daemon remote control (mobile app) as declared
//   wslconfig   wsl/wslconfig.win   (WSL only)   %USERPROFILE%\.wslconfig is a byte-equal copy
//   wsl-gpu-path environment.d      (WSL only)   systemd user manager PATH contains WSL GPU tools
//   ccc-daemon  cocoindex unit      (Linux)      enabled in default.target and active
//   capacity-guard WSL timer       (WSL only)   autonomous host recovery timer is enabled and active
//   ccc-db-map  zsh/zshenv + unit                the ccc daemon relocates index DBs exactly as
//                                                this shell does (`ccc doctor` DB path mappings)
//   edge-policy edge/policy.plist.mac (mac only) the live Edge managed policy is a byte-equal copy
//   smart-open  ssh/config + tools/shared/src/sockets.ts
//                                                r99-u24's RemoteForward joins the two socket paths
//                                                smart-open and its receiver actually use (the
//                                                remote name carrying the alias), on attach only
//   iterm2      iterm2/             (mac only)   iTerm2 loads its prefs from this repo
//
// NO FLAGS, NO DEPENDENCIES — deliberate, like render-home.ts: the machine being
// diagnosed may be half set up (no node_modules yet), and that is exactly when this must run.
// With no argv read there is no Cleye boundary to owe (writing-bun-scripts BG1). Inputs come from
// the environment so tests can point it at fixtures:
//   DOTFILES      repo root         (default: this script's checkout)
//   HOME          machine root      (default: os.homedir())
//   DOCTOR_ONLY   comma list of check names to run (default: all that apply to this OS)
//
// Verdicts: PASS · FAIL (declared ≠ live; a `fix:` line follows) · INFO (on-demand drift, no failure)
// · WARN (could not be decided,
// e.g. a probe timed out — never reported as PASS) · SKIP (does not apply here; the reason prints,
// so a green run can never be mistaken for one that checked something).
// Exit: 0 no FAIL · 1 at least one FAIL · 2 FATAL (the doctor itself broke).

import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  statfs,
  writeFile,
  access,
} from "node:fs/promises";
import { constants, type Stats } from "node:fs";
import { consola } from "consola";
import { bunRequirement, checkBunRuntime } from "./bun-runtime.ts";
export { checkBunRuntime } from "./bun-runtime.ts";
import { ownerlessRefLocks } from "@dotfiles/shared/src/ref-locks.ts";
import { homedir, hostname, release, tmpdir, userInfo } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { registeredRepos } from "./workspace-repos.ts";
import {
  MAPPING_ENV,
  parseMapping,
} from "../tools/repo-retrieve/src/ccc-db-dir.ts";
import {
  attempt,
  attemptOr,
  errorMessage,
  type Attempt,
} from "../agents/hooks/attempt.ts";
import { renderedForPlatform, resolveRole } from "./config-registry.ts";
import { googleDriveTargets } from "./link-dots.ts";
import { brewPrefix, coreCommands, corePathProblems } from "./core-tools.ts";
import {
  checkCoreFloor,
  coreFloorIO,
  type FloorIO,
} from "../tools/tool-tiers/src/core-floor.ts";
import {
  declaredToolCommands,
  findToolCommandShadows,
} from "../tools/tool-tiers/src/tool-tiers.ts";
import { configHome, declaredProvider } from "../agents/codex/runtime.ts";
import { danglingRepoBins } from "./deps-prune.ts";
import { obj } from "../agents/hooks/narrow.ts";
import { jsonOf, jsonText } from "../agents/hooks/zod.ts";
import {
  drift,
  readDeclared,
  readLive,
} from "../agents/codex/remote-control.ts";
import {
  drift as sandboxNetworkDrift,
  readDeclared as readSandboxNetworkDeclared,
  readLive as readSandboxNetworkLive,
} from "../agents/codex/sandbox-network.ts";
import {
  editorHost,
  receiverSocket,
  remoteSocket,
} from "@dotfiles/shared/src/sockets.ts";
import {
  inspectRipGraveyard,
  RIP_GRAVEYARD_MAX_BYTES,
} from "../tools/disk-reclaim/src/lib/graveyards.ts";
import { TMPFS_RECLAIM_PERCENT, tmpfsUsage } from "./wsl-capacity-recover.ts";
import {
  RECOVER_UNITS,
  recoverJournalFailure,
} from "../tools/statusline/src/recover-health.ts";

type Verdict = "PASS" | "FAIL" | "WARN" | "SKIP" | "INFO";
export type Finding = {
  name: string;
  verdict: Verdict;
  detail: string;
  lines?: string[];
  fix?: string;
};
export type Ctx = {
  home: string;
  dotfiles: string;
  isMac: boolean;
  isWsl: boolean;
  mountInfo?: string;
  /** Plain Linux carries core only; on-demand tools are installed as needed. */
  isCoreBox: boolean;
};

// Generous on purpose: a doctor exists to be exhaustive, and a cap of 8 once hid the one dangling
// link among 22 fresh-machine drifts. Past the cap the overflow is counted, never silently dropped.
const LIST_CAP = 40;

function effectiveConfig(s: string): string {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"))
    .join("\n");
}

function editorTarget(lines: string[]): string[] {
  return ["hostname", "port", "user"].map(
    (k) => lines.find((l) => l.startsWith(`${k} `)) ?? `${k} ?`,
  );
}

// Bounded child: native AbortSignal timeout, both pipes drained in ONE Promise.all (a sequential
// drain deadlocks on the unread pipe), timeout read off the signal (writing-bun-scripts BG2).
async function run(
  cmd: string[],
  opts: { ms: number; env?: Record<string, string>; cwd?: string },
): Promise<{
  code: number;
  out: string;
  err: string;
  timedOut: boolean;
  missing: boolean;
}> {
  if (Bun.which(cmd[0] ?? "") === null) {
    return { code: 127, out: "", err: "", timedOut: false, missing: true };
  }
  const sig = AbortSignal.timeout(opts.ms);
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    signal: sig,
    env: { ...process.env, ...opts.env },
    ...(opts.cwd !== undefined && opts.cwd !== "" ? { cwd: opts.cwd } : {}),
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err, timedOut: sig.aborted, missing: false };
}

const capped = (items: string[]): string[] =>
  items.length <= LIST_CAP
    ? items
    : [...items.slice(0, LIST_CAP), `… and ${items.length - LIST_CAP} more`];

const pass = (name: string, detail: string): Finding => ({
  name,
  verdict: "PASS",
  detail,
});
const info = (name: string, detail: string): Finding => ({
  name,
  verdict: "INFO",
  detail,
});
const skip = (name: string, detail: string): Finding => ({
  name,
  verdict: "SKIP",
  detail,
});
const warn = (name: string, detail: string): Finding => ({
  name,
  verdict: "WARN",
  detail,
});
const fail = (
  name: string,
  detail: string,
  fix: string,
  lines: string[] = [],
): Finding => ({
  name,
  verdict: "FAIL",
  detail,
  fix,
  lines: capped(lines),
});

// The parsed JSON as `unknown` (null = missing or not JSON); each caller reads it through obj().
async function readJson(path: string): Promise<unknown> {
  const text = await attemptOr(() => readFile(path, "utf8"), null);
  if (text === null) return null;
  const decoded = jsonText.safeParse(text);
  return decoded.success ? decoded.data : null;
}

export async function checkLinks(ctx: Ctx): Promise<Finding> {
  const r = await run(
    [process.execPath, join(ctx.dotfiles, "scripts/link-dots.ts"), "--check"],
    {
      ms: 30_000,
      env: { HOME: ctx.home, DOTFILES: ctx.dotfiles },
    },
  );
  if (r.timedOut)
    return warn("links", "link-dots.ts --check timed out after 30s");
  const driftLines = r.out.split("\n").filter((l) => l.startsWith("drift: "));
  if (r.code === 0 && driftLines.length === 0) {
    return pass(
      "links",
      "every link declared in scripts/link-dots.ts is realized",
    );
  }
  if (driftLines.length === 0) {
    return warn(
      "links",
      `link-dots.ts --check exited ${r.code} without a drift line`,
    );
  }
  return fail(
    "links",
    `${driftLines.length} declared link(s) not realized`,
    "mise run link:dots",
    driftLines.map((l) => l.slice("drift: ".length)),
  );
}

export async function checkGoogleDrive(ctx: Ctx): Promise<Finding> {
  if (!ctx.isMac && !ctx.isWsl)
    return skip("google-drive", "Google Drive links apply to macOS and WSL");
  if (ctx.isWsl) {
    const mountInfo =
      ctx.mountInfo ??
      ((await fileExists("/proc/self/mountinfo"))
        ? await readFile("/proc/self/mountinfo", "utf8")
        : "");
    const mounted = mountInfo
      .split("\n")
      .some((line) => line.split(" ")[4] === "/mnt/g");
    if (!mounted)
      return fail(
        "google-drive",
        "Windows Google Drive G: is not mounted at /mnt/g",
        "mise run wsl:drive-mount && sudo mount /mnt/g",
        ["/mnt/g is not a mounted filesystem"],
      );
  }
  const targets = googleDriveTargets(ctx.home, ctx.isMac ? "mac" : "wsl", {
    persistCache: false,
  });
  const problems: string[] = [];
  for (const [name, target] of [
    ["Google Drive", targets.root],
    ["Personal-Drive", targets.personal],
  ] as const) {
    const path = join(ctx.home, name);
    const statResult = await lstatOrUndefined(path);
    if (!statResult.ok)
      return warn(
        "google-drive",
        `check crashed: ${errorMessage(statResult.error)}`,
      );
    const stat = statResult.value;
    const actual =
      (stat?.isSymbolicLink() ?? false) ? await readlink(path) : undefined;
    if (target === undefined)
      problems.push(`${name}: Drive target unavailable or ambiguous`);
    else if (actual !== target)
      problems.push(
        `${name}: want symlink to ${target}, have ${actual ?? "no symlink"}`,
      );
  }
  return problems.length === 0
    ? pass(
        "google-drive",
        "both home links resolve to the discovered Drive root and private collection",
      )
    : fail(
        "google-drive",
        `${problems.length} Google Drive link problem(s)`,
        "mise run link:dots (ensure Drive is mounted/signed in first)",
        problems,
      );
}

async function fileExists(path: string): Promise<boolean> {
  return (await attempt(() => access(path, constants.F_OK))).ok;
}
async function lstatOrUndefined(path: string): Promise<Attempt<Stats | null>> {
  const result = await attempt(() => lstat(path));
  if (result.ok) return { ok: true, value: result.value };
  return obj(result.error)?.["code"] === "ENOENT"
    ? { ok: true, value: null }
    : { ok: false, error: result.error };
}

export async function checkRipGraveyard(
  ctx: Ctx,
  inspect: typeof inspectRipGraveyard = inspectRipGraveyard,
): Promise<Finding> {
  const declaration = await readFile(join(ctx.dotfiles, "zsh/zshenv"), "utf8");
  const lines = declaration.split("\n");
  const hasRipDeclaration =
    lines.filter((line) => line === 'export RIP_GRAVEYARD="$GRAVEYARD"')
      .length === 1;
  const hasGraveyardDeclaration =
    lines.filter(
      (line) =>
        line ===
        'export GRAVEYARD="${XDG_DATA_HOME:-$HOME/.local/share}/graveyard"',
    ).length === 1;
  const hasDeclaration = hasRipDeclaration && hasGraveyardDeclaration;
  const xdgDataEnv = process.env["XDG_DATA_HOME"];
  const xdgData =
    xdgDataEnv === undefined || xdgDataEnv === ""
      ? join(ctx.home, ".local/share")
      : xdgDataEnv;
  const configured = hasDeclaration ? join(xdgData, "graveyard") : undefined;
  const effective = configured ?? join(ctx.home, ".local/share/graveyard");
  const problems: string[] = [];
  if (configured === undefined)
    problems.push(
      `GRAVEYARD and RIP_GRAVEYARD are not both declared in zshenv; expected ${effective}`,
    );
  if (!isAbsolute(effective))
    problems.push(`effective location is not absolute: ${effective}`);
  const measured = await attempt(() => inspect(effective));
  if (!measured.ok) {
    problems.push(
      `cannot inspect ${effective}: ${errorMessage(measured.error)}`,
    );
  } else {
    if (measured.value.ramBacked)
      problems.push(`${effective} is on tmpfs/ramfs`);
    if (measured.value.bytes > RIP_GRAVEYARD_MAX_BYTES) {
      const qualifier = measured.value.complete ? "" : "at least ";
      problems.push(
        `${effective} is ${qualifier}${measured.value.bytes} bytes; limit is ${RIP_GRAVEYARD_MAX_BYTES}`,
      );
    }
  }

  let scanWarning: string | undefined;
  if (measured.ok && !measured.value.complete) {
    const reason = measured.value.timedOut ? "time limit" : "scan limit";
    scanWarning = `${effective} measured at least ${measured.value.bytes} bytes across ${measured.value.visited} entries; ${reason} reached after ${measured.value.elapsedMs} ms, so the 10 GiB limit could not be confirmed`;
  }
  if (scanWarning !== undefined && problems.length === 0) {
    return warn("rip-graveyard", scanWarning);
  }

  return problems.length === 0
    ? pass(
        "rip-graveyard",
        `${effective} is disk-backed and within the ${RIP_GRAVEYARD_MAX_BYTES}-byte limit`,
      )
    : fail(
        "rip-graveyard",
        `${problems.length} graveyard problem(s)`,
        "source the updated shell config, then run mise run reclaim",
        problems,
      );
}

export async function checkRipGraveyardTmp(): Promise<Finding> {
  const root = process.env["DOCTOR_TEST_TMP_ROOT"] ?? "/tmp";
  const entries = await attempt(async () =>
    (await readdir(root))
      .filter((name) => name.startsWith("graveyard-"))
      .map((name) => join(root, name)),
  );
  if (!entries.ok)
    return fail(
      "rip-graveyard-tmp",
      `cannot inspect ${root}: ${errorMessage(entries.error)}`,
      "disk-reclaim plan",
    );
  if (entries.value.length === 0)
    return pass("rip-graveyard-tmp", "no leftover /tmp graveyard");
  return fail(
    "rip-graveyard-tmp",
    `leftover RAM graveyard(s): ${entries.value.join(", ")}`,
    "disk-reclaim run --tier blind --yes",
  );
}

// Every file scripts/render-home.ts writes (scripts/config-registry.ts RENDERED), as a path under
// HOME. JSON ones compare as values (and name the differing top-level keys); text byte-for-byte.

/** Why the deployed `live` is not the fresh render `want` (empty when it is). */
async function renderedDiff(
  rel: string,
  json: boolean,
  live: string,
  want: string,
): Promise<string[]> {
  if (!(await fileExists(live)) || (await lstat(live)).isSymbolicLink())
    return [`${rel}: missing, or still a symlink into the repo`];
  if (!json)
    return (await readFile(live, "utf8")) === (await readFile(want, "utf8"))
      ? []
      : [`${rel}: differs from a fresh render`];
  const have = await readJson(live);
  if (have === null) return [`${rel}: not JSON`];
  const wantObj = obj(await readJson(want)) ?? {};
  const haveObj = obj(have) ?? {};
  const keys = new Set([...Object.keys(wantObj), ...Object.keys(haveObj)]);
  return [...keys]
    .filter((k) => !Bun.deepEquals(wantObj[k], haveObj[k], true))
    .map((k) => `${rel}: top-level key differs: ${k}`);
}

export async function checkRendered(ctx: Ctx): Promise<Finding> {
  const renderedFiles = renderedForPlatform(!ctx.isMac).map((r) => ({
    rel: r.dest,
    json: r.dest.endsWith(".json"),
  }));
  if (!(await fileExists(join(ctx.dotfiles, "scripts/render-home.ts")))) {
    return skip("rendered", "no scripts/render-home.ts in this checkout");
  }
  const scratch = await mkdtemp(join(tmpdir(), "doctor-rendered-"));
  await using _scratch = {
    [Symbol.asyncDispose]: async () =>
      rm(scratch, { recursive: true, force: true }),
  };
  // Let the renderer apply its own allowlist to the deployed settings in the scratch home.
  // Copy bytes, never a symlink; renderedDiff still reports a deployed symlink as drift.
  const deployedSettings = join(ctx.home, ".claude/settings.json");
  if (await fileExists(deployedSettings)) {
    const seeded = await attempt(async () => {
      await mkdir(join(scratch, ".claude"), { recursive: true });
      await writeFile(
        join(scratch, ".claude/settings.json"),
        await readFile(deployedSettings),
      );
    });
    if (!seeded.ok)
      return warn(
        "rendered",
        `cannot read deployed settings: ${errorMessage(seeded.error)}`,
      );
  }
  const r = await run(
    [
      join(ctx.dotfiles, "scripts/bun-exec.sh"),
      join(ctx.dotfiles, "scripts/render-home.ts"),
    ],
    {
      ms: 30_000,
      env: {
        HOME: scratch,
        COMMAND_TARGET_HOME: ctx.home,
        DOTFILES_BUN_PATH: process.execPath,
        DOTFILES: ctx.dotfiles,
        CLAUDE_SETTINGS_PRIVATE: join(
          ctx.home,
          ".claude",
          "settings.private.json",
        ),
      },
    },
  );
  if (r.timedOut || r.code !== 0) {
    return warn(
      "rendered",
      `could not render a reference copy (exit ${r.code}): ${(r.out + r.err).trim()}`,
    );
  }
  const details = (
    await Promise.all(
      renderedFiles.map(async ({ rel, json }) =>
        renderedDiff(rel, json, join(ctx.home, rel), join(scratch, rel)),
      ),
    )
  ).flat();
  if (details.length > 0) {
    return fail(
      "rendered",
      "a rendered file in $HOME is not a fresh render of the repo's declarations",
      "mise run link:dots",
      details,
    );
  }
  return pass(
    "rendered",
    `${renderedFiles.map((f) => `~/${f.rel}`).join(", ")} match a fresh render`,
  );
}

export async function checkSkills(ctx: Ctx): Promise<Finding> {
  const r = await run(["bun", join(ctx.dotfiles, "scripts/skills-doctor.ts")], {
    ms: 30_000,
    env: {
      DOTFILES: ctx.dotfiles,
      HOME: ctx.home,
      SKILLS_DOCTOR_MACHINE: "1",
    },
  });
  if (r.timedOut) return warn("skills", "skills-doctor.ts timed out after 30s");
  if (r.code !== 0) {
    const bad = (r.out + r.err)
      .split("\n")
      .filter((line) => /FAIL|❌/iu.test(line));
    return fail(
      "skills",
      "an in-house skill copy is missing, stale, linked, or the retired plugin remains installed",
      "mise run skills:sync",
      bad,
    );
  }
  return pass(
    "skills",
    "in-house Claude and Codex copies match the repository; dotfiles plugin is absent",
  );
}

export async function checkBrew(ctx: Ctx): Promise<Finding> {
  const file = "Brewfile.core";
  const r = await run(
    [
      "brew",
      "bundle",
      "check",
      "--file",
      join(ctx.dotfiles, file),
      "--no-upgrade",
      "--verbose",
    ],
    { ms: 180_000 },
  );
  if (r.missing)
    return fail(
      "brew",
      "Homebrew is required for core tools but is not on PATH",
      "install Homebrew (README → bootstrap), then mise run install:tools; Linux: mise run linux:migrate-brew",
    );
  if (r.timedOut) return warn("brew", "brew bundle check timed out after 180s");
  if (r.code === 0) return pass("brew", `every ${file} entry is installed`);
  const missing = (r.out + r.err)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("→"))
    .map((l) => l.replace(/^→\s*/u, ""));
  return fail(
    "brew",
    `${missing.length > 0 ? missing.length : "some"} Brewfile.core entr(y/ies) not installed`,
    "mise run install:tools",
    missing,
  );
}

export async function checkBrewOndemand(ctx: Ctx): Promise<Finding> {
  const file = "Brewfile.ondemand";
  const result = await run(
    [
      "brew",
      "bundle",
      "check",
      "--file",
      join(ctx.dotfiles, file),
      "--no-upgrade",
      "--verbose",
    ],
    { ms: 180_000 },
  );
  if (result.missing)
    return info(
      "brew-ondemand",
      "Homebrew is unavailable; on-demand declarations were not checked (formulas: mise run tool:get <cmd>; casks: mise run install:tools)",
    );
  if (result.timedOut)
    return warn("brew-ondemand", "brew bundle check timed out after 180s");
  if (result.code === 0)
    return pass(
      "brew-ondemand",
      "all on-demand formulas and casks are installed",
    );
  const missing = (result.out + result.err)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("→"))
    .map((line) => line.replace(/^→\s*/u, ""));
  return info(
    "brew-ondemand",
    `${missing.length > 0 ? missing.join(", ") : "on-demand declarations are missing"}; formulas: mise run tool:get <cmd>; casks: mise run install:tools`,
  );
}

export async function checkDeps(ctx: Ctx): Promise<Finding> {
  const pkg = await readJson(join(ctx.dotfiles, "package.json"));
  if (pkg === null) return skip("deps", "no package.json in this checkout");
  const pkgObj = obj(pkg);
  const pins: Record<string, string> = Object.fromEntries(
    [pkgObj?.["dependencies"], pkgObj?.["devDependencies"]].flatMap((section) =>
      Object.entries(obj(section) ?? {}).flatMap(
        ([n, v]): [string, string][] => (typeof v === "string" ? [[n, v]] : []),
      ),
    ),
  );
  const off: string[] = [];
  for (const [name, want] of Object.entries(pins)) {
    const installed = await readJson(
      join(ctx.dotfiles, "node_modules", name, "package.json"),
    );
    if (installed === null) off.push(`${name}: not installed (pinned ${want})`);
    else if (obj(installed)?.["version"] !== want)
      off.push(
        `${name}: ${String(obj(installed)?.["version"])} ≠ pinned ${want}`,
      );
  }
  return off.length === 0
    ? pass(
        "deps",
        `${Object.keys(pins).length} pinned dependencies installed at their pins`,
      )
    : fail(
        "deps",
        `${off.length} dependency pin(s) not realized`,
        "mise run deps",
        off,
      );
}

export async function checkBins(ctx: Ctx): Promise<Finding> {
  const pkg = await readJson(join(ctx.dotfiles, "package.json"));
  if (pkg === null) return skip("bins", "no package.json in this checkout");
  const binDir = join(ctx.home, ".bun", "bin");
  const problems: string[] = [];
  // fileExists already swallows every access failure (missing path, dangling symlink target,
  // permission error) and reports false, so a prior real path is safe to resolve unconditionally.
  const bins = obj(obj(pkg)?.["bin"]) ?? {};
  const declaredBins = Object.entries(bins).flatMap(
    ([n, r]): [string, string][] => (typeof r === "string" ? [[n, r]] : []),
  );
  for (const [name, rel] of declaredBins) {
    const link = join(binDir, name);
    const have = await resolveExisting(link);
    if (have === null) {
      problems.push(`${link} is missing or dangling (declared: ${rel})`);
    } else if (have !== (await resolveExisting(join(ctx.dotfiles, rel)))) {
      problems.push(`${link} resolves to ${have}, not ${rel}`);
    }
  }
  // A renamed or removed bin leaves bun's old link behind: it points through bun's global
  // node_modules/dotfiles link, so link-dots.ts's "$DOTFILES/*" prune never sees it.
  // No bin dir at all: the per-bin loop above already reported every declared command.
  const stale = await danglingRepoBins(ctx.dotfiles, binDir);
  if (stale instanceof Error)
    return fail(
      "bins",
      `cannot inspect bin links: ${stale.message}`,
      "check bin directory permissions",
    );
  problems.push(
    ...stale.map(
      (p) =>
        `${p} is a dangling link left by a renamed/removed bin — mise run deps`,
    ),
  );
  return problems.length === 0
    ? pass(
        "bins",
        `${Object.keys(bins).length} PATH command(s) resolve into this repo`,
      )
    : fail(
        "bins",
        `${problems.length} PATH command problem(s)`,
        "mise run deps",
        problems,
      );
}

type MissingSkillHelper = {
  repo: string;
  rawPath: string;
  bin: string;
};

export async function missingSkillHelpers(
  repo: string,
  source: string,
  home: string,
): Promise<MissingSkillHelper[]> {
  const runPattern =
    /^\s*run\s*=\s*(?:"((?:\\.|[^"\\])*)"|'([^']*)'|"""([\s\S]*?)"""|'''([\s\S]*?)''')/gmu;
  const helperPattern =
    /[^\s"'`]*?\.(?:claude|agents)\/skills\/([a-z0-9-]+)\/scripts\/([a-z0-9-]+\.ts)/gu;
  const commands = [...source.matchAll(runPattern)].map(
    (entry) => entry[1] ?? entry[2] ?? entry[3] ?? entry[4] ?? "",
  );
  const paths = commands.flatMap((command) =>
    Array.from(command.matchAll(helperPattern)),
  );
  return (
    await Promise.all(
      paths.map(async (match) => {
        const rawPath = match[0];
        const target = resolve(
          rawPath
            .replaceAll("{{env.HOME}}", home)
            .replaceAll("{{config_root}}", repo)
            .replace(/^~/u, home),
        );
        if (await fileExists(target)) return [];
        const script = match[2] ?? "";
        return [{ repo, rawPath, bin: script.replace(/\.ts$/u, "") }];
      }),
    )
  ).flat();
}

export async function checkSkillHelperPaths(ctx: Ctx): Promise<Finding> {
  const repos = registeredRepos(
    ctx.home,
    process.env["WORKSPACE_ROOT"] ?? join(ctx.home, "Workspace"),
  );
  const missing = (
    await Promise.all(
      repos.map(async (repo) => {
        const misePath = join(repo, "mise.toml");
        if (!(await fileExists(misePath))) return [];
        return missingSkillHelpers(
          repo,
          await readFile(misePath, "utf8"),
          ctx.home,
        );
      }),
    )
  ).flat();
  const finding =
    missing.length === 0
      ? pass(
          "skill-helper-paths",
          "registered repo mise.toml helper paths resolve",
        )
      : fail(
          "skill-helper-paths",
          `${missing.length} registered repo mise.toml skill helper path(s) are missing`,
          "Replace each script path with its PATH bin, then run `mise run deps` in dotfiles",
          missing.map(
            ({ repo, rawPath, bin }) =>
              `${basename(repo)}/mise.toml: ${rawPath} is missing; use ${bin}`,
          ),
        );
  return finding;
}

async function resolveExisting(path: string): Promise<string | null> {
  return (await fileExists(path)) ? realpath(path) : null;
}

export async function checkGitHooks(ctx: Ctx): Promise<Finding> {
  const r = await run(
    ["git", "-C", ctx.dotfiles, "config", "--get", "core.hooksPath"],
    { ms: 10_000 },
  );
  const have = r.out.trim();
  const haveLabel = have === "" ? "unset" : `'${have}'`;
  return have === ".githooks"
    ? pass("git-hooks", "core.hooksPath = .githooks")
    : fail(
        "git-hooks",
        `core.hooksPath is ${haveLabel}, not .githooks — post-merge relink and pre-commit fmt never run`,
        `git -C ${ctx.dotfiles} config core.hooksPath .githooks`,
      );
}

export async function checkLoginShell(ctx: Ctx): Promise<Finding> {
  const user = userInfo().username;
  const r = ctx.isMac
    ? await run(["dscl", ".", "-read", `/Users/${user}`, "UserShell"], {
        ms: 10_000,
      })
    : await run(["getent", "passwd", user], { ms: 10_000 });
  const shell = ctx.isMac
    ? (r.out.split(":").pop()?.trim() ?? "")
    : (r.out.trim().split(":")[6] ?? "");
  if (shell === "")
    return warn("login-shell", "could not read the account's login shell");
  if (basename(shell) === "zsh")
    return pass("login-shell", `login shell is ${shell}`);
  // Where chsh is not ours (a shared server, sol): bash stays the login shell and hands every
  // interactive shell to zsh — zsh/bash_profile for a login, zsh/bashrc for a herdr pane. Healthy
  // only when BOTH handoffs are this repo's; doctor:remote checks the result from outside.
  const handoffChecks = await Promise.all(
    [
      [".bash_profile", "zsh/bash_profile"],
      [".bashrc", "zsh/bashrc"],
    ].map(async ([dst = "", src = ""]): Promise<Attempt<boolean>> => {
      const link = join(ctx.home, dst);
      const stat = await lstatOrUndefined(link);
      if (!stat.ok) return stat;
      if (stat.value === null || !stat.value.isSymbolicLink())
        return { ok: true, value: false };
      const target = await attempt(() => readlink(link));
      return target.ok
        ? { ok: true, value: target.value === join(ctx.dotfiles, src) }
        : target;
    }),
  );
  const handoffFailure = handoffChecks.find((result) => !result.ok);
  if (handoffFailure !== undefined)
    return warn(
      "login-shell",
      `check crashed: ${errorMessage(handoffFailure.error)}`,
    );
  const handoff = handoffChecks.every((result) => result.ok && result.value);
  return basename(shell) === "bash" && handoff
    ? pass(
        "login-shell",
        `login shell is ${shell}, handed to zsh by ~/.bash_profile and ~/.bashrc (this repo's)`,
      )
    : fail(
        "login-shell",
        `login shell is ${shell}, not zsh`,
        `chsh -s "$(command -v zsh)"`,
      );
}

export async function checkMiseScope(ctx: Ctx): Promise<Finding> {
  const r = await run(
    ["bun", join(ctx.dotfiles, "scripts/test-mise-scope.ts")],
    // cwd: the test opens zsh/tests/mise-scope.test.zsh by a repo-relative path; run from ~ it
    // exited 127 and read as an INV-6 FAIL (2026-10-05).
    { ms: 120_000, cwd: ctx.dotfiles },
  );
  if (r.timedOut)
    return warn("mise-scope", "test-mise-scope.ts timed out after 120s");
  if (r.code === 0)
    return pass("mise-scope", "INV-6 holds: no implicit global toolchain");
  const failed = r.out
    .split("\n")
    .filter((l) => l.startsWith("[FAIL]"))
    .map((l) => l.slice(7));
  return fail(
    "mise-scope",
    `${failed.length > 0 ? failed.length : "some"} INV-6 check(s) fail`,
    "mise run test:mise-scope (read each [FAIL])",
    failed,
  );
}

export async function checkMcp(ctx: Ctx): Promise<Finding> {
  const declared = Object.keys(
    obj(obj(await readJson(join(ctx.dotfiles, ".mcp.json")))?.["mcpServers"]) ??
      {},
  );
  if (declared.length === 0)
    return skip("mcp", ".mcp.json declares no servers");
  const missing: string[] = [];
  const claude = await run(["claude", "mcp", "list"], { ms: 90_000 });
  if (claude.missing)
    return fail("mcp", "claude is not on PATH", "mise run install:ai-clis");
  if (claude.timedOut)
    return warn(
      "mcp",
      "claude mcp list timed out after 90s (it health-checks every server)",
    );
  const claudeNames = new Set(
    claude.out.split("\n").map((l) => l.split(":")[0]?.trim() ?? ""),
  );
  missing.push(
    ...declared
      .filter((n) => !claudeNames.has(n))
      .map((n) => `${n}: not registered in Claude Code`),
  );
  const codex = await run(["codex", "mcp", "list"], { ms: 30_000 });
  if (!codex.missing && !codex.timedOut) {
    const codexNames = new Set(
      codex.out.split("\n").map((l) => l.trim().split(/\s+/u)[0] ?? ""),
    );
    missing.push(
      ...declared
        .filter((n) => !codexNames.has(n))
        .map((n) => `${n}: not registered in Codex`),
    );
  }
  const codexNote = codex.missing
    ? " (Codex not installed)"
    : " in Claude Code and Codex";
  return missing.length === 0
    ? pass(
        "mcp",
        `${declared.length} declared server(s) registered${codexNote}`,
      )
    : fail(
        "mcp",
        `${missing.length} declared MCP registration(s) missing`,
        "mise run cc:install-mcp",
        missing,
      );
}

export async function checkWslconfig(ctx: Ctx): Promise<Finding> {
  const src = join(ctx.dotfiles, "wsl", "wslconfig.win");
  // Same interop path as scripts/wsl-wslconfig.ts: cmd.exe is deliberately off this PATH.
  const r = await run(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Write-Output $env:USERPROFILE",
    ],
    { ms: 20_000, cwd: "/mnt/c" },
  );
  const profile = r.out.replaceAll("\r", "").trim();
  if (r.missing || r.timedOut || profile === "") {
    return warn(
      "wslconfig",
      "could not read %USERPROFILE% via powershell.exe interop",
    );
  }
  const w = await run(["wslpath", "-u", profile], { ms: 10_000 });
  const dst = join(w.out.trim(), ".wslconfig");
  if (!(await fileExists(dst)))
    return fail("wslconfig", `${dst} does not exist`, "mise run wsl:wslconfig");
  const [haveText, wantText] = await Promise.all([
    readFile(dst, "utf8"),
    readFile(src, "utf8"),
  ]);
  const have = haveText.replaceAll("\r", "");
  const want = wantText.replaceAll("\r", "");
  // .wslconfig comments are `#`; a copy that differs only there is stale prose, not stale config.
  if (have !== want && effectiveConfig(have) === effectiveConfig(want)) {
    return warn(
      "wslconfig",
      `${dst} differs from wsl/wslconfig.win in comments only — effective settings identical (mise run wsl:wslconfig to refresh)`,
    );
  }
  return have === want
    ? pass("wslconfig", `${dst} is a copy of wsl/wslconfig.win`)
    : fail(
        "wslconfig",
        `${dst} differs from wsl/wslconfig.win`,
        "mise run wsl:wslconfig (then wsl --shutdown)",
      );
}

export async function checkCccDaemon(
  ctx: Ctx,
  probe: typeof run = run,
): Promise<Finding> {
  if (ctx.isMac) return skip("ccc-daemon", "macOS uses lazy ccc startup");
  if (
    probe === run &&
    (Bun.which("systemctl") === null || Bun.which("systemctl") === undefined)
  )
    return skip("ccc-daemon", "no systemctl on this host");
  const r = await probe(
    ["systemctl", "--user", "is-active", "ccc-daemon.service"],
    { ms: 10_000 },
  );
  const state = r.out.trim();
  if (r.missing) return skip("ccc-daemon", "no systemctl on this host");
  const enabled = await probe(
    ["systemctl", "--user", "is-enabled", "ccc-daemon.service"],
    { ms: 10_000 },
  );
  const unit = join(ctx.home, ".config/systemd/user/ccc-daemon.service");
  const wants = join(
    ctx.home,
    ".config/systemd/user/default.target.wants/ccc-daemon.service",
  );
  const unitStat = await lstatOrUndefined(unit);
  if (!unitStat.ok)
    return warn("ccc-daemon", `check crashed: ${errorMessage(unitStat.error)}`);
  const installed = unitStat.value?.isFile() ?? false;
  const [wantsExists, unitExists] = await Promise.all([
    fileExists(wants),
    fileExists(unit),
  ]);
  const edge =
    wantsExists &&
    unitExists &&
    (await realpath(wants)) === (await realpath(unit));
  const stateLabel = state === "" ? "unknown" : state;
  const enablementLabel =
    enabled.out.trim() === "" ? "unknown enablement" : enabled.out.trim();
  const declaration = join(ctx.dotfiles, "cocoindex/ccc-daemon.service.wsl");
  const declared = await attemptOr(() => readFile(declaration, "utf8"), "");
  const actual = installed
    ? await attemptOr(() => readFile(unit, "utf8"), "")
    : "";
  const policyLines = declared
    .split("\n")
    .filter((line) =>
      /^Environment="(?:CCC_GPU_|COCOINDEX_RUN_GPU_IN_SUBPROCESS)/u.test(line),
    );
  const gpuPolicy =
    [
      "CCC_GPU_UTILIZATION_PERCENT",
      "CCC_GPU_BATCH_SIZE",
      "CCC_GPU_WAIT_SECONDS",
      "CCC_GPU_WINDOW",
      "COCOINDEX_RUN_GPU_IN_SUBPROCESS",
    ].every((key) =>
      policyLines.some((line) => line.startsWith(`Environment="${key}=`)),
    ) &&
    policyLines.every((line) => actual.split("\n").includes(line)) &&
    actual.includes("ccc-daemon-launch.py") &&
    !actual.split("\n").includes('Environment="CUDA_VISIBLE_DEVICES="');
  if (
    !r.timedOut &&
    state === "inactive" &&
    enabled.code === 0 &&
    !enabled.timedOut &&
    enabled.out.trim() === "enabled" &&
    installed &&
    edge &&
    gpuPolicy
  )
    return warn(
      "ccc-daemon",
      "ccc-daemon.service is stopped; GPU-only unit installed. Deploy preserves stops; start explicitly with systemctl --user start ccc-daemon when wanted",
    );
  return r.code === 0 &&
    !r.timedOut &&
    state === "active" &&
    enabled.code === 0 &&
    !enabled.timedOut &&
    enabled.out.trim() === "enabled" &&
    installed &&
    edge &&
    gpuPolicy
    ? pass(
        "ccc-daemon",
        `ccc-daemon.service enabled and active; GPU-only indexing; CUDA process exits before research takes a GPU slot (ccc-gpu.lock handoff); embeddings deferred during research; elastic VRAM with gpu_partition_ccc_mib as the standing floor (resource-policy.toml); ${policyLines.join("; ")}. Unit declaration checked; restart is required to activate changed launcher policy in an incumbent daemon`,
      )
    : fail(
        "ccc-daemon",
        `ccc-daemon.service is ${enablementLabel} / ${stateLabel}; real unit: ${installed}; default.target edge: ${edge}; GPU-only policy: ${gpuPolicy} — supervised searches need an enabled, active daemon with the declared GPU policy`,
        "mise run link:dots",
      );
}

export async function checkWsGc(
  _ctx: Ctx,
  probe: typeof run = run,
): Promise<Finding> {
  const name = "ws-gc";
  const active = await probe(
    ["systemctl", "--user", "is-active", "ws-gc.timer"],
    { ms: 10_000 },
  );
  if (active.missing) return skip(name, "no systemctl on this host");
  if (active.code !== 0 || active.timedOut || active.out.trim() !== "active")
    return fail(
      name,
      `ws-gc.timer is ${active.out.trim() === "" ? "not active" : active.out.trim()}`,
      "mise run link:dots",
    );
  const last = await probe(
    [
      "systemctl",
      "--user",
      "show",
      "ws-gc.service",
      "--property=Result",
      "--property=ExecMainStatus",
      "--property=ActiveState",
    ],
    { ms: 10_000 },
  );
  const properties = new Map<string, string>();
  for (const line of last.out.trim().split("\n")) {
    const [key, value] = line.split("=", 2);
    if (key !== undefined && value !== undefined) properties.set(key, value);
  }
  if (
    last.code !== 0 ||
    last.timedOut ||
    last.missing ||
    properties.get("Result") !== "success" ||
    properties.get("ExecMainStatus") !== "0" ||
    properties.get("ActiveState") === "failed"
  )
    return fail(
      name,
      `ws-gc.service last run unhealthy: ${last.out.trim()}`,
      "journalctl --user -u ws-gc.service; systemctl --user start ws-gc.service",
    );
  return pass(
    name,
    "ws-gc.timer active; ws-gc.service last run successful (or not yet run)",
  );
}

function statuslineProbeProblem(
  result: Awaited<ReturnType<typeof run>>,
): string {
  const reasons = [
    ...(result.missing ? ["systemctl missing"] : []),
    ...(result.timedOut ? ["systemctl timed out"] : []),
    ...(result.code !== 0 ? [`systemctl exited ${result.code}`] : []),
    ...(result.err.trim() !== "" ? [result.err.trim()] : []),
  ];
  return reasons.join("; ");
}

export async function checkStatuslineOwners(
  _ctx: Ctx,
  probe: typeof run = run,
): Promise<Finding> {
  if (_ctx.isMac) {
    const result = await probe(
      ["launchctl", "print", `gui/${process.getuid?.()}/statusline-sampler`],
      { ms: 10_000 },
    );
    const last = result.out.match(/last exit code = (\S+)/u)?.[1];
    const detail = [result.err.trim(), result.out.trim()]
      .filter(Boolean)
      .join("; ");
    if (
      result.missing ||
      result.timedOut ||
      result.code !== 0 ||
      last === undefined ||
      last !== "0"
    )
      return fail(
        "statusline-owners",
        `statusline-sampler agent not loaded or last exit unhealthy: ${detail === "" ? "no result" : detail}`,
        "mise run link:dots",
      );
    return pass(
      "statusline-owners",
      `statusline-sampler agent loaded; last exit ${last}`,
    );
  }
  const results = await Promise.all(
    ["statusline-sampler.timer", "agx-doctor.timer"].map(async (unit) => {
      const active = await probe(["systemctl", "--user", "is-active", unit], {
        ms: 10_000,
      });
      return { unit, active };
    }),
  );
  if (results.every(({ active }) => active.missing))
    return skip("statusline-owners", "no systemctl on this host");
  const failed = results.filter(
    ({ active }) =>
      active.missing ||
      active.code !== 0 ||
      active.timedOut ||
      active.out.trim() !== "active",
  );
  if (failed.length > 0)
    return fail(
      "statusline-owners",
      failed
        .map(({ unit, active }) => {
          const detail = [active.out.trim(), statuslineProbeProblem(active)]
            .filter(Boolean)
            .join("; ");
          return `${unit}: ${detail === "" ? "no active state returned" : detail}`;
        })
        .join("; "),
      "mise run link:dots",
    );
  // A running collector is healthy; a failed last invocation must remain visible.
  const collectors = await Promise.all(
    ["statusline-sampler.service", "agx-doctor.service"].map(async (unit) => {
      const service = await probe(
        ["systemctl", "--user", "show", unit, "--property=Result"],
        { ms: 10_000 },
      );
      if (service.missing || service.code !== 0 || service.timedOut)
        return `${unit}: cannot read collector result: ${statuslineProbeProblem(service)}${service.out.trim() === "" ? "" : `; stdout: ${service.out.trim()}`}`;
      const result = service.out
        .split("\n")
        .find((line) => line.startsWith("Result="));
      if (result === undefined || result === "Result=")
        return `${unit}: systemctl returned no Result property`;
      if (result !== "Result=success")
        return `${unit}: collector failed: ${result}`;
      return null;
    }),
  );
  const collectorFailures = collectors.filter((detail) => detail !== null);
  if (collectorFailures.length > 0)
    return fail(
      "statusline-owners",
      collectorFailures.join("; "),
      "journalctl --user -u statusline-sampler.service -u agx-doctor.service",
    );
  return pass(
    "statusline-owners",
    "sampler and agx refresh timers active; collectors successful",
  );
}

export async function checkGpuSampler(
  _ctx: Ctx,
  probe: typeof run = run,
): Promise<Finding> {
  const name = "gpu-sampler";
  const active = await probe(
    ["systemctl", "--user", "is-active", "gpu-sampler.timer"],
    { ms: 10_000 },
  );
  if (active.missing) return skip(name, "no systemctl on this host");
  if (active.code !== 0 || active.timedOut || active.out.trim() !== "active")
    return fail(
      name,
      `gpu-sampler.timer is ${active.out.trim() === "" ? "not active" : active.out.trim()}`,
      "mise run link:dots",
    );
  const last = await probe(
    [
      "systemctl",
      "--user",
      "show",
      "gpu-sampler.service",
      "--property=Result",
      "--property=ExecMainStatus",
      "--property=ActiveState",
    ],
    { ms: 10_000 },
  );
  const properties = new Map<string, string>();
  for (const line of last.out.trim().split("\n")) {
    const [key, value] = line.split("=", 2);
    if (key !== undefined && value !== undefined) properties.set(key, value);
  }
  if (
    last.code !== 0 ||
    last.timedOut ||
    last.missing ||
    properties.get("Result") !== "success" ||
    properties.get("ExecMainStatus") !== "0" ||
    properties.get("ActiveState") === "failed"
  )
    return fail(
      name,
      `gpu-sampler.service last run unhealthy: ${last.out.trim()}`,
      "journalctl --user -u gpu-sampler.service; systemctl --user start gpu-sampler.service",
    );
  return pass(
    name,
    "gpu-sampler.timer active; gpu-sampler.service last run successful (or not yet run)",
  );
}

export async function checkCapacityGuard(ctx: Ctx): Promise<Finding> {
  const unit = "wsl-capacity-recover.timer";
  const active = await run(["systemctl", "--user", "is-active", unit], {
    ms: 10_000,
  });
  if (active.missing)
    return skip("capacity-guard", "no systemctl on this host");
  // A linked *.timer.wsl is reported as an "alias" by is-enabled even after enabling it.
  // Check the actual timers.target.wants edge and its target instead.
  const wants = join(
    ctx.home,
    ".config/systemd/user/timers.target.wants",
    unit,
  );
  const source = join(ctx.dotfiles, "wsl/wsl-capacity-recover.timer.wsl");
  const [wantsExists, sourceExists] = await Promise.all([
    fileExists(wants),
    fileExists(source),
  ]);
  const enabled =
    wantsExists &&
    sourceExists &&
    (await realpath(wants)) === (await realpath(source));
  if (enabled && active.out.trim() === "active") {
    return pass("capacity-guard", `${unit} is enabled and active`);
  }
  const activeLabel =
    active.out.trim() === "" ? "not active" : active.out.trim();
  return fail(
    "capacity-guard",
    `${unit} is ${enabled ? "enabled" : "not enabled"} / ${activeLabel}`,
    "mise run wsl:capacity:enable",
  );
}

export async function checkTmpfsCapacity(
  ctx: Ctx,
  measure: () =>
    | Pick<
        Awaited<ReturnType<typeof statfs>>,
        "files" | "ffree" | "blocks" | "bavail" | "bsize"
      >
    | Promise<
        Pick<
          Awaited<ReturnType<typeof statfs>>,
          "files" | "ffree" | "blocks" | "bavail" | "bsize"
        >
      > = () => statfs("/tmp", { bigint: true }),
): Promise<Finding> {
  if (!ctx.isWsl) return skip("tmpfs-capacity", "WSL only");
  const measured = await attempt(async () => tmpfsUsage(await measure()));
  if (!measured.ok)
    return warn(
      "tmpfs-capacity",
      `could not measure /tmp: ${errorMessage(measured.error)}`,
    );
  if (measured.value.isErr())
    return warn(
      "tmpfs-capacity",
      `could not measure /tmp: ${errorMessage(measured.value.error)}`,
    );
  const usage = measured.value.value;
  const pressure = Math.max(usage.bytes.percent, usage.inodes.percent);
  const detail =
    `/tmp bytes ${usage.bytes.percent.toFixed(1)}% (${usage.bytes.used} of ${usage.bytes.total}); ` +
    `inodes ${usage.inodes.percent.toFixed(1)}% (${usage.inodes.used} of ${usage.inodes.total}); ` +
    `reclaim threshold ${TMPFS_RECLAIM_PERCENT}%`;
  return pressure >= TMPFS_RECLAIM_PERCENT
    ? fail("tmpfs-capacity", detail, "mise run reclaim:yes")
    : pass("tmpfs-capacity", detail);
}

export async function checkRecoverHealth(
  _ctx: Ctx,
  probe: typeof run = run,
): Promise<Finding> {
  const installed: string[] = [];
  for (const unit of RECOVER_UNITS) {
    const finding = await checkRecoverUnit(unit, probe);
    if (finding.verdict === "SKIP") continue;
    installed.push(unit);
    if (finding.verdict !== "PASS") return finding;
  }
  return installed.length === 0
    ? skip("recover-health", "no recover service is installed")
    : pass("recover-health", `last run healthy: ${installed.join(", ")}`);
}

async function checkRecoverUnit(
  unit: string,
  probe: typeof run,
): Promise<Finding> {
  const journal = await probe(
    [
      "journalctl",
      "--user",
      `--unit=${unit}`,
      "-n",
      "120",
      "--no-pager",
      "--output=short-iso-precise",
    ],
    { ms: 5_000 },
  );
  if (journal.missing)
    return warn("recover-health", "journalctl is not on PATH");
  if (journal.timedOut)
    return warn("recover-health", `journalctl ${unit} timed out`);
  if (journal.code !== 0) {
    const error = journal.err.trim();
    return warn(
      "recover-health",
      error !== "" ? error : `journalctl ${unit} exited ${journal.code}`,
    );
  }
  if (journal.out.trim() === "") return checkEmptyRecoverJournal(unit, probe);
  const failure = recoverJournalFailure(unit, journal.out, {
    thresholdPercent: TMPFS_RECLAIM_PERCENT,
  });
  if (failure !== undefined)
    return fail(
      "recover-health",
      `${unit}: ${failure.reason}`,
      `journalctl --user -u ${unit} -n 120 --no-pager`,
      [failure.line],
    );
  return pass("recover-health", `last run healthy: ${unit}`);
}

async function checkEmptyRecoverJournal(
  unit: string,
  probe: typeof run,
): Promise<Finding> {
  const loaded = await probe(
    ["systemctl", "--user", "show", unit, "--property=LoadState", "--value"],
    { ms: 5_000 },
  );
  if (loaded.code === 0 && loaded.out.trim() !== "loaded")
    return skip("recover-health", `${unit} is not installed`);
  if (loaded.missing) return warn("recover-health", "systemctl is not on PATH");
  if (loaded.timedOut)
    return warn("recover-health", `systemctl show ${unit} timed out`);
  const error = loaded.err.trim();
  return warn(
    "recover-health",
    error !== ""
      ? error
      : `no journal entries and installation state for ${unit} is unknown`,
  );
}

export function checkWslGpuManagerPath(path: string | undefined): Finding {
  const name = "wsl-gpu-path";
  if (path?.split(":").includes("/usr/lib/wsl/lib") === true)
    return pass(name, "systemd user manager PATH includes /usr/lib/wsl/lib");
  return fail(
    name,
    `systemd user manager PATH ${path === undefined ? "is not set" : `does not include /usr/lib/wsl/lib: ${path}`}`,
    "mise run link:dots, then systemctl --user daemon-reexec (or log in again)",
  );
}

async function checkWslGpuPath(): Promise<Finding> {
  const result = await run(["systemctl", "--user", "show-environment"], {
    ms: 10_000,
  });
  if (result.missing)
    return fail(
      "wsl-gpu-path",
      "systemctl is not on PATH",
      "mise run wsl:init",
    );
  if (result.timedOut)
    return warn("wsl-gpu-path", "systemctl --user show-environment timed out");
  if (result.code !== 0) {
    const error = result.err.trim();
    return fail(
      "wsl-gpu-path",
      error.length > 0 ? error : `systemctl exited ${result.code}`,
      "systemctl --user daemon-reexec",
    );
  }
  const path = /^PATH=(.*)$/mu.exec(result.out)?.[1];
  return checkWslGpuManagerPath(path);
}

// ccc resolves a project's DB dir in TWO processes: the daemon writes the index where its own
// COCOINDEX_CODE_DB_PATH_MAPPING points, while `ccc reset`/`ccc status` and repo-retrieve's
// watermark look where the client's points. zsh/zshenv declares the client value and
// cocoindex/ccc-daemon.service.wsl the daemon's; a daemon started before either changed keeps
// the old one until restarted. `ccc doctor` is the only CLI that reports the daemon's mapping.
export async function checkCccDbMap(
  ctx: Ctx,
  probe: typeof run = run,
  rawMapping = process.env[MAPPING_ENV],
): Promise<Finding> {
  if (probe === run && Bun.which("ccc") === undefined)
    return skip("ccc-db-map", "ccc is not installed");
  const parsed = (await parseMapping(rawMapping)).map((mappings) =>
    mappings.map((m) => `${m.source}=${m.target}`),
  );
  if (parsed.isErr()) {
    return fail(
      "ccc-db-map",
      `${MAPPING_ENV} is malformed: ${parsed.error.message}`,
      "fix the export in zsh/zshenv",
    );
  }
  const client = parsed.value;
  if (client.length === 0) {
    return fail(
      "ccc-db-map",
      `${MAPPING_ENV} is unset in this shell — index DBs would be read from inside the repos`,
      "open a new shell (zsh/zshenv exports it)",
    );
  }
  const r = await probe(["ccc", "doctor"], { ms: 8_000, cwd: ctx.home });
  if (r.timedOut) return warn("ccc-db-map", "`ccc doctor` timed out after 8s");
  const lines = r.out.split("\n");
  const start = lines.findIndex((l) => l.trim() === "DB path mappings:");
  const daemon: string[] = [];
  for (const l of start < 0 ? [] : lines.slice(start + 1)) {
    const m = l.match(/^ {4}(\S.*?) \u2192 (\S.*)$/u);
    if (m === null) break;
    daemon.push(`${m[1]}=${m[2]}`);
  }
  if (start < 0 && !r.out.includes("Loaded projects:")) {
    return warn("ccc-db-map", "`ccc doctor` did not reach the daemon");
  }
  const same =
    client.length === daemon.length && client.every((c, i) => c === daemon[i]);
  const restartFix = ctx.isWsl
    ? "systemctl --user daemon-reload && systemctl --user restart ccc-daemon"
    : "ccc daemon restart (from a shell that exports the mapping)";
  const daemonLabel = daemon.join(",") === "" ? "nothing" : daemon.join(",");
  return same
    ? pass("ccc-db-map", `daemon and this shell both map ${client.join(",")}`)
    : fail(
        "ccc-db-map",
        `daemon maps ${daemonLabel}, this shell maps ${client.join(",")}`,
        restartFix,
      );
}

const PROJECT_SETTINGS = join(".cocoindex_code", "settings.yml");
const REF_LOCK_SCAN_PRUNED = new Set([
  ".git",
  ".jj",
  ".cache",
  ".bun",
  ".claude",
  ".codex",
  ".cargo",
  ".config",
  ".local",
  ".julia",
  ".gradle",
  ".mypy_cache",
  ".next",
  ".npm",
  ".pytest_cache",
  ".rustup",
  ".terraform",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "Downloads",
  "Library",
  "Music",
  "node_modules",
  "Pictures",
  "target",
  "Videos",
  "vendor",
  "venv",
  ".vscode",
]);
const REF_LOCK_SCAN_DIRECTORY_LIMIT = 100_000;

async function discoverRegisteredRepos(searchRoot: string): Promise<{
  roots: string[];
  complete: boolean;
}> {
  const roots: string[] = [];
  let complete = true;
  let visitedDirectories = 0;
  const walk = async (dir: string): Promise<void> => {
    if (visitedDirectories >= REF_LOCK_SCAN_DIRECTORY_LIMIT) {
      complete = false;
      return;
    }
    visitedDirectories += 1;
    if (await fileExists(join(dir, PROJECT_SETTINGS))) {
      roots.push(dir);
      const nestedRoots = [
        join(dir, ".claude", "worktrees"),
        join(dir, ".worktrees"),
        join(dir, "worktrees"),
      ];
      const nestedExisting = await Promise.all(
        nestedRoots.map(async (nested) =>
          (await fileExists(nested)) ? nested : null,
        ),
      );
      for (const nested of nestedExisting.flatMap((path) =>
        path === null ? [] : [path],
      ))
        await walk(nested);
      return;
    }
    const listing = await attempt(() => readdir(dir, { withFileTypes: true }));
    if (!listing.ok) {
      complete = false;
      return;
    }
    for (const entry of listing.value) {
      if (entry.isSymbolicLink()) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory() && entry.name === ".cocoindex_code") continue;
      if (entry.isDirectory() && !REF_LOCK_SCAN_PRUNED.has(entry.name))
        await walk(path);
      if (visitedDirectories >= REF_LOCK_SCAN_DIRECTORY_LIMIT) {
        complete = false;
        break;
      }
    }
  };
  await walk(searchRoot);
  return { roots: [...new Set(roots)].toSorted(), complete };
}

export async function checkGitRefLocks(
  ctx: Ctx,
  registeredRoots?: string[],
): Promise<Finding> {
  const discovered =
    registeredRoots === undefined
      ? await discoverRegisteredRepos(ctx.home)
      : { roots: registeredRoots, complete: true };
  const findings = discovered.roots.flatMap((root) =>
    ownerlessRefLocks(root).map(({ path, ageMs }) => ({ root, path, ageMs })),
  );
  if (findings.length > 0) {
    return fail(
      "git-ref-locks",
      `${findings.length} ownerless Git ref lock(s) found in registered repositories`,
      "confirm no holder, then repair each named lock with: rip <path>",
      findings.map(
        ({ root, path, ageMs }) =>
          `${path} · repo=${root} · age=${Math.floor(ageMs / 1_000)}s`,
      ),
    );
  }
  if (!discovered.complete)
    return warn(
      "git-ref-locks",
      `repo scan under ${ctx.home} was incomplete; no ownerless ref lock was confirmed across ${discovered.roots.length} registered repo(s)`,
    );
  return pass(
    "git-ref-locks",
    `no ownerless Git ref locks across ${discovered.roots.length} registered repo(s)`,
  );
}

export async function checkIterm2(ctx: Ctx): Promise<Finding> {
  const r = await run(
    ["defaults", "read", "com.googlecode.iterm2", "PrefsCustomFolder"],
    { ms: 10_000 },
  );
  const have = r.out.trim().replace(/^~/u, ctx.home);
  const want = join(ctx.dotfiles, "iterm2");
  const haveLabel = have === "" ? "unset" : have;
  return have === want
    ? pass("iterm2", "iTerm2 loads its prefs from iterm2/")
    : fail(
        "iterm2",
        `iTerm2 prefs folder is ${haveLabel}, not ${want}`,
        "mise run mac:iterm2",
      );
}

async function trackedOldPin(
  link: string,
  required: string,
): Promise<string | undefined> {
  const read = await attempt(async () => {
    const file = await realpath(link);
    if (!file.endsWith(".toml")) return null;
    const config = Bun.TOML.parse(await Bun.file(file).text());
    const pin = obj(obj(config)?.["tools"])?.["bun"];
    if (typeof pin !== "string" || !/^\d+\.\d+(?:\.\d+)?$/u.test(pin))
      return null;
    // A minor-line pin resolves to its newest patch; only a line below the minimum is stale.
    const version = pin.split(".").length === 2 ? `${pin}.999999` : pin;
    return Bun.semver.satisfies(version, required)
      ? null
      : `pinned: ${file} (bun = "${pin}")`;
  });
  return read.ok ? (read.value ?? undefined) : undefined;
}

export async function checkBunFloor(
  ctx: Ctx,
  homebrew = brewPrefix(ctx.home),
  path = process.env["PATH"] ?? "",
): Promise<Finding> {
  const required = await bunRequirement(ctx);
  if (required === undefined)
    return fail(
      "bun-floor",
      "package.json engines.bun must declare a minimum",
      "repair package.json engines.bun",
    );
  const installs = join(ctx.home, ".local/share/mise/installs/bun");
  const tracked = join(ctx.home, ".local/state/mise/tracked-configs");
  const installed = await attemptOr(() => readdir(installs), []);
  const candidates = new Set([
    process.execPath,
    ...installed.map((v) => join(installs, v, "bin/bun")),
    join(homebrew, "bin/bun"),
    ...path.split(":").map((dir) => resolve(dir, "bun")),
  ]);
  const old: string[] = [];
  const checked: string[] = [];
  for (const binary of candidates) {
    if (!(await Bun.file(binary).exists())) continue;
    const result = await run([binary, "--version"], { ms: 5000 });
    const version = result.out.trim();
    if (
      result.code !== 0 ||
      result.timedOut ||
      !/^\d+\.\d+\.\d+(?:[-+].*)?$/u.test(version)
    ) {
      old.push(`${binary}: cannot determine Bun version`);
    } else if (!Bun.semver.satisfies(version, required)) {
      old.push(`${binary} reports ${version}; required ${required}`);
    } else checked.push(`${binary}=${version}`);
  }
  for (const link of await attemptOr(() => readdir(tracked), [])) {
    const hit = await trackedOldPin(join(tracked, link), required);
    if (hit !== undefined) old.push(hit);
  }
  return old.length === 0
    ? pass(
        "bun-floor",
        `all ${checked.length} Bun binaries satisfy ${required}: ${checked.join(", ")}`,
      )
    : fail(
        "bun-floor",
        `${old.length} Bun binary/pin violation(s); required ${required}`,
        `mise install bun; brew upgrade bun; update stale pins to bun = "${required.slice(2).split(".").slice(0, 2).join(".")}" with mise lock bun@${required.slice(2)}; mise uninstall bun@<old-version>`,
        old,
      );
}

export async function checkCodexRemote(ctx: Ctx): Promise<Finding> {
  // The Windows Desktop owns its native app-server. A WSL daemon would be a second owner and
  // can neither observe nor safely restart the desktop process.
  if (ctx.isWsl)
    return skip(
      "codex-remote",
      "Windows Desktop owns the native Codex app-server on WSL",
    );
  if (Bun.which("codex") === null)
    return skip("codex-remote", "codex not installed");
  const declared = await readDeclared(ctx.dotfiles);
  if (declared instanceof Error)
    return fail(
      "codex-remote",
      declared.message,
      "fix agents/codex/app-server.toml",
    );
  const live = await readLive(ctx.home);
  const lines = drift(declared, live);
  if (live.unmanaged === true)
    return {
      ...warn(
        "codex-remote",
        "running app-server is not managed by codex app-server daemon; it may belong to a desktop SSH session, so daemon settings cannot repair it safely",
      ),
      lines,
      fix: "restart it as a managed daemon when the desktop session is not in use",
    };
  if (lines.length === 0)
    return pass(
      "codex-remote",
      `app-server remote control ${declared ? "enabled" : "disabled"} as declared`,
    );
  return fail(
    "codex-remote",
    "Codex app-server remote control differs from agents/codex/app-server.toml (mobile app cannot connect when it is off)",
    "mise run codex:remote-control",
    lines,
  );
}

// Runtime ownership is intentionally delegated to agents/codex/codex-runtime.ts. That command
// validates the declared WSL native provider, explicit Windows launcher, and both configuration
// homes without re-implementing its deployment contract in the doctor.
export async function checkCodexRuntime(ctx: Ctx): Promise<Finding> {
  const provider = await declaredProvider(ctx.dotfiles, "wsl");
  if (provider.isErr())
    return fail(
      "codex-runtime",
      `invalid runtime declaration: ${provider.error}`,
      "repair agents/codex/runtime.toml",
    );
  if (provider.value !== "standalone")
    return fail(
      "codex-runtime",
      `WSL declares ${provider.value}, not the required standalone provider`,
      'set providers.wsl = "standalone" in agents/codex/runtime.toml',
    );
  const runtime = join(ctx.dotfiles, "agents/codex/codex-runtime.ts");
  if (!(await fileExists(runtime)))
    return fail(
      "codex-runtime",
      "WSL dual Codex runtime deployment script is missing",
      "restore agents/codex/codex-runtime.ts",
    );
  // Reuse this verified Bun instead of resolving an ambient `bun`: under a fixture HOME that
  // name can be a mise shim, whose cache creation would violate the doctor's read-only contract.
  const r = await run([process.execPath, runtime, "--check"], {
    ms: 30_000,
    env: { HOME: ctx.home, DOTFILES: ctx.dotfiles },
  });
  if (r.missing)
    return fail(
      "codex-runtime",
      "bun is not on PATH; cannot validate the dual Codex launchers",
      "mise run deps",
    );
  if (r.timedOut)
    return warn(
      "codex-runtime",
      "dual Codex runtime validation timed out after 30s",
    );
  if (r.code === 0)
    return pass(
      "codex-runtime",
      "WSL plain codex uses the Homebrew cask while explicit codex.exe uses Windows Desktop with separate config homes",
    );
  const lines = (r.out + r.err).trim().split("\n").filter(Boolean);
  const firstLine =
    lines.find((line) => line.startsWith("FAIL")) ?? lines[0] ?? "";
  const detail =
    firstLine === "" ? `runtime check exited ${r.code}` : firstLine;
  return fail(
    "codex-runtime",
    detail,
    "mise run codex:runtime",
    lines.filter((line) => line !== firstLine),
  );
}

export async function checkCodexSandboxNetwork(ctx: Ctx): Promise<Finding> {
  const configuredHome = await attempt(() =>
    configHome(ctx.dotfiles, ctx.home),
  );
  if (!configuredHome.ok)
    return fail(
      "codex-config",
      `cannot resolve the declared Codex configuration home: ${errorMessage(configuredHome.error)}`,
      "mise run codex:runtime",
    );
  const home = configuredHome.value;
  if (!(await fileExists(join(home, ".codex"))))
    return skip("codex-config", "~/.codex does not exist yet");
  const declared = await readSandboxNetworkDeclared(ctx.dotfiles);
  if (declared instanceof Error)
    return fail(
      "codex-config",
      declared.message,
      "fix agents/codex/config.declared.toml",
    );
  const live = await readSandboxNetworkLive(home);
  if (live instanceof Error)
    return fail("codex-config", live.message, "repair ~/.codex/config.toml");
  const lines = sandboxNetworkDrift(declared, live);
  if (lines.length === 0)
    return pass(
      "codex-config",
      "Codex settings and managed MCP entries match their declarations",
    );
  return fail(
    "codex-config",
    "Codex settings or managed MCP entries differ from their declarations",
    "mise run codex:config",
    lines,
  );
}

// Delegates to scripts/edge-policy.ts --check, which owns the destination and the comparison.
export async function checkEdgePolicy(ctx: Ctx): Promise<Finding> {
  if (!(await fileExists("/Applications/Microsoft Edge.app")))
    return skip("edge-policy", "Microsoft Edge is not installed");
  const r = await run(
    ["bun", join(ctx.dotfiles, "scripts/edge-policy.ts"), "--check"],
    { ms: 20_000 },
  );
  if (r.timedOut)
    return warn("edge-policy", "edge-policy.ts --check timed out after 20s");
  if (r.code === 0)
    return pass(
      "edge-policy",
      "the live Edge policy matches edge/policy.plist.mac",
    );
  const detail =
    r.out.split("\n").find((l) => l.startsWith("FAIL")) ?? `exit ${r.code}`;
  return fail(
    "edge-policy",
    detail.replace(/^FAIL edge-policy: /u, ""),
    "mise run edge:policy (asks for sudo)",
  );
}

// ssh/config's `Host r99-u24` forwards the REMOTE's smart-open socket to THIS machine's receiver.
// Both ends are code (tools/shared/src/sockets.ts);the forward is ssh syntax (%r, %d) that cannot
// import them, so the only guard against drift is to ask ssh what it RESOLVES and compare. A
// mismatch is silent in use: `o <url>` finds no socket (or one nobody answers) and opens on the
// remote's own screen. -F pins the declared source (this repo's ssh/config, not whatever
// ~/.ssh/config currently links to); -G prints the resolved options without connecting.
const SMART_OPEN_HOST = "r99-u24";
export async function checkSmartOpen(ctx: Ctx): Promise<Finding> {
  const config = join(ctx.dotfiles, "ssh", "config");
  if (!(await fileExists(config)))
    return skip("smart-open", "no ssh/config in this checkout");
  const r = await run(["ssh", "-G", "-F", config, SMART_OPEN_HOST], {
    ms: 10_000,
  });
  if (r.missing) return skip("smart-open", "ssh is not installed");
  if (r.timedOut || r.code !== 0) {
    return warn(
      "smart-open",
      `ssh -G ${SMART_OPEN_HOST} did not resolve (exit ${r.code}): ${r.err.trim()}`,
    );
  }
  const resolved = r.out.split("\n");
  const value = (key: string): string[] =>
    resolved
      .filter((l) => l.startsWith(`${key} `))
      .map((l) => l.slice(key.length + 1).trim());
  // The forward is the CLIENT's side: only a machine that attaches to r99-u24 (its config.local
  // gives the alias a HostName) carries it. A rented box or R99 itself never attaches there —
  // `ssh -G` then echoes the alias back as the hostname, and there is nothing to check.
  if (value("hostname")[0] === SMART_OPEN_HOST)
    return skip(
      "smart-open",
      `this machine does not attach to ${SMART_OPEN_HOST} (no HostName for it in ~/.ssh/config.local)`,
    );
  const user = value("user")[0];
  if (user === undefined)
    return warn("smart-open", "ssh -G printed no `user` line");
  // The socket NAME carries the alias (%n): it is how `oo` there learns which host to open on.
  const want = `${remoteSocket(user, SMART_OPEN_HOST)} ${receiverSocket(ctx.home)}`;
  const have = value("remoteforward");
  if (have.includes(want)) return checkEditorAlias(ctx, config, resolved, want);
  const seen =
    have.length > 0
      ? have.map((h) => `have: ${h}`)
      : ["have: no RemoteForward at all"];
  return fail(
    "smart-open",
    `${SMART_OPEN_HOST}'s RemoteForward does not join the paths tools/shared/src/sockets.ts uses — \`o <url>\` would open on the remote's screen`,
    "make the RemoteForward in ssh/config match tools/shared/src/sockets.ts (or the reverse)",
    [`want: ${want}`, ...seen],
  );
}

// The editor half: VS Code connects to <alias>-code, which must reach the same box as the attach
// alias WITHOUT its RemoteForward (tools/smart-open/src/receive.ts vouches exactly this per request; here it
// is checked before the first `oo` hits it). Its HostName/Port/User come from ~/.ssh/config.local.
async function checkEditorAlias(
  ctx: Ctx,
  config: string,
  attach: string[],
  want: string,
): Promise<Finding> {
  const editor = editorHost(SMART_OPEN_HOST);
  const r = await run(["ssh", "-G", "-F", config, editor], { ms: 10_000 });
  if (r.timedOut || r.code !== 0)
    return warn(
      "smart-open",
      `ssh -G ${editor} did not resolve (exit ${r.code})`,
    );
  const target = editorTarget;
  const code = r.out.split("\n");
  const same = target(code).join(" ") === target(attach).join(" ");
  const forwards = code.some(
    (l) =>
      l.startsWith("remoteforward ") &&
      l.trim().endsWith(` ${receiverSocket(ctx.home)}`),
  );
  if (same && !forwards) {
    // Only the attach may carry the forward: a command session (an agent's `ssh r99-u24 cmd`)
    // would steal the socket and leave a dead bind behind when it exits (ssh/config, Match).
    const ex = await run(["ssh", "-G", "-F", config, SMART_OPEN_HOST, "true"], {
      ms: 10_000,
    });
    const exForwards = ex.out
      .split("\n")
      .some(
        (l) =>
          l.startsWith("remoteforward ") &&
          l.trim().endsWith(` ${receiverSocket(ctx.home)}`),
      );
    if (ex.timedOut || ex.code !== 0)
      return warn(
        "smart-open",
        `ssh -G ${SMART_OPEN_HOST} true did not resolve (exit ${ex.code})`,
      );
    if (exForwards)
      return fail(
        "smart-open",
        `a command session to ${SMART_OPEN_HOST} carries the smart-open forward — every \`ssh ${SMART_OPEN_HOST} <cmd>\` steals the socket and leaves a dead bind`,
        'scope the RemoteForward in ssh/smart-open-attach.conf with `Match tagged smart-open … sessiontype shell` / `command "*herdr remote-client-bridge*"`',
        [`have: ssh -G ${SMART_OPEN_HOST} true → remoteforward`],
      );
    return pass(
      "smart-open",
      `${SMART_OPEN_HOST} forwards ${want.replace(" ", " → ")} on attach only; ${editor} reaches the same box without the forward`,
    );
  }
  return fail(
    "smart-open",
    forwards
      ? `${editor} carries the smart-open forward — VS Code would take the socket over and leave a dead bind`
      : `${editor} does not reach the same box as ${SMART_OPEN_HOST} — \`oo\` there is refused`,
    `name ${editor} beside ${SMART_OPEN_HOST} on its Host line in ~/.ssh/config.local (\`Host ${SMART_OPEN_HOST} ${editor}\`), and give it no RemoteForward`,
    [
      `want: ${target(attach).join(" ")}, no forward`,
      `have: ${target(code).join(" ")}${forwards ? ", forwards" : ""}`,
    ],
  );
}

// Installed is insufficient: every declared command must resolve from this host's Homebrew.
// Probe a login shell in HOME so a doctor launched via mise does not mistake its repo toolchain
// PATH for the owner's core environment. SSH command reach is additionally tested by migration.
export async function checkCoreTools(ctx: Ctx): Promise<Finding> {
  if (!(await fileExists(join(ctx.dotfiles, "Brewfile.core"))))
    return fail(
      "core-tools",
      "no Brewfile.core in this checkout",
      "jj/git pull",
    );
  const names = await coreCommands(ctx.dotfiles, { isWsl: ctx.isWsl });
  const prefix = brewPrefix(ctx.home);
  const shell = await run(["zsh", "-lc", "cd ~; print -r -- $PATH"], {
    ms: 30_000,
    env: { HOME: ctx.home, PATH: "/usr/bin:/bin" },
  });
  if (shell.missing || shell.timedOut || shell.code !== 0)
    return warn("core-tools", "cannot inspect login shell PATH");
  const path = shell.out.trim().split("\n").at(-1) ?? "";
  const missing = await corePathProblems(names, prefix, path);
  const repair = "mise run install:tools";
  return missing.length === 0
    ? pass(
        "core-tools",
        `all ${names.length} Brewfile.core commands resolve from ${prefix}`,
      )
    : fail(
        "core-tools",
        `${missing.length} Brewfile.core command(s) missing or outside ${prefix}`,
        repair,
        missing,
      );
}

/** Flag earlier PATH copies and duplicates in user bin directories. */
export async function checkBrewShadows(ctx: Ctx): Promise<Finding> {
  const path = process.env["PATH"] ?? "";
  const brew = Bun.which("brew", { PATH: path });
  if (brew === null)
    return warn(
      "brew-shadows",
      "cannot locate brew on PATH; command shadow scan could not be completed",
    );
  const declarations = await declaredToolCommands(ctx.dotfiles);
  const shadows = (
    await findToolCommandShadows(
      declarations.map(({ command }) => command),
      path,
      dirname(brew),
      ctx.home,
    )
  ).filter(({ command, shadow }) => {
    // A later user-bin duplicate is not a shadow: the shell still selects the
    // Homebrew command. Report only the executable that command lookup selects.
    const selected = Bun.which(command, { PATH: path });
    return selected !== null && resolve(selected) === resolve(shadow);
  });
  return shadows.length === 0
    ? pass(
        "brew-shadows",
        `no declared Homebrew command shadows (Homebrew: ${dirname(brew)})`,
      )
    : fail(
        "brew-shadows",
        `${shadows.length} declared Homebrew command shadow(s) in PATH`,
        "rip <shadow>",
        shadows.map(
          ({ command, shadow, homebrew }) =>
            `${command}: ${shadow} (Homebrew: ${homebrew})`,
        ),
      );
}

export async function checkAgx(
  ctx: Ctx,
  probe: typeof run = run,
): Promise<Finding> {
  const result = await probe(
    ["mise", "-C", ctx.dotfiles, "exec", "--", "agx", "status", "--json"],
    {
      ms: 30_000,
      cwd: ctx.dotfiles,
    },
  );
  if (result.missing)
    return fail("agx", "mise is not on PATH", "mise run install:tools");
  if (result.timedOut) return warn("agx", "agx status timed out after 30s");
  if (result.code !== 0)
    return warn(
      "agx",
      result.err.trim() !== ""
        ? result.err.trim()
        : `agx status exited ${result.code}`,
    );
  const parsed = jsonOf(DoctorStatus).safeParse(result.out);
  if (!parsed.success)
    return warn("agx", "agx status returned invalid schema-1 doctor findings");
  const findings = parsed.data.findings;
  if (findings === null)
    return warn("agx", "doctor findings unavailable; run agx doctor --json");
  const lines = findings.findings.map((record) => JSON.stringify(record));
  if (!findings.complete || findings.stale === true)
    return {
      ...warn(
        "agx",
        "doctor findings incomplete or stale; run agx doctor --json",
      ),
      lines,
    };
  if (findings.total > 0)
    return fail(
      "agx",
      `${findings.total} fleet finding(s)`,
      "agx doctor --json",
      lines,
    );
  return pass("agx", "fleet clean");
}

type Check = {
  name: string;
  run: (ctx: Ctx) => Promise<Finding>;
  applies: (ctx: Ctx) => string | null;
};
const always = () => null;
export async function checkToolFloor(
  _ctx: Ctx,
  io: FloorIO = coreFloorIO,
): Promise<Finding> {
  const result = await checkCoreFloor(io, false);
  if (result.warning === true)
    return {
      ...warn("core-floor", result.detail),
      fix: result.fix ?? "mise run up",
    };
  return result.ok
    ? pass("core-floor", result.detail)
    : fail("core-floor", result.detail, result.fix ?? "mise run up");
}
export function checkRole(_ctx?: Ctx, host = hostname()): Promise<Finding> {
  const { role, bound } = resolveRole(host);
  return Promise.resolve(
    info(
      "role",
      `${role} (${bound ? `host ${host}` : `unbound host ${host}; default`})`,
    ),
  );
}
export const CHECKS: Check[] = [
  { name: "core-floor", run: checkToolFloor, applies: always },
  { name: "role", run: checkRole, applies: always },
  { name: "rip-graveyard", run: checkRipGraveyard, applies: always },
  { name: "rip-graveyard-tmp", run: checkRipGraveyardTmp, applies: always },
  { name: "links", run: checkLinks, applies: always },
  { name: "google-drive", run: checkGoogleDrive, applies: always },
  { name: "rendered", run: checkRendered, applies: always },
  { name: "skills", run: checkSkills, applies: always },
  {
    name: "brew",
    run: checkBrew,
    applies: always,
  },
  { name: "brew-ondemand", run: checkBrewOndemand, applies: always },
  {
    name: "core-tools",
    run: checkCoreTools,
    applies: always,
  },
  { name: "brew-shadows", run: checkBrewShadows, applies: always },
  { name: "deps", run: checkDeps, applies: always },
  { name: "bins", run: checkBins, applies: always },
  { name: "skill-helper-paths", run: checkSkillHelperPaths, applies: always },
  { name: "git-hooks", run: checkGitHooks, applies: always },
  { name: "login-shell", run: checkLoginShell, applies: always },
  { name: "mise-scope", run: checkMiseScope, applies: always },
  { name: "bun-floor", run: checkBunFloor, applies: always },
  { name: "bun-runtime", run: checkBunRuntime, applies: always },
  { name: "mcp", run: checkMcp, applies: always },
  {
    name: "codex-runtime",
    run: checkCodexRuntime,
    applies: (c) => (c.isWsl ? null : "WSL only"),
  },
  { name: "codex-remote", run: checkCodexRemote, applies: always },
  {
    name: "codex-config",
    run: checkCodexSandboxNetwork,
    applies: always,
  },
  { name: "smart-open", run: checkSmartOpen, applies: always },
  {
    name: "edge-policy",
    run: checkEdgePolicy,
    applies: (c) => (c.isMac ? null : "macOS only"),
  },
  {
    name: "wslconfig",
    run: checkWslconfig,
    applies: (c) => (c.isWsl ? null : "WSL only"),
  },
  {
    name: "wsl-gpu-path",
    run: checkWslGpuPath,
    applies: (c) => (c.isWsl ? null : "WSL only"),
  },
  {
    name: "ccc-daemon",
    run: checkCccDaemon,
    applies: (c) => (c.isMac ? "Linux only" : null),
  },
  {
    name: "capacity-guard",
    run: checkCapacityGuard,
    applies: (c) => (c.isWsl ? null : "WSL only"),
  },
  {
    name: "ws-gc",
    run: checkWsGc,
    applies: (c) => (c.isMac ? "Linux only" : null),
  },
  {
    name: "gpu-sampler",
    run: checkGpuSampler,
    applies: (c) => (c.isMac ? "Linux only" : null),
  },
  {
    name: "statusline-owners",
    run: checkStatuslineOwners,
    applies: always,
  },
  {
    name: "recover-health",
    run: checkRecoverHealth,
    applies: (c) => (c.isWsl ? null : "WSL only"),
  },
  {
    name: "tmpfs-capacity",
    run: checkTmpfsCapacity,
    applies: (c) => (c.isWsl ? null : "WSL only"),
  },
  {
    name: "ccc-db-map",
    run: checkCccDbMap,
    applies: (c) =>
      c.isCoreBox && !c.isWsl ? "ccc is not a core tool (Brewfile.core)" : null,
  },
  { name: "git-ref-locks", run: checkGitRefLocks, applies: always },
  { name: "agx", run: checkAgx, applies: always },
  {
    name: "iterm2",
    run: checkIterm2,
    applies: (c) => (c.isMac ? null : "macOS only"),
  },
];

export function render(findings: Finding[]): string {
  const width = Math.max(...findings.map((f) => f.name.length));
  const out: string[] = [];
  for (const f of findings) {
    out.push(`${f.verdict.padEnd(4)}  ${f.name.padEnd(width)}  ${f.detail}`);
    for (const l of f.lines ?? []) out.push(`${" ".repeat(width + 8)}- ${l}`);
    if (f.fix !== undefined && f.fix !== "")
      out.push(`${" ".repeat(width + 8)}fix: ${f.fix}`);
  }
  const count = (v: Verdict) => findings.filter((f) => f.verdict === v).length;
  out.push(
    `RESULT: ${count("FAIL") > 0 ? "FAIL" : "PASS"} · FAIL ${count("FAIL")} · WARN ${count("WARN")} · PASS ${count("PASS")} · SKIP ${count("SKIP")}`,
  );
  return `${out.join("\n")}\n`;
}

async function main(): Promise<void> {
  const home = process.env["HOME"] ?? homedir();
  const ctx: Ctx = {
    home,
    dotfiles: process.env["DOTFILES"] ?? join(import.meta.dir, ".."),
    isMac: process.platform === "darwin",
    isWsl: /microsoft/iu.test(release()), // same test as link-dots.ts: `uname -r`
    isCoreBox: process.platform === "linux" && !/microsoft/iu.test(release()),
  };
  const only = (process.env["DOCTOR_ONLY"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = only.filter((n) => !CHECKS.some((c) => c.name === n));
  if (unknown.length > 0) {
    consola.error(
      `FATAL: DOCTOR_ONLY names unknown check(s): ${unknown.join(", ")}`,
    );
    process.exitCode = 2;
    return;
  }
  const selected =
    only.length > 0 ? CHECKS.filter((c) => only.includes(c.name)) : CHECKS;
  // Independent probes run concurrently; the report keeps the declared order.
  const findings = await Promise.all(
    selected.map(async (c) => {
      const why = c.applies(ctx);
      if (why !== null) return skip(c.name, why);
      const finding = await attempt(() => c.run(ctx));
      return finding.ok
        ? finding.value
        : warn(c.name, `check crashed: ${errorMessage(finding.error)}`);
    }),
  );
  process.stdout.write(render(findings));
  process.exitCode = findings.some((f) => f.verdict === "FAIL") ? 1 : 0;
}

if (import.meta.main) {
  const result = await attempt(main);
  if (!result.ok) {
    consola.error(`FATAL: ${errorMessage(result.error)}`);
    process.exitCode = 2;
  }
}
