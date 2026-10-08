import type {
  ActionResult,
  Candidate,
  Config,
  ReceiptAction,
  Tier,
} from "../model.ts";
import type { LivenessSnapshot } from "../liveness/facts.ts";
import { clean } from "./clean.ts";
import { builds } from "./builds.ts";
import { rust } from "./rust.ts";
import { toolchains } from "./toolchains.ts";
import { workspaces } from "./workspaces.ts";
import { scratch } from "./scratch.ts";
import { system } from "./system.ts";
import { judgment } from "./judgment.ts";
import { purge } from "./purge.ts";
import { host } from "./host.ts";
import { vhdx } from "./vhdx.ts";
import { audit } from "./audit.ts";

export type Context = {
  mode: "plan" | "run";
  /** Whether the user named this target instead of receiving it through a tier. */
  explicit?: boolean;
  config: Config;
  /** Opt-in remote refresh; omitted means off. */
  fetch?: boolean;
  progress?: boolean | undefined;
  progressTty?: boolean | undefined;
  reportProgress?:
    | ((target: string, root: string, entries: number, bytes: number) => void)
    | undefined;
  targetName?: string | undefined;
  procDir?: string | undefined;
  /** One facts snapshot per plan, refreshed under the lock before actions. */
  liveness?: LivenessSnapshot;
  log: (message: string) => void;
  /** Persist recovery before a multi-step action (e.g. workspace forget). */
  recordRecovery?:
    | ((candidate: Candidate, recovery: ReceiptAction["recovery"]) => void)
    | undefined;
};
export type Availability = { available: boolean; skip_reason: string | null };
export interface Target {
  name: string;
  tier: Tier;
  description?: { what: string; why: string };
  available(this: void, ctx: Context): Availability | Promise<Availability>;
  plan(this: void, ctx: Context): Candidate[] | Promise<Candidate[]>;
  act(
    this: void,
    candidate: Candidate,
    ctx: Context,
  ): ActionResult | Promise<ActionResult>;
}
// Registry order is execution order. Workspaces remove nested working copies before scratch.
export const registry: Target[] = [
  {
    ...clean,
    description: {
      what: "regenerable package caches",
      why: "recover cache space",
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
    ...purge,
    description: {
      what: "empty graveyards permanently",
      why: "must be named and authorized with --yes",
    },
  },
  {
    ...host,
    description: {
      what: "Windows swap and winget cache",
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
