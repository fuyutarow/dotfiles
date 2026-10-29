import type { Candidate } from "./model.ts";

export async function revalidateClean(
  candidates: Candidate[],
  request: { id: string; path: string; fingerprint: string },
  identity: (path: string) => Promise<string>,
  protection: (path: string) => string | null,
) {
  const candidate = candidates.find(
    (c) => c.id === request.id && c.path === request.path,
  );
  if (candidate === undefined || candidate.verdict !== "RECLAIM") {
    let verdict = "changed";
    if (candidate?.verdict === "KEEP") verdict = "keep";
    if (candidate?.verdict === "ASK") verdict = "ask";
    return {
      candidate: null,
      verdict,
      reason: candidate?.reason ?? "candidate disappeared",
    };
  }
  if ((await identity(request.path)) !== request.fingerprint)
    return {
      candidate: null,
      verdict: "changed",
      reason: "fingerprint changed",
    };
  const reason = protection(request.path);
  if (reason !== null)
    return {
      candidate: null,
      verdict: reason === "process paths are unknown" ? "unknown" : "keep",
      reason: `protected: ${reason}`,
    };
  return { candidate, verdict: "safe", reason: "revalidated" };
}
