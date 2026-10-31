import { exists, lstat, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { collectProcesses, resolveProcRoot, type OpenPaths } from "./procs.ts";

export type ProtectionOptions = {
  /** Override external Homebrew discovery for isolated fixtures. */
  brewPrefix?: string | null | undefined;
  ownerTarget?: string | undefined;
  home?: string | undefined;
  repoRoots?: string[] | undefined;
  protectedPaths?: string[] | undefined;
  procDir?: string | undefined;
  ignoreUnreadableProcs?: readonly string[] | undefined;
  /** A stage-wide process snapshot; omitted means a fresh /proc scan per call. */
  processes?: { openPaths: (path: string) => OpenPaths } | undefined;
};

let brewPrefix: Promise<string | null> | undefined;
function brewPrefixOnce(): Promise<string | null> {
  brewPrefix ??= (async () => {
    const brew = await fromAsyncThrowable(async () => {
      const child = Bun.spawn(["brew", "--prefix"], {
        stdout: "pipe",
        stderr: "ignore",
      });
      const [exitCode, output] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
      ]);
      return { exitCode, output };
    })();
    const prefix =
      brew.isOk() && brew.value.exitCode === 0 ? brew.value.output.trim() : "";
    return isAbsolute(prefix) ? resolve(prefix) : null;
  })();
  return brewPrefix;
}

const within = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);
const normalized = (path: string): string => resolve(path);
const real = async (path: string): Promise<string> =>
  (await fromAsyncThrowable(() => realpath(path))()).unwrapOr(normalized(path));

async function repoRoots(
  configured: string[],
  home: string,
): Promise<string[]> {
  const roots = await Promise.all(
    configured.map(async (entry) => {
      const path = entry.replace(/^~(?=\/|$)/u, home);
      if (!path.includes("*")) return [normalized(path)];
      const prefix = path.slice(0, path.indexOf("*"));
      const parent = dirname(
        prefix.endsWith("/") ? prefix.slice(0, -1) : prefix,
      );
      const entries = await fromAsyncThrowable(() =>
        readdir(parent, { withFileTypes: true }),
      )();
      return entries.isErr()
        ? []
        : entries.value
            .filter((item) => item.isDirectory())
            .map((item) => join(parent, item.name));
    }),
  );
  return roots.flat();
}

async function hasDirectory(path: string): Promise<boolean> {
  const result = await fromAsyncThrowable(() => lstat(path))();
  return result.isOk() && result.value.isDirectory();
}

async function linksInDir(dir: string): Promise<string[]> {
  const entries = await fromAsyncThrowable(() => readdir(dir))();
  if (entries.isErr()) return [];
  const links = await Promise.all(
    entries.value.map(async (name) => {
      const link = join(dir, name);
      const stat = await fromAsyncThrowable(() => lstat(link))();
      return stat.isOk() && stat.value.isSymbolicLink()
        ? [await real(link)]
        : [];
    }),
  );
  return links.flat();
}

async function linkResolvedRoots(home: string): Promise<string[]> {
  return (
    await Promise.all(
      [`${home}/.bun/bin`, `${home}/.local/bin`].map((dir) => linksInDir(dir)),
    )
  ).flat();
}

async function repoEnvironmentProtection(
  path: string,
  root: string,
): Promise<string | null> {
  if (within(root, path)) {
    const children = [".venv", "node_modules"].map((name) => join(root, name));
    const present = await Promise.all(children.map((child) => exists(child)));
    if (
      children.some(
        (child, index) => present[index] === true && within(child, path),
      )
    )
      return "project environment or dependencies belong to repo";
  }
  if (within(path, root)) {
    const relative = path.slice(root.length).replace(/^\//u, "").split("/");
    if (relative.some((part) => part === ".venv" || part === "node_modules"))
      return "project environment or dependencies belong to repo";
  }
  return null;
}

async function repoProtection(
  path: string,
  roots: string[],
): Promise<string | null> {
  for (const root of roots) {
    const reason = await repoEnvironmentProtection(path, root);
    if (reason !== null) return reason;
  }
  return null;
}

// Home- and config-derived root lists (symlink targets of the bin dirs, expanded repo roots) are
// read from disk. Under a stage's one process snapshot they are read once per stage, not once per
// candidate; without a snapshot every call reads fresh.
const stageRootLists = new WeakMap<object, Map<string, Promise<string[]>>>();
function perStage(
  snapshot: object | undefined,
  key: string,
  compute: () => Promise<string[]>,
): Promise<string[]> {
  if (snapshot === undefined) return compute();
  const lists =
    stageRootLists.get(snapshot) ?? new Map<string, Promise<string[]>>();
  stageRootLists.set(snapshot, lists);
  const known = lists.get(key);
  if (known !== undefined) return known;
  const fresh = compute();
  lists.set(key, fresh);
  return fresh;
}

export async function protectedReason(
  candidate: string,
  options: ProtectionOptions = {},
): Promise<string | null> {
  const path = normalized(candidate);
  const home = options.home ?? process.env["HOME"] ?? homedir();
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
    (await hasDirectory(join(path, "target")))
  )
    return "contains Rust target owned by rust target";

  const prefix =
    options.brewPrefix === undefined
      ? await brewPrefixOnce()
      : options.brewPrefix;
  if (prefix !== null) protectedRoots.push(prefix);
  if (protectedRoots.some((root) => within(path, root) || within(root, path)))
    return "tool installation root";
  if (options.ownerTarget === "toolchains" && path === rustupToolchains)
    return "tool installation root";
  if (
    (
      await perStage(options.processes, `links:${homePath}`, () =>
        linkResolvedRoots(homePath),
      )
    ).some((root) => within(path, root) || within(root, path))
  )
    return "resolves into tool bin symlink";

  const repoRule = await repoProtection(
    path,
    await perStage(
      options.processes,
      `repos:${homePath}:${JSON.stringify(options.repoRoots ?? [])}`,
      () => repoRoots(options.repoRoots ?? [], homePath),
    ),
  );
  if (repoRule !== null) return repoRule;
  const processes = (
    options.processes ??
    collectProcesses({
      procRoot: resolveProcRoot(options.procDir),
      ignoreUnreadableProcs: options.ignoreUnreadableProcs ?? [],
    })
  ).openPaths(path);
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
  if (
    processes.open.some(
      ({ path: processPath, via }) =>
        (via.startsWith("fd/") || via === "maps") && within(processPath, path),
    )
  )
    return "contains a running process open or mapped file";
  return null;
}
