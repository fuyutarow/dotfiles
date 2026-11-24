import type {
  ActionResult,
  Candidate,
  Config,
  Headroom,
  ReceiptAction,
  Tier,
} from "#src/model.ts";
import type { LivenessSnapshot } from "#src/liveness/facts.ts";
import type { RemoveTreeResult } from "#src/lib/remove-tree.ts";
import { clean } from "#src/targets/clean.ts";
import { builds } from "#src/targets/builds.ts";
import { rust } from "#src/targets/rust.ts";
import { toolchains } from "#src/targets/toolchains.ts";
import { workspaces } from "#src/targets/workspaces.ts";
import { scratch } from "#src/targets/scratch.ts";
import { system } from "#src/targets/system.ts";
import { judgment } from "#src/targets/judgment.ts";
import { purge, purgeRip } from "#src/targets/purge.ts";
import { host } from "#src/targets/host.ts";
import { vhdx } from "#src/targets/vhdx.ts";
import { audit } from "#src/targets/audit.ts";
import { tmpfs } from "#src/targets/tmpfs.ts";
import { miseConfigs } from "#src/targets/mise-configs.ts";
import { cccIndexDb } from "#src/targets/ccc-index-db.ts";

export type Context = {
  mode: "plan" | "run";
  scanCacheDir?: string | undefined;
  remoteProbes?: Map<string, Promise<Availability>> | undefined;
  signal?: AbortSignal;
  /** Whether the user named this target instead of receiving it through a tier. */
  explicit?: boolean;
  config: Config;
  /** The exact plan-scoped measurement; purge uses it to judge its own drive. */
  headroom?: Headroom;
  underPressure?: boolean;
  /** Limit a graveyard or tmpfs target to this one subtree (absolute path). */
  only?: string | undefined;
  /** Opt-in remote refresh; omitted means off. */
  fetch?: boolean;
  host?: string;
  approve?: string[];
  progress?: boolean | undefined;
  progressTty?: boolean | undefined;
  reportProgress?:
    | ((
        target: string,
        root: string,
        entries: number,
        bytes: number,
        done?: boolean,
        phase?: "scan" | "delete",
        totalBytes?: number,
      ) => void)
    | undefined;
  targetName?: string | undefined;
  procDir?: string | undefined;
  verbose?: boolean | undefined;
  reportActivity?: ((unit: string, task: string) => void) | undefined;
  reportPlanError?: ((message: string, partial?: boolean) => void) | undefined;
  reportProcessFailures?:
    | ((summary: string, details: string[]) => void)
    | undefined;
  /** One facts snapshot per plan, refreshed under the lock before actions. */
  liveness?: LivenessSnapshot;
  log: (message: string) => void;
  reportRemoval?: (result: RemoveTreeResult) => void;
  /** Persist recovery before a multi-step action (e.g. workspace forget). */
  recordRecovery?:
    | ((candidate: Candidate, recovery: ReceiptAction["recovery"]) => void)
    | undefined;
  /** Rip expiry may yield the run lock after a complete payload action. */
  yieldForegroundLock?:
    | ((payloadsCompleted: number) => boolean | Promise<boolean>)
    | undefined;
  foregroundLockYielded?: (() => boolean) | undefined;
  foregroundLockYieldReceipt?:
    | (() =>
        | {
            payloads_completed: number;
            reason: string;
          }
        | undefined)
    | undefined;
};
export type Availability = { available: boolean; skip_reason: string | null };
export interface Target {
  name: string;
  tier: Tier;
  /** Run previews enumerate ownership only; measurement is deferred until each recheck. */
  incremental?: boolean;
  /** Persist a fair action cursor across bounded recovery invocations. */
  resumeCandidates?: boolean;
  description?: { what: string; why: string };
  available(this: void, ctx: Context): Availability | Promise<Availability>;
  plan(this: void, ctx: Context): Candidate[] | Promise<Candidate[]>;
  act(
    this: void,
    candidate: Candidate,
    ctx: Context,
  ): ActionResult | Promise<ActionResult>;
  /**
   * Re-judge one candidate against the stage's single liveness snapshot, without
   * re-planning the whole target. Omitted means the engine re-plans the target.
   */
  recheck?(
    this: void,
    candidate: Candidate,
    ctx: Context,
  ): Candidate | null | Promise<Candidate | null>;
  /** Runs once after the stage's last candidate (per-stage measurements and summaries). */
  finish?(this: void, ctx: Context): void | Promise<void>;
  /** Act on the cheapest candidates (fewest measured bytes) first; unmeasured ones go last. */
  fastFirst?: boolean;
}
// Registry order is execution order. Workspaces remove nested working copies before scratch.
export const registry: Target[] = [
  {
    ...tmpfs,
    description: {
      what: "stale temporary directories and RAM-backed rip graveyards",
      why: "recover tmpfs inodes without touching active session data",
    },
  },
  {
    ...clean,
    description: {
      what: "regenerable package caches",
      why: "recover cache space",
    },
  },
  {
    ...cccIndexDb,
    description: {
      what: "deregistered or missing-project ccc index DB artifacts",
      why: "expire unreachable workspace and throwaway indexes after the declared collection TTL",
    },
  },
  {
    ...builds,
    description: {
      what: "regenerable build directories",
      why: "kondo --all parity",
    },
  },
  {
    ...rust,
    description: {
      what: "old idle Rust targets",
      why: "preserve recent and busy projects",
    },
  },
  {
    ...toolchains,
    description: {
      what: "superseded unpinned toolchain and CLI versions",
      why: "preserve current, pinned, and live versions",
    },
  },
  {
    ...miseConfigs,
    description: {
      what: "dead mise tracked, trusted, and ignored config records",
      why: "keep stale workspace config records from accumulating",
    },
  },
  {
    ...workspaces,
    description: {
      what: "jj workspace forget and real delete",
      why: "only fully pushed, idle workspaces; dead session required under scratch",
    },
  },
  {
    ...scratch,
    description: {
      what: "real delete of finished-session scratchpads",
      why: "only proven-dead sessions; nested working copies go through workspaces first",
    },
  },
  {
    ...system,
    description: {
      what: "apt, journal, and fstrim maintenance",
      why: "WSL and passwordless sudo required; otherwise SKIP",
    },
  },
  {
    ...judgment,
    description: {
      what: "offline Rust docs",
      why: "requires an owner decision",
    },
  },
  {
    ...purgeRip,
  },
  {
    ...purge,
    description: {
      what: "empty graveyards permanently",
      why: "must be named and authorized with --yes",
    },
  },
  {
    ...host,
    description: {
      what: "Windows host cleanup tiers over SSH",
      why: "requires an owner decision",
    },
  },
  {
    ...vhdx,
    description: {
      what: "elevated VHDX compaction procedure",
      why: "plan only; run refuses",
    },
  },
  {
    ...audit,
    description: {
      what: "stale dotdirs, caches, graveyards, and receipts",
      why: "read-only audit included in the default plan and plan --all",
    },
  },
];
