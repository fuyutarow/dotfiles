import { access, readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import {
  liveExecutables,
  readStore,
  releasesToRemove,
  STORES,
  type Release,
} from "../lib/version-stores.ts";
import type { Context, Target } from "./index.ts";
import { deleteTree, keepTreeCandidate, treeCandidate } from "./tree.ts";
import { checkScanDeadline } from "../lib/scan-cache.ts";

const walkPins = async (root: string, depth = 0): Promise<string[]> => {
  checkScanDeadline();
  if (depth > 5) return [];
  const names = (await fromAsyncThrowable(() => readdir(root))()).unwrapOr([]);
  return (
    await Promise.all(
      names.map(async (name) => {
        const path = join(root, name);
        const info = await fromAsyncThrowable(() => stat(path))();
        if (info.isErr()) return [];
        if (info.value.isDirectory()) return walkPins(path, depth + 1);
        if (name === "rust-toolchain" || name === "rust-toolchain.toml")
          return [path];
        return [];
      }),
    )
  ).flat();
};
const channel = (text: string) =>
  /channel\s*=\s*"?([^"\s]+)"?/u.exec(text)?.[1] ??
  text.trim().split("\n")[0]?.trim();
const serverRefusal = (
  busy: number | undefined,
  newest: boolean,
  recent: boolean,
) => {
  if (busy === undefined) return "VS Code server process use unknown";
  if (busy === 0) return "VS Code server in use";
  if (newest) return "current VS Code server";
  if (recent) return "recent VS Code server";
  return null;
};
const releaseRefusal = (
  release: Release,
  store: string,
  current: string | undefined,
  live: string[] | undefined,
  cutoff: number,
) => {
  if (release.name === current) return `current ${store} release`;
  if (current === undefined) return `${store} current release unknown`;
  if (live === undefined) return `${store} release process use unknown`;
  if (release.mtimeSec >= cutoff) return `recent ${store} release`;
  if (
    live.some(
      (exe) => exe === release.path || exe.startsWith(`${release.path}/`),
    )
  )
    return `${store} release in use`;
  return `${store} release process use unknown`;
};
const retainedReleases = (
  releases: Release[],
  removable: Release[],
  store: string,
  current: string | undefined,
  live: string[] | undefined,
  cutoff: number,
  ctx: Context,
) =>
  Promise.all(
    releases
      .filter((release) => !removable.some((row) => row.path === release.path))
      .map((release) =>
        keepTreeCandidate(
          release.path,
          releaseRefusal(release, store, current, live, cutoff),
          ctx,
        ),
      ),
  );
