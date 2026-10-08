import { profiles, type HostKind, type ProfileStep } from "./profiles.ts";
import { err, ok, type Result } from "neverthrow";

export type Plan = { target: string; kind: HostKind; steps: ProfileStep[] };

export function buildPlan(
  target: string,
  kind: HostKind,
  overlays: readonly ("wsl" | "mac")[] = [],
): Result<Plan, Error> {
  if (overlays.includes("mac") && kind !== "mac")
    return err(new Error(`+mac requires a mac target; '${target}' is ${kind}`));
  if (overlays.includes("wsl") && kind !== "wsl")
    return err(new Error(`+wsl requires a wsl target; '${target}' is ${kind}`));
  const selected = [...new Set(overlays)].toSorted();
  const byId = new Map<string, ProfileStep>();
  for (const step of profiles.core) {
    if (step.id === "c-toolchain" && kind === "mac") continue;
    byId.set(step.id, { ...step, host: kind });
  }
  if (kind === "linux")
    for (const step of profiles.linux) byId.set(step.id, step);
  for (const name of selected)
    for (const step of profiles[name]) byId.set(step.id, step);
  const steps = [...byId.values()];
  const ids = new Set(steps.map((step) => step.id));
  for (const step of steps) {
    if (step.host !== kind && step.host !== "target")
      return err(
        new Error(
          `step '${step.id}' requires ${step.host}; target '${target}' is ${kind}`,
        ),
      );
    const missing = step.prerequisites.find(
      (prerequisite) => !ids.has(prerequisite),
    );
    if (missing !== undefined)
      return err(
        new Error(
          `step '${step.id}' requires missing prerequisite '${missing}'`,
        ),
      );
  }
  const ordered: ProfileStep[] = [];
  const remaining = new Map(steps.map((step) => [step.id, step]));
  const complete = new Set<string>();
  while (remaining.size > 0) {
    const next = [...remaining.values()].find((step) =>
      step.prerequisites.every((id) => complete.has(id)),
    );
    if (next === undefined)
      return err(new Error("profile prerequisites contain a cycle"));
    ordered.push(next);
    complete.add(next.id);
    remaining.delete(next.id);
  }
  return ok({ target, kind, steps: ordered });
}

export function renderDryRun(plan: Plan): string {
  return [
    `target ${plan.target} (${plan.kind})`,
    ...plan.steps.map(
      (step) =>
        `${step.id} | ${step.host} | probe:${step.probe} | action:${step.action} | verify:${step.verifier}`,
    ),
  ].join("\n");
}
