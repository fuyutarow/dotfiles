import {
  AGX_WORKER_ENV,
  AGX_WORKER_VALUE,
} from "../../../shared/src/worker-env.ts";

const WORKER_ENV_KEYS = [
  "PATH",
  "HOME",
  "LANG",
  "TZ",
  "AGX_DISPATCHER_SESSION",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
] as const;

/** Build the complete child environment; coordinator and vendor session state never crosses. */
export function workerEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of WORKER_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }
  environment[AGX_WORKER_ENV] = AGX_WORKER_VALUE;
  return environment;
}