export const createToolchainsTarget = (
  homePath: () => string = () => process.env["HOME"] ?? homedir(),
  rustupOptions?: {
    available: () => boolean;
    defaultToolchain: () => Promise<string | undefined>;
  },
  processProbe: (hash: string) => Promise<number | undefined> = async (hash) =>
    fromAsyncThrowable(async () => {
      const child = Bun.spawn(["pgrep", "-f", hash], {
        stdout: "ignore",
        stderr: "ignore",
        signal: AbortSignal.timeout(5000),
      });
      return child.exited;
    })().then((result) => result.unwrapOr(undefined)),
  options: {
    includeRefusals?: boolean;
    nowSec?: () => number;
    projects?: string;
    keepDays?: number;
  } = {},
) => {
  const rustup = rustupOptions ?? {
    available: () => Bun.which("rustup") !== null && Bun.which("fd") !== null,
    defaultToolchain: async () =>
      (
        await fromAsyncThrowable(async () => {
          const child = Bun.spawn(["rustup", "show", "active-toolchain"], {
            stdout: "pipe",
            stderr: "ignore",
            signal: AbortSignal.timeout(5000),
          });
          const [exitCode, stdout] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
          ]);
          void exitCode;
          return stdout.trim().split(/\s+/u)[0];
        })()
      ).unwrapOr(undefined),
  };
  return {
    name: "toolchains",
    tier: "blind",
    available: () => ({ available: true, skip_reason: null }),
    plan: async (_ctx: Context) => {
      const home = homePath();
      const projects =
        options.projects ??
        process.env["AUDIT_PROJECTS"] ??
        join(home, "Workspace");
      const keepDays =
        options.keepDays ?? Number(process.env["KEEP_DAYS"] ?? "2");
      const nowSec =
        options.nowSec?.() ??
        Math.floor(Temporal.Now.instant().epochMilliseconds / 1000);
      const live = await liveExecutables(_ctx.procDir);
      const candidates = [];
      const rustupDir = join(home, ".rustup/toolchains");
      const pinPaths = await walkPins(projects);
      const pinReads = await Promise.all(
        pinPaths.map((path) =>
          fromAsyncThrowable(() => readFile(path, "utf8"))(),
        ),
      );
      const pins = pinReads
        .flatMap((result) =>
          result.map((text) => [channel(text) ?? ""]).unwrapOr([]),
        )
        .filter(Boolean);
      let rustupNames: string[] = [];
      let defaultName: string | undefined;
      if (
        rustup.available() &&
        (await fromAsyncThrowable(() => access(rustupDir))()).isOk()
      ) {
        rustupNames = (await fromAsyncThrowable(() => readdir(rustupDir))())
          .map((names) => names.toSorted())
          .unwrapOr([]);
        defaultName = await rustup.defaultToolchain();
      }
      for (const name of rustupNames) {
        const path = join(rustupDir, name);
        if (name === defaultName) {
          candidates.push(
            await keepTreeCandidate(path, "default rustup toolchain", _ctx),
          );
          continue;
        }
        if (pins.some((p) => name.startsWith(p) || p.startsWith(name))) {
          candidates.push(
            await keepTreeCandidate(path, "pinned rustup toolchain", _ctx),
          );
          continue;
        }
        candidates.push(
          await treeCandidate(
            path,
            "non-default rustup toolchain is not pinned",
            _ctx,
          ),
        );
      }
      const servers = join(home, ".vscode-server/cli/servers");
      const serverEntries = (await fromAsyncThrowable(() => readdir(servers))())
        .unwrapOr([])
        .filter((name) => name.startsWith("Stable-"));
      const serverNames = (
        await Promise.all(
          serverEntries.map(async (name) => {
            const info = await fromAsyncThrowable(() =>
              stat(join(servers, name)),
            )();
            return info.isOk() && info.value.isDirectory() ? [name] : [];
          }),
        )
      ).flat();
      let newest: string | undefined;
      for (const name of serverNames) {
        const serverStat = await fromAsyncThrowable(() =>
          stat(join(servers, name)),
        )();
        if (serverStat.isErr()) continue;
        if (newest === undefined) {
          newest = name;
          continue;
        }
        const latestName = newest;
        const latest = await fromAsyncThrowable(() =>
          stat(join(servers, latestName)),
        )();
        if (latest.isOk() && serverStat.value.mtimeMs > latest.value.mtimeMs)
          newest = name;
      }
      for (const name of serverNames) {
        const path = join(servers, name);
        const hash = name.replace(/^Stable-/u, "").replace(/\.staging$/u, "");
        const busy = await processProbe(hash);
        const serverStat = await fromAsyncThrowable(() => stat(path))();
        if (serverStat.isErr()) continue;
        const reason =
          options.includeRefusals === true
            ? serverRefusal(
                busy,
                name === newest,
                serverStat.value.mtimeMs / 1000 >= nowSec - keepDays * 86400,
              )
            : null;
        if (reason !== null) {
          candidates.push(await keepTreeCandidate(path, reason, _ctx));
          continue;
        }
        if (busy === undefined) continue;
        if (
          name === newest ||
          serverStat.value.mtimeMs / 1000 >= nowSec - keepDays * 86400 ||
          busy === 0
        )
          continue;
        candidates.push(
          await treeCandidate(path, "old idle VS Code server version", _ctx),
        );
      }
      for (const store of STORES) {
        const found = await readStore(home, store);
        const removable = releasesToRemove(found.releases, {
          current: found.current,
          live,
          nowSec,
          keepDays,
        });
        if (options.includeRefusals === true)
          candidates.push(
            ...(await retainedReleases(
              found.releases,
              removable,
              store.name,
              found.current,
              live,
              nowSec - keepDays * 86400,
              _ctx,
            )),
          );
        for (const release of removable)
          candidates.push(
            await treeCandidate(
              release.path,
              `superseded ${store.name} release`,
              _ctx,
            ),
          );
      }
      return candidates;
    },
    act: deleteTree,
  } satisfies Target;
};
export const toolchains = createToolchainsTarget();
