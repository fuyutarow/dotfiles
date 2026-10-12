import { randomUUID } from "node:crypto";
import { fromAsyncThrowable } from "neverthrow";
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
export type CommandResult = {
  code: number;
  out: string;
  err?: string;
  timedOut: boolean;
  step?: string;
  timeoutMs?: number;
};
export type HostRunner = (
  host: string,
  script: string,
  parentSignal?: AbortSignal,
  reportStep?: (step: string) => void,
) => Promise<CommandResult>;
const capturedStream = (value: string | undefined) => {
  const output = value?.trim() ?? "";
  return output.length === 0 ? "<empty>" : output.slice(-2000);
};
const isAborted = (signal: AbortSignal | undefined): boolean =>
  signal?.aborted === true;
const probeFailure = (result: CommandResult, reason: string): string =>
  [
    `host PowerShell probe failed: ${reason}; step=${result.step ?? "SSH/PowerShell"}; exit=${result.code}${result.timedOut ? `; timed out after ${result.timeoutMs ?? "unknown"} ms` : ""}`,
    `stdout: ${capturedStream(result.out)}`,
    `stderr: ${capturedStream(result.err)}`,
  ].join("\n");
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
export const HOST_PROBE_TIMEOUT_MS = 90_000;
export const createSshRunner =
  (options: { probeTimeoutMs?: number } = {}): HostRunner =>
  async (host, script, parentSignal, reportStep) => {
    if (isAborted(parentSignal))
      return { code: 1, out: "", err: "SSH probe cancelled", timedOut: false };
    let timeout = 120_000;
    if (script.includes("dism.exe")) timeout = 3_600_000;
    else if (script === "$probe")
      timeout = options.probeTimeoutMs ?? HOST_PROBE_TIMEOUT_MS;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const abort = () => {
      controller.abort();
    };
    parentSignal?.addEventListener("abort", abort, { once: true });
    let step = "SSH connect/authenticate (ConnectTimeout=10s)";
    const activity = (next: string) => {
      step = next;
      reportStep?.(`${next}; total timeout ${timeout / 1000}s`);
    };
    activity(step);
    const name = `disk-reclaim-${randomUUID()}.ps1`;
    const wrapper = [
      "$ErrorActionPreference='Stop'",
      "$ProgressPreference='SilentlyContinue'",
      "[Console]::Error.WriteLine('disk-reclaim-step=PowerShell stdin transfer')",
      `$scriptPath=Join-Path $env:TEMP '${name}'`,
      "$source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadLine()))",
      "[IO.File]::WriteAllText($scriptPath,$source,[Text.UTF8Encoding]::new($true))",
      "$exitCode=0",
      "try {",
      "  [Console]::Error.WriteLine('disk-reclaim-step=PowerShell script launch')",
      "  & powershell.exe -NoProfile -NonInteractive -File $scriptPath",
      "  if ($null -ne $LASTEXITCODE) { $exitCode=$LASTEXITCODE }",
      "} finally {",
      "  [Console]::Error.WriteLine('disk-reclaim-step=PowerShell script cleanup')",
      "  Remove-Item -LiteralPath $scriptPath -Force -ErrorAction SilentlyContinue",
      "}",
      "exit $exitCode",
    ].join("\n");
    const encoded = Buffer.from(wrapper, "utf16le").toString("base64");
    const proc = Bun.spawn(
      [
        "ssh",
        "-T",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ConnectionAttempts=1",
        host,
        `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
      ],
      {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        signal: controller.signal,
        killSignal: "SIGKILL",
      },
    );
    const captureError = async () => {
      const reader = proc.stderr.getReader();
      const decoder = new TextDecoder();
      let output = "";
      let pending = "";
      const lines = (chunk: string) => {
        output += chunk;
        pending += chunk;
        const completed = pending.split("\n");
        pending = completed.pop() ?? "";
        for (const line of completed) {
          const marker = /^disk-reclaim-step=(.+)$/u.exec(line.trim())?.[1];
          if (marker !== undefined) activity(marker);
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        lines(decoder.decode(value, { stream: true }));
      }
      lines(`${decoder.decode()}\n`);
      return output;
    };
    const result = await fromAsyncThrowable(async () => {
      const source = script === "$probe" ? hostProbe : script;
      const send = fromAsyncThrowable(async () => {
        await proc.stdin.write(
          `${Buffer.from(source, "utf8").toString("base64")}\n`,
        );
        await proc.stdin.end();
      })();
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(),
        captureError(),
        proc.exited,
        send,
      ]);
      return {
        code,
        out: out.replaceAll("\r", ""),
        err: err.replaceAll("\r", ""),
        timedOut,
        step,
        timeoutMs: timeout,
      };
    })();
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abort);
    return result.unwrapOr({
      code: 1,
      out: "",
      err: controller.signal.aborted ? "SSH probe aborted" : "SSH probe failed",
      timedOut,
      step,
      timeoutMs: timeout,
    });
  };
const sshRunner = createSshRunner();
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
  "windows-update-download": {
    live: true,
    approval: null,
    note: "Windows Update download cache; files older than 1 day only",
  },
  "windows-update-components": {
    live: true,
    approval: null,
    note: "DISM StartComponentCleanup is slow; plan-only without --yes; requires elevation",
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
  "browser-crash-dumps": {
    live: true,
    approval: null,
    note: "browser Crashpad reports and temporary dumps",
  },
  "npm-cache": { live: true, approval: null, note: "regenerable npm cache" },
  "pip-cache": { live: true, approval: null, note: "regenerable pip cache" },
  "uv-cache": { live: true, approval: null, note: "regenerable uv cache" },
  "nuget-cache": {
    live: true,
    approval: null,
    note: "regenerable NuGet cache",
  },
  "cargo-cache": {
    live: true,
    approval: null,
    note: "regenerable Cargo cache",
  },
  "nvidia-download-cache": {
    live: true,
    approval: null,
    note: "NVIDIA download caches; installed repair support excluded",
  },
  "winget-download-cache": {
    live: true,
    approval: null,
    note: "regenerable WinGet download cache",
  },
  "pagefile-size": {
    live: false,
    approval: "pagefile-size",
    note: "owner-only pagefile allocation from Win32_PageFileUsage accounting",
  },
  "claude-vm-bundles": {
    live: false,
    approval: "claude-vm-bundles",
    note: "owner-only Claude VM bundles containing virtual disks",
  },
  "windows-update": {
    live: true,
    approval: null,
    note: "legacy Windows Update component cleanup alias",
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
      ctx.reportActivity?.("host", `waiting for SSH ${hostname(ctx)} probe`);
      const result =
        options.snapshot === undefined
          ? await options.runner(hostname(ctx), "$probe", ctx.signal, (step) =>
              ctx.reportActivity?.("host", `waiting for ${step}`),
            )
          : null;
      if (result?.timedOut === true) {
        ctx.reportPlanError?.(probeFailure(result, "SSH step timed out"));
        return [];
      }
      if (result !== null && result.code !== 0) {
        ctx.reportPlanError?.(
          probeFailure(result, "SSH/PowerShell step returned a failure status"),
        );
        return [];
      }
      const s =
        result === null ? await options.snapshot!() : parseProbe(result.out);
      if (
        result !== null &&
        (s.cFree === null ||
          (s.levers.length === 0 &&
            s.swaps.length === 0 &&
            s.vhdx.length === 0))
      ) {
        ctx.reportPlanError?.(
          probeFailure(result, "PowerShell returned no usable probe records"),
        );
        return [];
      }
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
      const unit = `host/${hostname(ctx)}/${tier}`;
      ctx.reportActivity?.(unit, `waiting for ${tier} on ${hostname(ctx)}`);
      const r = await options.runner(
        hostname(ctx),
        hostAction(tier, c.host_lever.path),
        ctx.signal,
      );
      const before = numeric(/^c_before=(\d+)$/mu.exec(r.out)?.[1]);
      const after = numeric(/^c_after=(\d+)$/mu.exec(r.out)?.[1]);
      ctx.reportProgress?.(
        unit,
        unit,
        1,
        before === null || after === null ? 0 : Math.max(0, after - before),
        true,
        "delete",
      );
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
