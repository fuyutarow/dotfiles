import type { LivenessFacts, LivenessRef } from "./facts.ts";

export type LivenessVerdict = "dead" | "live" | "unknown";
export type LivenessJudgment = { verdict: LivenessVerdict; evidence: string[] };

function registryEvidence(
  ref: LivenessRef,
  facts: LivenessFacts,
): { live: boolean; uncertain: boolean; evidence: string[] } {
  if (!facts.sessions.ok)
    return {
      live: false,
      uncertain: true,
      evidence: [`session registry unavailable: ${facts.sessions.error}`],
    };
  const evidence: string[] = [];
  let uncertain = false;
  const entries = facts.sessions.value.filter(
    (entry) => entry.sessionId === ref.uuid,
  );
  for (const entry of entries) {
    const start = facts.procStarttime(entry.pid);
    if (start.ok && start.value === entry.procStart)
      return {
        live: true,
        uncertain,
        evidence: [
          ...evidence,
          `registry pid ${entry.pid} has matching process starttime`,
        ],
      };
    if (!start.ok) {
      uncertain = true;
      evidence.push(
        `cannot verify registry pid ${entry.pid} starttime: ${start.error}`,
      );
      continue;
    }
    evidence.push(`registry pid ${entry.pid} was reused (starttime differs)`);
  }
  if (entries.length === 0)
    evidence.push("no matching Claude session registry entry");
  return { live: false, uncertain, evidence };
}

export function judge(
  ref: LivenessRef,
  facts: LivenessFacts,
): LivenessJudgment {
  const evidence: string[] = [];
  let uncertain = false;
  const live = (detail: string): LivenessJudgment => ({
    verdict: "live",
    evidence: [...evidence, detail],
  });

  const registry = registryEvidence(ref, facts);
  if (registry.live) return { verdict: "live", evidence: registry.evidence };
  uncertain ||= registry.uncertain;
  evidence.push(...registry.evidence);

  if (facts.environSessionIds.ok) {
    if (facts.environSessionIds.value.includes(ref.uuid))
      return live("same-uid process carries CLAUDE_CODE_SESSION_ID");
    evidence.push(
      "no same-uid process carries the session id in its environment; all agents and workers run as the owner's uid; foreign-uid daemons do not use user scratch or workspaces (owner decision 2026-10-08)",
    );
  } else {
    uncertain = true;
    evidence.push(
      `same-uid environ scan unavailable: ${facts.environSessionIds.error}`,
    );
  }

  if (facts.openPaths.ok) {
    if (facts.openPaths.value.length > 0)
      return live(
        `same-uid process has an open path under scratch: ${facts.openPaths.value[0]}`,
      );
    evidence.push(
      "no same-uid process cwd or fd is under scratch; all agents and workers run as the owner's uid; foreign-uid daemons do not use user scratch or workspaces (owner decision 2026-10-08)",
    );
  } else {
    uncertain = true;
    evidence.push(`open-path scan unavailable: ${facts.openPaths.error}`);
  }

  if (!facts.transcript.ok) {
    uncertain = true;
    evidence.push(`transcript stat unavailable: ${facts.transcript.error}`);
  } else if (!facts.transcript.value.exists) {
    uncertain = true;
    evidence.push("transcript is missing");
  } else {
    const age = facts.now - facts.transcript.value.mtimeMs;
    const graceMs = facts.graceHours * 60 * 60 * 1000;
    if (age <= graceMs)
      return {
        verdict: "live",
        evidence: [
          ...evidence,
          `transcript is within ${facts.graceHours}h session grace`,
        ],
      };
    evidence.push(
      `transcript is older than ${facts.graceHours}h session grace`,
    );
  }

  return uncertain
    ? { verdict: "unknown", evidence }
    : {
        verdict: "dead",
        evidence: [
          ...evidence,
          "no live process, open path, or live session registry entry; transcript is old",
        ],
      };
}
