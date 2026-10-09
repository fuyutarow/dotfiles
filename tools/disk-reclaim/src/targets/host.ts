import type { ActionResult, Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";
import { hostAction, hostProbe } from "./host-powershell.ts";

export type Swap = { path: string; mtimeMs: number; bytes: number };
type Lever = { id: string; path: string; bytes: number | null };
type Vhdx = {
  path: string;
  bytes: number | null;
  distro: string;
  state: string;
};
export type HostSnapshot = {
  swaps: Swap[];
  cFree: number | null;
  cTotal: number | null;
  wingetCache: number | null;
  wingetPath: string | null;
  levers: Lever[];
  vhdx: Vhdx[];
};
export type CommandResult = { code: number; out: string; timedOut: boolean };
export type HostRunner = (
  host: string,
  script: string,
) => Promise<CommandResult>;
export function classifySwaps(swaps: Swap[]) {
  const [live, ...orphans] = swaps.toSorted((a, b) => b.mtimeMs - a.mtimeMs);
  return {
    live: live ?? null,
    orphans,
    reclaimBytes: orphans.reduce((n, s) => n + s.bytes, 0),
  };
}
const numeric = (text: string | undefined): number | null =>
  text !== undefined && /^\d+$/u.test(text) ? Number(text) : null;
export function parseProbe(out: string): HostSnapshot {
  const s: HostSnapshot = {
    swaps: [],
    cFree: null,
    cTotal: null,
    wingetCache: null,
    wingetPath: null,
    levers: [],
    vhdx: [],
  };
  for (const raw of out.replaceAll("\r", "").split("\n")) {
    const line = raw.trim();
    const [, mt, bytes, path] = /^swap=(\d+)\|(\d+)\|(.+)$/u.exec(line) ?? [];
    if (mt !== undefined && bytes !== undefined && path !== undefined)
      s.swaps.push({ mtimeMs: Number(mt), bytes: Number(bytes), path });
    const [, key, value] =
      /^(c_free|c_total|winget_cache)=(\d+)$/u.exec(line) ?? [];
    if (key === "c_free") s.cFree = numeric(value);
    if (key === "c_total") s.cTotal = numeric(value);
    if (key === "winget_cache") s.wingetCache = numeric(value);
    const [, wp] = /^winget_path=(.+)$/u.exec(line) ?? [];
    if (wp !== undefined) s.wingetPath = wp;
    const [, id, size, location] =
      /^lever=([^|]+)\|(\d+|\?)\|(.+)$/u.exec(line) ?? [];
    if (id !== undefined && location !== undefined)
      s.levers.push({ id, bytes: numeric(size), path: location });
    const [, allocated, distro, state, disk] =
      /^vhdx=(\d+|\?)\|([^|]+)\|([^|]+)\|(.+)$/u.exec(line) ?? [];
    if (distro !== undefined && state !== undefined && disk !== undefined)
      s.vhdx.push({ path: disk, bytes: numeric(allocated), distro, state });
  }
  return s;
}
const sshRunner: HostRunner = async (host, script) => {
  const signal = AbortSignal.timeout(
    script.includes("dism.exe") ? 3_600_000 : 120_000,
  );
  const encoded = Buffer.from(
    script === "$probe" ? hostProbe : script,
    "utf16le",
  ).toString("base64");
  const proc = Bun.spawn(
    [
      "ssh",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      host,
      `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
    ],
    { stdout: "pipe", stderr: "pipe", signal },
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    code,
    out: `${out}${err}`.replaceAll("\r", ""),
    timedOut: signal.aborted,
  };
};
const definitions: Record<
  string,
  { live: boolean; approval: string | null; note: string }
> = {
  "orphan-swap": {
    live: true,
    approval: null,
    note: "OS locks the running swap",
  },
  "winget-cache": {
    live: true,
    approval: null,
    note: "regenerable winget cache",
  },
  "user-temp": {
    live: true,
    approval: null,
    note: "files older than 1 day only; virtual disks excluded",
  },
  "windows-temp": {
    live: true,
    approval: null,
    note: "files older than 1 day only; virtual disks excluded",
  },
  "delivery-optimization": {
    live: true,
    approval: null,
    note: "Delivery Optimization cache; may require elevation",
  },
  "wer-dumps": {
    live: true,
    approval: null,
    note: "WER and crash dumps; may require elevation",
  },
  "windows-update": {
    live: true,
    approval: null,
    note: "DISM StartComponentCleanup is slow; plan-only without --yes; requires elevation",
  },
  "recycle-bin": {
    live: true,
    approval: "recycle-bin",
    note: "permanently empties C: Recycle Bin",
  },
  "hibernate-off": {
    live: false,
    approval: "hibernate-off",
    note: "powercfg /h off changes the hibernation setting; requires elevation",
  },
};
function candidate(lever: Lever, ctx: Context, tier = lever.id): Candidate {
  const def = definitions[tier];
  const approved =
    def !== undefined &&
    (def.approval === null || ctx.approve?.includes(def.approval) === true);
  return {
    id: lever.id,
    path: null,
    verdict: def === undefined || !approved ? "ASK" : "RECLAIM",
    reason: `${def?.note ?? "unknown host lever"}${approved ? "" : `; requires --approve ${def?.approval}`}`,
    checks: [
      { name: "host-tier", ok: def !== undefined && approved, detail: tier },
    ],
    bytes: lever.bytes,
    bytes_kind: "estimate",
    host_lever: {
      path: lever.path,
      tier,
      live_safe: def?.live ?? false,
      approval: def?.approval ?? null,
    },
    action: { kind: "command", argv: [tier, lever.path] },
    result: null,
  };
}
export function createHostTarget(options: {
  host?: string;
  runner: HostRunner;
  snapshot?: () => Promise<HostSnapshot>;
}): Target {
  const hostname = (ctx: Context) => ctx.host ?? options.host ?? "r99";
  return {
    name: "host",
    tier: "owner",
    available: () => ({
      available:
        options.snapshot !== undefined ||
        options.runner !== sshRunner ||
        Bun.which("ssh") !== null,
      skip_reason: null,
    }),
    plan: async (ctx) => {
      const result =
        options.snapshot === undefined
          ? await options.runner(hostname(ctx), "$probe")
          : null;
      const s =
        result === null ? await options.snapshot!() : parseProbe(result.out);
      if (
        result?.timedOut === true ||
        (result !== null && result.code !== 0) ||
        (s.cFree === null && result !== null)
      )
        return [
          {
            ...candidate(
              { id: "host-probe", path: hostname(ctx), bytes: null },
              ctx,
            ),
            reason: "host probe failed or C: free measurement missing",
          },
        ];
      const { orphans } = classifySwaps(s.swaps);
      const levers = s.levers.slice();
      if (
        s.wingetCache !== null &&
        s.wingetCache > 0 &&
        s.wingetPath !== null &&
        !levers.some((l) => l.id === "winget-cache")
      )
        levers.push({
          id: "winget-cache",
          path: s.wingetPath,
          bytes: s.wingetCache,
        });
      return [
        ...orphans.map((o) =>
          candidate(
            { id: o.path, path: o.path, bytes: o.bytes },
            ctx,
            "orphan-swap",
          ),
        ),
        ...levers.map((l) => candidate(l, ctx)),
        ...s.vhdx.map((v): Candidate => {
          const report = candidate(
            { id: `vhdx:${v.path}`, path: v.path, bytes: v.bytes },
            ctx,
          );
          report.verdict = "KEEP";
          report.checks = [];
          report.action = { kind: "command", argv: [] };
          report.reason = `report only: allocated bytes; distro ${v.distro}; state ${v.state}; use disk-reclaim plan vhdx for compaction`;
          return report;
        }),
      ];
    },
    act: async (c, ctx): Promise<ActionResult> => {
      const tier = c.host_lever?.tier;
      const def = tier === undefined ? undefined : definitions[tier];
      if (def === undefined || tier === undefined || c.host_lever === undefined)
        return {
          ok: false,
          bytes_freed: null,
          error: "unknown or report-only host lever",
        };
      if (
        ctx.mode !== "run" ||
        (def.approval !== null && ctx.approve?.includes(def.approval) !== true)
      )
        return {
          ok: false,
          bytes_freed: null,
          error: `requires run authorization${def.approval === null ? "" : ` and --approve ${def.approval}`}`,
        };
      const r = await options.runner(
        hostname(ctx),
        hostAction(tier, c.host_lever.path),
      );
      const before = numeric(/^c_before=(\d+)$/mu.exec(r.out)?.[1]);
      const after = numeric(/^c_after=(\d+)$/mu.exec(r.out)?.[1]);
      if (before === null || after === null)
        return {
          ok: false,
          bytes_freed: null,
          error: "missing C: before/after measurement",
        };
      const delta = after - before;
      const inert = Math.abs(delta) < 1024 ** 2 ? "; inert here" : "";
      ctx.log(
        `${tier}: C: free ${before} -> ${after}; delta ${delta} bytes${inert}`,
      );
      c.reason += `; C: delta ${delta} bytes${inert}`;
      const ok = r.code === 0 && !r.timedOut;
      return {
        ok,
        bytes_freed: Math.max(0, delta),
        c_free_before: before,
        c_free_after: after,
        c_free_delta: delta,
        error: ok ? null : `${tier} failed: ${r.out.slice(-2000)}`,
      };
    },
  };
}
export const host = createHostTarget({ runner: sshRunner });
