// `mise run reclaim:judgment[:yes]` — owner-approved cleanup of active Rust targets and optional
// Rust documentation. The receipt wrapper records the complete output and before/after free space.
import { $ } from "bun";
import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import { buildCwds, projectIsBusy } from "./reclaim-rust-targets.ts";

export type RustTarget = { project: string; target: string };

/** Only optional documentation components are eligible; retain every other installed component. */
export function docsComponents(installed: readonly string[]): string[] {
  return installed.filter((name) => /^rust-docs(?:-|$)/u.test(name));
}

/** True when an executable resolved from PATH lives inside this target directory. */
export function holdsPathBinary(
  target: string,
  resolvedBinaries: readonly string[],
): boolean {
  return resolvedBinaries.some((binary) => {
    const rel = relative(target, binary);
    return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== "..");
  });
}

/** Resolve every executable directly in each PATH directory with the required readlink -f rule. */
function resolvePathEntry(entry: string): string[] | undefined {
  const resolved: string[] = [];
  const names = fromThrowable(() => readdirSync(entry))().unwrapOr([]);
  for (const name of names) {
    const candidate = join(entry, name);
    const executable = fromThrowable(() => {
      accessSync(candidate, constants.X_OK);
      return statSync(candidate).isFile();
    })().unwrapOr(false);
    if (!executable) continue;
    const result = Bun.spawnSync(["readlink", "-f", candidate], {
      stdout: "pipe",
      stderr: "ignore",
    });
    if (result.exitCode !== 0) return undefined;
    resolved.push(result.stdout.toString().trim());
  }
  return resolved;
}

export function pathBinaries(
  pathValue = process.env.PATH ?? "",
): string[] | undefined {
  const resolved: string[] = [];
  for (const entry of pathValue.split(":").filter(Boolean)) {
    const binaries = resolvePathEntry(entry);
    if (binaries === undefined) return undefined;
    resolved.push(...binaries);
  }
  return resolved;
}

function sizeBytes(path: string): number {
  const result = Bun.spawnSync(["du", "-sk", path], {
    stdout: "pipe",
    stderr: "ignore",
  });
  if (result.exitCode !== 0) return 0;
  return Number(result.stdout.toString().split("\t")[0] ?? 0) * 1024;
}

function docsBytes(rustupHome: string): number {
  const roots = fromThrowable(() =>
    readdirSync(join(rustupHome, "toolchains")),
  )().unwrapOr([]);
  return roots.reduce(
    (sum, toolchain) =>
      sum +
      sizeBytes(
        join(rustupHome, "toolchains", toolchain, "share/doc/rust/html"),
      ),
    0,
  );
}

function bytes(n: number): string {
  return `${n.toLocaleString("en-US")} bytes`;
}

function skipReason(
  project: string,
  target: string,
  busy: readonly string[] | undefined,
  binaries: readonly string[] | undefined,
): string | undefined {
  if (busy === undefined) return "no /proc evidence — keep";
  if (binaries === undefined) return "could not resolve PATH binaries — keep";
  if (projectIsBusy(project, busy))
    return "cargo/rustc running inside project — keep";
  if (holdsPathBinary(target, binaries))
    return "PATH command resolves inside target — keep";
  return undefined;
}

// Cleye 2.6.0's strictFlags misses --__proto__; reject that prototype-sensitive name before assignment (BG1,
// same guard as tools/repo-retrieve). Ordinary unknown flags remain strictFlags' responsibility.
let prototypeFlag = false;
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") prototypeFlag = true;
}

async function main(): Promise<number> {
  const parsed = cli(
    {
      name: "reclaim-judgment.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Plan or clean owner-approved active Rust targets and optional rust-docs.",
      },
      flags: { yes: { type: Boolean, default: false } },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (prototypeFlag) {
    process.stderr.write("usage: unknown option '--__proto__'\n");
    return 2;
  }
  if (parsed._.length > 0) {
    process.stderr.write(`usage: unexpected argument '${parsed._[0]}'\n`);
    return 2;
  }
  const act = parsed.flags.yes;
  const roots = process.env.AUDIT_PROJECTS ?? join(homedir(), "Workspace");
  if (Bun.which("fd") === null) {
    console.log(`== Rust target/ (all ages; root ${roots}) ==`);
    console.log("  fd absent — skip; target inventory is unknown");
  }
  const targetsRoot =
    Bun.which("fd") === null
      ? ""
      : (
          await $`fd -H -I -t d -d 4 --prune "^target$" ${roots}`
            .quiet()
            .nothrow()
        ).stdout.toString();
  const targets: RustTarget[] = targetsRoot
    .split("\n")
    .filter(Boolean)
    .flatMap((foundTarget) => {
      const target = resolve(foundTarget);
      const project = dirname(target);
      return fromThrowable(() =>
        statSync(join(project, "Cargo.toml")).isFile(),
      )().unwrapOr(false)
        ? [{ project, target }]
        : [];
    });
  const busy = buildCwds();
  const binaries = pathBinaries();
  if (Bun.which("fd") !== null)
    console.log(`== Rust target/ (all ages; root ${roots}) ==`);
  for (const item of targets) {
    const size = sizeBytes(item.target);
    const reason = skipReason(item.project, item.target, busy, binaries);
    if (reason !== undefined) {
      console.log(`  ${bytes(size)} ${item.target} — ${reason}`);
      continue;
    }
    console.log(
      `  ${bytes(size)} ${item.target} — ${act ? "clean" : "[dry-run] cargo clean"}`,
    );
    if (!act) continue;
    const before = sizeBytes(item.target);
    const result =
      await $`cargo clean --manifest-path ${join(item.project, "Cargo.toml")}`.nothrow();
    const after = sizeBytes(item.target);
    console.log(
      `    cargo clean exit ${result.exitCode}; freed ${bytes(Math.max(0, before - after))}`,
    );
  }

  console.log("== Optional rustup documentation components ==");
  if (Bun.which("rustup") === null) {
    console.log("  rustup absent — skip");
    return 0;
  }
  const list = await $`rustup component list --installed`.quiet().nothrow();
  const installed = list.stdout
    .toString()
    .split("\n")
    .flatMap((line) => {
      const name = /^(.+?)\s+\(installed\)$/u.exec(line)?.[1];
      return name === undefined ? [] : [name];
    });
  const docs = docsComponents(installed);
  const rustupHome = process.env.RUSTUP_HOME ?? join(homedir(), ".rustup");
  if (docs.length === 0) console.log("  no documentation components installed");
  for (const component of docs) {
    const size = docsBytes(rustupHome);
    console.log(
      `  ${bytes(size)} ${component} — ${act ? "remove" : "[dry-run] rustup component remove"}`,
    );
    if (!act) continue;
    const before = docsBytes(rustupHome);
    const result = await $`rustup component remove ${component}`.nothrow();
    const after = docsBytes(rustupHome);
    console.log(
      `    rustup component remove exit ${result.exitCode}; freed ${bytes(Math.max(0, before - after))}`,
    );
  }
  if (!act)
    console.log("Dry run only. Run `mise run reclaim:judgment:yes` to act.");
  return 0;
}

if (import.meta.main) process.exit(await main());
