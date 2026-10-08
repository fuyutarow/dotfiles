import { readdirSync } from "node:fs";
import { join } from "node:path";
import { removeTree, removeTreeProgress } from "../lib/remove-tree.ts";
import { fromThrowable } from "../../../shared/src/zod.ts";
import type { ActionResult, Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";

export type Swap = { path: string; mtimeMs: number; bytes: number };
export type HostSnapshot = {
  swaps: Swap[];
  cFree: number | null;
  cTotal: number | null;
  wingetCache: number | null;
  wingetPath: string | null;
};
export type CommandResult = { code: number; out: string; timedOut: boolean };
export type HostRunner = (
  host: string,
  script: string,
) => Promise<CommandResult>;

export function classifySwaps(swaps: Swap[]): {
  live: Swap | null;
  orphans: Swap[];
  reclaimBytes: number;
} {
  if (swaps.length === 0) return { live: null, orphans: [], reclaimBytes: 0 };
  const [live, ...orphans] = swaps.toSorted((a, b) => b.mtimeMs - a.mtimeMs);
  return {
    live: live ?? null,
    orphans,
    reclaimBytes: orphans.reduce((sum, s) => sum + s.bytes, 0),
  };
}

export function parseProbe(out: string): HostSnapshot {
  const swaps: Swap[] = [];
  let cFree: number | null = null,
    cTotal: number | null = null,
    wingetCache: number | null = null,
    wingetPath: string | null = null;
  for (const line of out.split("\n")) {
    const [, mt, bytes, path] =
      /^swap=(\d+)\|(\d+)\|(.+)$/u.exec(line.trim()) ?? [];
    if (mt !== undefined && bytes !== undefined && path !== undefined) {
      swaps.push({ mtimeMs: Number(mt), bytes: Number(bytes), path });
      continue;
    }
    const [, key, value] =
      /^(c_free|c_total|winget_cache)=(\d+)$/u.exec(line.trim()) ?? [];
    if (key === "c_free") cFree = Number(value);
    if (key === "c_total") cTotal = Number(value);
    if (key === "winget_cache") wingetCache = Number(value);
    const [, wp] = /^winget_path=(.*)$/u.exec(line.trim()) ?? [];
    if (wp !== undefined && wp !== "") wingetPath = wp;
  }
  return { swaps, cFree, cTotal, wingetCache, wingetPath };
}

const HOST_PROBE = `$ErrorActionPreference='SilentlyContinue'; $c=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"; "c_free="+$c.FreeSpace; "c_total="+$c.Size; Get-ChildItem $env:TEMP -Recurse -Filter swap.vhdx -File | % { "swap="+[int64]($_.LastWriteTime.ToUniversalTime()-(Get-Date '1970-01-01Z')).TotalMilliseconds+"|"+$_.Length+"|"+$_.FullName }; $wg="$env:LOCALAPPDATA\\Microsoft\\WinGet"; if(Test-Path $wg){ "winget_path="+$wg; "winget_cache="+((Get-ChildItem $wg -Recurse -File|Measure-Object Length -Sum).Sum+0) }`;
const sshRunner: HostRunner = async (host, script) => {
  const encoded = Buffer.from(
    script === "$probe" ? HOST_PROBE : script,
    "utf16le",
  ).toString("base64");
  const proc = Bun.spawn(
    [
      "ssh",
      "-o",
      "ConnectTimeout=10",
      host,
      `powershell.exe -NoProfile -EncodedCommand ${encoded}`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: `${out}${err}`.replaceAll("\r", ""), timedOut: false };
};

const winToWsl = (path: string): string | null => {
  const match = /^([A-Za-z]):\\(.*)$/u.exec(path);
  return match?.[1] === undefined || match[2] === undefined
    ? null
    : `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
};
const candidate = (
  id: string,
  windowsPath: string,
  bytes: number,
): Candidate => ({
  id,
  path: winToWsl(windowsPath),
  verdict: winToWsl(windowsPath) === null ? "ASK" : "RECLAIM",
  reason: "orphaned host swap or regenerable winget cache",
  checks: [
    {
      name: "windows-path-mapped",
      ok: winToWsl(windowsPath) !== null,
      detail: "mapped Windows volume into WSL",
    },
  ],
  bytes,
  bytes_kind: "estimate",
  action: { kind: "delete", argv: ["removeTree", windowsPath] },
  result: null,
});

export function createHostTarget(options: {
  host?: string;
  runner: HostRunner;
  snapshot?: () => Promise<HostSnapshot>;
}): Target {
  let probeError: string | null = null;
  const snapshot = async () => {
    if (options.snapshot !== undefined) return options.snapshot();
    const result = await options.runner(options.host ?? "r99", "$probe");
    if (result.timedOut) probeError = "host probe timed out";
    else if (result.code !== 0) probeError = `host probe exited ${result.code}`;
    else if (result.out.trim().length === 0)
      probeError = "host probe returned nothing";
    else probeError = null;
    return parseProbe(result.out);
  };
  return {
    name: "host",
    tier: "owner",
    available: () => ({
      available:
        process.platform === "linux" &&
        process.env.WSL_DISTRO_NAME !== undefined,
      skip_reason: "host target requires WSL",
    }),
    plan: async () => {
      const s = await snapshot();
      if (probeError !== null)
        return [
          {
            id: "host-probe",
            path: null,
            verdict: "ASK",
            reason: probeError,
            checks: [{ name: "host-probe", ok: null, detail: probeError }],
            bytes: null,
            bytes_kind: "estimate",
            action: { kind: "command", argv: [] },
            result: null,
          },
        ];
      const { orphans } = classifySwaps(s.swaps);
      return [
        ...orphans.map((o) => candidate(o.path, o.path, o.bytes)),
        ...(s.wingetCache !== null && s.wingetCache > 0 && s.wingetPath !== null
          ? [candidate("winget-cache", s.wingetPath, s.wingetCache)]
          : []),
      ];
    },
    act: (c: Candidate, ctx: Context): ActionResult => {
      if (c.path === null)
        return {
          ok: false,
          bytes_freed: null,
          error: "Windows path cannot be mapped to WSL",
        };
      let entries = [c.path];
      if (c.id === "winget-cache") {
        const cachePath = c.path;
        const names = fromThrowable(() => readdirSync(cachePath))();
        if (names.isErr())
          return { ok: false, bytes_freed: null, error: String(names.error) };
        entries = names.value.map((name) => join(cachePath, name));
      }
      let ok = true;
      let freed = 0;
      for (const entry of entries) {
        const r = removeTree(entry, {
          uid: process.getuid?.() ?? 0,
          protection: {
            ownerTarget: "host",
            procDir: ctx.procDir,
            repoRoots: [...ctx.config.repo_roots, ...ctx.config.repos],
            protectedPaths: ctx.config.protected ?? [],
            ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
          },
          progress: removeTreeProgress(entry, c.bytes, ctx),
        });
        freed += r.statfs_bytes_freed;
        for (const x of r.refused)
          ctx.log(`${x.path}: refused; repair: ${x.repair}`);
        for (const x of r.errors) ctx.log(`${x.path}: ${x.error}`);
        ok &&= r.ok;
      }
      return {
        ok,
        bytes_freed: freed,
        error: ok ? null : "host delete failed",
      };
    },
  };
}

export const host = createHostTarget({ runner: sshRunner });
