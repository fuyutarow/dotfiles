import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  AGX_WORKER_ENV,
  AGX_WORKER_VALUE,
} from "../../../shared/src/worker-env.ts";

const WORKER_ENV_KEYS = [
  // Process location and locale keep command lookup and text behavior consistent.
  "PATH",
  "HOME",
  "LANG",
  "TZ",
  // User and terminal identity let interactive tools identify their expected host context.
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  // The run-owned temp directory agx removes when the run ends.
  "TMPDIR",
  "TMP",
  "TEMP",
  // Shared package cache selected by the dispatcher, also used as a Codex writable root.
  "BUN_INSTALL_CACHE_DIR",
  // mise's active shell and explicit roots keep declared tool config and data discoverable.
  "MISE_ACTIVATE_SHIMS",
  "MISE_SHELL",
  "MISE_CONFIG_DIR",
  "MISE_DATA_DIR",
  "MISE_CACHE_DIR",
  "MISE_INSTALLS_DIR",
  // XDG locations resolve user config, state, data, and cache for agx and systemd services.
  "XDG_RUNTIME_DIR",
  "DBUS_SESSION_BUS_ADDRESS",
  "XDG_CONFIG_HOME",
  "XDG_STATE_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  // Custom CA paths keep HTTPS clients on the user's configured trust store.
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  // rip and repo tools need the user's recovery graveyard locations.
  "GRAVEYARD",
  "RIP_GRAVEYARD",
  // The dispatcher session is explicitly attributed to workers; coordinator IDs stay excluded.
  "AGX_DISPATCHER_SESSION",
  // Provider credentials let workers use the coordinator's authenticated model services.
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
] as const;

/** The one shared-cache declaration: environment values and writable roots use these same paths. */
export function workerSharedCaches(
  source: NodeJS.ProcessEnv = process.env,
): { key?: string; root: string }[] {
  return [
    {
      key: "BUN_INSTALL_CACHE_DIR",
      root: resolve(
        source.BUN_INSTALL_CACHE_DIR ??
          join(source.HOME ?? homedir(), ".bun", "install", "cache"),
      ),
    },
    {
      root: resolve(
        source.XDG_CACHE_HOME ?? join(source.HOME ?? homedir(), ".cache"),
        "cocoindex-code",
      ),
    },
  ];
}

/** Build the complete child environment; coordinator and vendor session state never crosses. */
export function workerEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of WORKER_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith("AGX_") && value !== undefined) environment[key] = value;
  }
  environment[AGX_WORKER_ENV] = AGX_WORKER_VALUE;
  return environment;
}
