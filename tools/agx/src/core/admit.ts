import { leases, type LeasePolicy, type RunView } from "./fold.ts";
import type { CoreEvent } from "./events.ts";
import type { Observer } from "./observe.ts";

export type AdmissionTicket = {
  writes: string[];
  cwd: string;
  workspace_root: string;
  ticket: string;
  lineage: string;
};
export type AdmissionPolicy = LeasePolicy & {
  on_conflict: "refuse" | "warn" | "off";
  scope: "repository" | "workspace";
  ignored: (path: string) => boolean;
};
export type Admission =
  | { ok: true; holders: RunView[]; warning?: string }
  | { ok: false; refused: string; holders: RunView[] };

const glob = (value: string) =>
  new RegExp(`^${value.split("**").join(".*").split("*").join("[^/]*")}$`, "u");
const overlaps = (left: string, right: string): boolean =>
  glob(left).test(right) || glob(right).test(left) || left === right;

/** Pure admission check; ignored paths are removed before conflict matching. */
export function admit(
  ticket: AdmissionTicket,
  events: readonly CoreEvent[],
  observer: Observer,
  policy: AdmissionPolicy,
): Admission {
  const writes = ticket.writes.filter((path) => !policy.ignored(path));
  if (policy.on_conflict === "off" || writes.length === 0)
    return { ok: true, holders: [] };
  const holders = leases(events, observer, policy).filter((holder) => {
    const sameScope =
      policy.scope === "repository"
        ? holder.workspace_root === ticket.workspace_root
        : holder.cwd === ticket.cwd;
    return (
      sameScope &&
      holder.writes.some(
        (owned) =>
          !policy.ignored(owned) &&
          writes.some((requested) => overlaps(owned, requested)),
      )
    );
  });
  if (holders.length === 0) return { ok: true, holders };
  return policy.on_conflict === "warn"
    ? { ok: true, holders, warning: "write paths overlap active leases" }
    : { ok: false, refused: "write paths overlap active leases", holders };
}
