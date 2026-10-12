import { join } from "node:path";
import type { RouteStatus } from "./routes.ts";

export type CodexAdmissionRouteDependencies = Readonly<{
  sandbox: string;
  codexPath: string | null;
  codexVersion: string;
  sandboxProbe: () => RouteStatus;
}>;

/** Explicitly unsandboxed dispatches need an installed, versioned Codex and login, not Linux sandbox support. */
export function codexAdmissionRoute(
  deps: CodexAdmissionRouteDependencies,
): RouteStatus {
  if (deps.sandbox !== "none") return deps.sandboxProbe();
  if (deps.codexPath === null)
    return { available: false, reason: "codex is not on PATH" };
  if (deps.codexVersion.trim() === "" || deps.codexVersion === "missing")
    return { available: false, reason: "codex did not report a version" };
  return {
    available: true,
    reason: "Codex executable/version check passed for explicit --sandbox none",
  };
}

/** Keep unsandboxed admission facts separate from the sandbox-capability cache. */
export function admissionRouteCachePath(
  stateDir: string,
  sandbox: string,
): string {
  return join(
    stateDir,
    sandbox === "none"
      ? "route-capability-unsandboxed.json"
      : "route-capability.json",
  );
}
