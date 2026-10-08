import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fromThrowable } from "../../../shared/src/zod.ts";
import { collectProcesses } from "./procs.ts";

export type ProtectionOptions = {
  ownerTarget?: string | undefined;
  home?: string | undefined;
  repoRoots?: string[] | undefined;
  protectedPaths?: string[] | undefined;
  procDir?: string | undefined;
  ignoreUnreadableProcs?: readonly string[] | undefined;
};

const within = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);
const normalized = (path: string): string => resolve(path);
const real = (path: string): string =>
  fromThrowable(() => realpathSync(path))().unwrapOr(normalized(path));

function repoRoots(configured: string[], home: string): string[] {
  return configured.flatMap((entry) => {
    const path = entry.replace(/^~(?=\/|$)/u, home);
    if (!path.includes("*")) return [normalized(path)];
    const prefix = path.slice(0, path.indexOf("*"));
    const parent = dirname(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);
    const entries = fromThrowable(() =>
      readdirSync(parent, { withFileTypes: true }),
    )();
    return entries.isErr()
      ? []
      : entries.value
          .filter((item) => item.isDirectory())
          .map((item) => join(parent, item.name));
  });
}

function hasDirectory(path: string): boolean {
  const result = fromThrowable(() => lstatSync(path))();
  return result.isOk() && result.value.isDirectory();
}

function linksInDir(dir: string): string[] {
  const entries = fromThrowable(() => readdirSync(dir))();
  if (entries.isErr()) return [];
  return entries.value.flatMap((name) => {
    const link = join(dir, name);
    const stat = fromThrowable(() => lstatSync(link))();
    return stat.isOk() && stat.value.isSymbolicLink() ? [real(link)] : [];
  });
}

function linkResolvedRoots(home: string): string[] {
  return [`${home}/.bun/bin`, `${home}/.local/bin`].flatMap((dir) =>
    linksInDir(dir),
  );
}

function repoEnvironmentProtection(path: string, root: string): string | null {
  if (within(root, path)) {
    const children = [".venv", "node_modules"].map((name) => join(root, name));
    if (children.some((child) => existsSync(child) && within(child, path)))
      return "project environment or dependencies belong to repo";
  }
  if (within(path, root)) {
    const relative = path.slice(root.length).replace(/^\//u, "").split("/");
    if (relative.some((part) => part === ".venv" || part === "node_modules"))
      return "project environment or dependencies belong to repo";
  }
  return null;
}

function repoProtection(path: string, roots: string[]): string | null {
  for (const root of roots) {
    const reason = repoEnvironmentProtection(path, root);
    if (reason !== null) return reason;
  }
  return null;
}

export function protectedReason(
  candidate: string,
  options: ProtectionOptions = {},
): string | null {
  const path = normalized(candidate);
  const home = options.home ?? process.env.HOME ?? homedir();
  const homePath = normalized(home);
  const rustupToolchains = normalized(`${homePath}/.rustup/toolchains`);
  const protectedRoots = [
    `${homePath}/.bun/install/global`,
    `${homePath}/.bun/bin`,
    `${homePath}/.local/share/mise/installs`,
    `${homePath}/.local/share/mise/shims`,
    `${homePath}/.cargo/bin`,
    rustupToolchains,
    `${homePath}/.local/bin`,
    `${homePath}/.juliaup`,
    ...(options.protectedPaths ?? []).map((item) =>
      item.replace(/^~(?=\/|$)/u, homePath),
    ),
  ].map((root) => normalized(root));
  if (options.ownerTarget === "toolchains") {
    const withoutToolchains = protectedRoots.filter(
      (root) => root !== rustupToolchains,
    );
    protectedRoots.splice(0, protectedRoots.length, ...withoutToolchains);
  }
  const cleanOwnedRoots = [
    `${homePath}/.bun/install/cache`,
    `${homePath}/.npm/_cacache`,
    `${homePath}/.pnpm-store`,
    `${homePath}/.cache/uv`,
    `${homePath}/.cache/pip`,
    `${homePath}/.cargo/registry/src`,
    `${homePath}/.cargo/registry/cache`,
    `${homePath}/.cargo/git/checkouts`,
    `${homePath}/.julia`,
  ].map((root) => normalized(root));
  if (
    options.ownerTarget !== "clean" &&
    options.ownerTarget !== "delete" &&
    cleanOwnedRoots.some((root) => within(path, root) || within(root, path))
  )
    return "owned by clean target";
  if (
    options.ownerTarget !== "rust" &&
    options.ownerTarget !== "delete" &&
    path.split("/").includes("target")
  )
    return "owned by rust target";
  if (
    options.ownerTarget !== "rust" &&
    options.ownerTarget !== "delete" &&
    hasDirectory(join(path, "target"))
  )
    return "contains Rust target owned by rust target";

  const brew = fromThrowable(() =>
    Bun.spawnSync(["brew", "--prefix"], { stdout: "pipe", stderr: "ignore" }),
  )();
  if (brew.isOk() && brew.value.exitCode === 0) {
    const prefix = brew.value.stdout.toString().trim();
    if (isAbsolute(prefix)) protectedRoots.push(normalized(prefix));
  }
  if (protectedRoots.some((root) => within(path, root) || within(root, path)))
    return "tool installation root";
  if (options.ownerTarget === "toolchains" && path === rustupToolchains)
    return "tool installation root";
  if (
    linkResolvedRoots(homePath).some(
      (root) => within(path, root) || within(root, path),
    )
  )
    return "resolves into tool bin symlink";

  const repoRule = repoProtection(
    path,
    repoRoots(options.repoRoots ?? [], homePath),
  );
  if (repoRule !== null) return repoRule;
  const processes = collectProcesses({
    procRoot: options.procDir ?? process.env.RECLAIM_UNIT_PROC_ROOT ?? "/proc",
    ignoreUnreadableProcs: options.ignoreUnreadableProcs ?? [],
  }).openPaths(path);
  if (processes.unknown.length > 0) return "process paths are unknown";
  if (
    processes.open.some(
      ({ path: processPath, via }) =>
        via === "exe" &&
        (within(processPath, path) || within(path, processPath)),
    )
  )
    return "contains a running process executable";
  if (
    processes.open.some(
      ({ path: processPath, via }) =>
        via === "cwd" && within(processPath, path),
    )
  )
    return "contains a running process cwd";
  return null;
}
