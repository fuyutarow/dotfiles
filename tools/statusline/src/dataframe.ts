import type { Result } from "neverthrow";
import type { MemReading } from "./host-load.ts";
import type { DiskEntry } from "./storage.ts";
import type { RcState } from "./identity.ts";
import type { ModelLimit } from "./rate-limits.ts";
import type { CodexRate } from "./codex-rate.ts";
import type { JevUsage } from "./jev-usage.ts";
import type { Admitted } from "./jobs.ts";
import type { RouteScan } from "./dispatch-runs.ts";

// Every value this file can show, already computed — the sole output of buildDataframe() and
// sole input to render(). No ANSI codes, no row grouping, no ordering: a value here says
// nothing about where or whether it appears on screen.
// Optional fields carry explicit `| undefined`, not just `?:` — with exactOptionalPropertyTypes
// this is deliberate, not a widening-to-dodge-the-checker: undefined here is a real, distinct
// state render() branches on (its `!= null` checks decide whether a segment shows at all), and
// buildDataframe() assembles this object as one literal rather than conditionally spreading each
// of the ~11 optional keys in and out.
export interface Dataframe {
  cwd: string;
  sid?: string | undefined;
  sessionName?: string | undefined; // undefined with no sessionNameWhy = not listed yet
  sessionNameWhy?: string | undefined; // `claude agents --json` failed: the name is unknown
  email?: string | undefined;
  model: string;
  effort?: string | undefined;
  wfOn: boolean;
  /** Remote Control: on / off / unknown — see rcState(). */
  rc: RcState;
  ctx?: string | undefined; // undefined = the payload carried no token count (NOT zero tokens)
  ctxPct?: number | undefined;
  rl5?: number | undefined;
  rl5Reset?: number | undefined;
  rl7?: number | undefined;
  rl7Reset?: number | undefined;
  rlModel: ModelLimit[];
  accountWhy?: string | undefined; // ~/.claude.json unreadable / unexpected shape: email unknown
  modelCapsWhy?: string | undefined; // same, for the per-model weekly caps
  codexRate?: CodexRate | undefined;
  codexRateWhy?: string | undefined;
  jevUsage?: JevUsage | undefined;
  branch?: string | undefined; // undefined with no branchWhy = cwd is not a repo (nothing to show)
  branchWhy?: string | undefined; // the lookup itself failed — shown as n/a, never dropped
  add?: number | undefined; // undefined = the payload carried no cost block (NOT zero lines)
  del?: number | undefined;
  wt?: string | undefined;
  jobs: Admitted[];
  orphans: number;
  jobScanWhy?: string | undefined; // the process scan failed: jobs/orphans are unknown, not zero
  // agx workers. undefined = agx has never run on this machine (no state dir).
  routes?: Result<RouteScan, string> | undefined;
  dispatchWarning?: string | undefined; // codex-share warning for this host, see dispatch-warning.ts
  // Host readings are Results, not optionals: "could not be taken" carries its reason, and
  // render() prints it. See the EXPLICIT-ABSENCE law below.
  // undefined: this host has no discrete VRAM at all (see vramGated) — silence, not n/a.
  vram: Result<MemReading, string> | undefined;
  disks: Result<DiskEntry[], string>;
  cpuPct: Result<number, string>;
  ram: Result<MemReading, string>;
}
