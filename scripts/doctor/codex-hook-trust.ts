// Doctor check `codex-hook-trust`: does the installed Codex trust every hook in ~/.codex/hooks.json?
//
// Codex decides trust itself (persisted under [hooks.state] in ~/.codex/config.toml, keyed by the
// hooks file path and the group:handler index) and silently skips every untrusted or modified hook.
// This module never computes that hash: it asks `codex app-server` for `hooks/list`, which returns
// Codex's own `trustStatus` per hook, and reports what Codex says.
//
// READ-ONLY. The app-server runs against a throwaway CODEX_HOME inside the system temp directory:
// the hooks file and config.toml are COPIED there, and the trust-state keys are rewritten to the copy's
// path (Codex keys trust by path). Nothing under the real ~/.codex is opened for writing; the
// --dangerously-bypass-hook-trust flag is never passed.
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Ctx, Finding } from "../doctor.ts";
import {
  attempt,
  attemptOr,
  errorMessage,
} from "../../agents/hooks/attempt.ts";
import { obj } from "../../agents/hooks/narrow.ts";
import { jsonText, z } from "../../agents/hooks/zod.ts";

export type HookTrustEntry = {
  /** HOOK_SLUG= from the command, or the command text when a hook sets no slug. */
  slug: string;
  /** Codex event name, e.g. preToolUse. */
  event: string;
  /** group:handler, the position Codex keys trust state by (`…:pre_tool_use:<group>:<handler>`). */
  index: string;
  /** Codex's own trustStatus: managed | trusted | untrusted | modified (or a value this check does not know). */
  status: string;
  enabled: boolean;
};

export type HookStatusRead =
  | { ok: true; hooks: HookTrustEntry[] }
  | { ok: false; reason: string };

export type CodexHookTrustOptions = {
  /** argv that starts the app-server; default `codex app-server`. Tests substitute a fixture server. */
  codex?: string[];
  /** Upper bound for the whole exchange, including the wait for a silent server. */
  timeoutMs?: number;
  /** Extra environment for the app-server (tests only). HOME and CODEX_HOME are always set by this module. */
  env?: Record<string, string>;
};

export type HookTrustReader = (
  hooksPath: string,
  configPath: string,
) => Promise<HookStatusRead>;

const DEFAULT_TIMEOUT_MS = 20_000;
const KILL_GRACE_MS = 5_000;

const RpcSchema = z.object({
  id: z.number().optional(),
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).optional(),
});

const HookSchema = z.object({
  key: z.string(),
  eventName: z.string(),
  command: z.string().optional(),
  sourcePath: z.string(),
  enabled: z.boolean(),
  trustStatus: z.string(),
});

const ListResultSchema = z.object({
  data: z.array(
    z.object({
      hooks: z.array(HookSchema),
      errors: z.array(z.object({ message: z.string(), path: z.string() })),
    }),
  ),
});

const HooksFileSchema = z.object({
  hooks: z.record(
    z.string(),
    z.array(z.object({ hooks: z.array(z.unknown()) })),
  ),
});

/** Codex keys trust state by the hooks file's absolute path; point those keys at the copy. */
export function rewriteTrustKeys(
  configText: string,
  liveHooksPath: string,
  copyHooksPath: string,
): string {
  return configText.split(`${liveHooksPath}:`).join(`${copyHooksPath}:`);
}

function slugOf(command: string | undefined, key: string): string {
  const named = /HOOK_SLUG=(\S+)/u.exec(command ?? "")?.[1];
  return named ?? command ?? key;
}

function indexOf(key: string): string {
  const m = /:[a-z_]+:(\d+):(\d+)$/u.exec(key);
  return m === null ? key : `${m[1]}:${m[2]}`;
}

/** A reader of a line-delimited stream: each call resolves to the next whole line, or null at end. */
function lineSource(
  stream: ReadableStream<Uint8Array>,
): () => Promise<string | null> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  const nextLine = async (): Promise<string | null> => {
    let nl = buffered.indexOf("\n");
    while (nl < 0) {
      const chunk = await reader.read();
      if (chunk.done) return null;
      buffered += decoder.decode(chunk.value, { stream: true });
      nl = buffered.indexOf("\n");
    }
    const line = buffered.slice(0, nl);
    buffered = buffered.slice(nl + 1);
    return line.trim() === "" ? nextLine() : line;
  };
  return nextLine;
}

type Response = { ok: true; result: unknown } | { ok: false; reason: string };

/** The response to request `id`, skipping notifications and other ids. */
async function responseTo(
  nextLine: () => Promise<string | null>,
  id: number,
): Promise<Response> {
  for (;;) {
    const line = await nextLine();
    if (line === null)
      return { ok: false, reason: "app-server closed its output" };
    const decoded = jsonText.safeParse(line);
    if (!decoded.success) continue;
    const rpc = RpcSchema.safeParse(decoded.data);
    if (!rpc.success || rpc.data.id !== id) continue;
    const error = rpc.data.error;
    if (error !== undefined) return { ok: false, reason: error.message };
    return { ok: true, result: rpc.data.result };
  }
}

/** Turns a hooks/list result into entries for the hooks file Codex loaded; errors on that file are unavailability. */
export function hookStatusFromList(
  result: unknown,
  loadedHooksPath: string,
): HookStatusRead {
  const parsed = ListResultSchema.safeParse(result);
  if (!parsed.success)
    return { ok: false, reason: "hooks/list result has an unexpected shape" };
  const errors = parsed.data.data
    .flatMap((entry) => entry.errors)
    .filter((e) => e.path === loadedHooksPath);
  if (errors.length > 0)
    return {
      ok: false,
      reason: `Codex reported an error loading the hooks file: ${errors.map((e) => e.message).join("; ")}`,
    };
  const hooks = parsed.data.data
    .flatMap((entry) => entry.hooks)
    .filter((h) => h.sourcePath === loadedHooksPath)
    .map((h): HookTrustEntry => ({
      slug: slugOf(h.command, h.key),
      event: h.eventName,
      index: indexOf(h.key),
      status: h.trustStatus,
      enabled: h.enabled,
    }));
  return { ok: true, hooks };
}

type Proc = Bun.Subprocess<"pipe", "pipe", "ignore">;

async function send(proc: Proc, message: unknown): Promise<void> {
  await proc.stdin.write(`${JSON.stringify(message)}\n`);
  await proc.stdin.flush();
}

async function exchange(
  proc: Proc,
  work: string,
  loadedHooksPath: string,
): Promise<HookStatusRead> {
  const nextLine = lineSource(proc.stdout);
  await send(proc, {
    id: 1,
    method: "initialize",
    params: { clientInfo: { name: "dotfiles-doctor", version: "1" } },
  });
  const init = await responseTo(nextLine, 1);
  if (!init.ok)
    return { ok: false, reason: `initialize failed: ${init.reason}` };
  await send(proc, { method: "initialized" });
  await send(proc, { id: 2, method: "hooks/list", params: { cwds: [work] } });
  const listed = await responseTo(nextLine, 2);
  if (!listed.ok)
    return { ok: false, reason: `hooks/list failed: ${listed.reason}` };
  return hookStatusFromList(listed.result, loadedHooksPath);
}

/** `promise`, or `onTimeout` once `ms` has passed; the timer never outlives the race. */
function within<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(onTimeout);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

async function askCodex(
  proc: Proc,
  work: string,
  loadedHooksPath: string,
  timeoutMs: number,
): Promise<HookStatusRead> {
  const outcome = await attempt(() =>
    within<HookStatusRead>(exchange(proc, work, loadedHooksPath), timeoutMs, {
      ok: false,
      reason: `Codex did not answer hooks/list within ${timeoutMs} ms`,
    }),
  );
  return outcome.ok
    ? outcome.value
    : {
        ok: false,
        reason: `app-server exchange failed: ${errorMessage(outcome.error)}`,
      };
}

async function stop(proc: Proc): Promise<void> {
  proc.kill();
  const exited = await within(
    proc.exited.then(() => true),
    KILL_GRACE_MS,
    false,
  );
  if (!exited) proc.kill("SIGKILL");
}

/** Copies the hooks file and config into `root` (a fresh throwaway home) and asks the app-server. */
async function readInCopy(
  root: string,
  hooksPath: string,
  configPath: string,
  opts: CodexHookTrustOptions,
  program: string[],
): Promise<HookStatusRead> {
  const home = join(root, "home");
  const codexHome = join(home, ".codex");
  const work = join(root, "work");
  await mkdir(codexHome, { recursive: true });
  await mkdir(work, { recursive: true });

  const copy = join(codexHome, "hooks.json");
  const copied = await attempt(() => copyFile(hooksPath, copy));
  if (!copied.ok)
    return { ok: false, reason: `cannot read ${hooksPath} to copy it` };

  const config = await attempt(() => readFile(configPath, "utf8"));
  if (config.ok) {
    await writeFile(
      join(codexHome, "config.toml"),
      rewriteTrustKeys(config.value, hooksPath, copy),
      { mode: 0o600 },
    );
  } else if (obj(config.error)?.["code"] !== "ENOENT")
    return { ok: false, reason: `cannot read ${configPath}` };

  // Codex-owned state comes only from the copy: drop every CODEX_* override so no variable can
  // point the app-server back at the live home.
  const inherited = Object.entries(process.env).flatMap(
    ([name, value]): [string, string][] =>
      value === undefined || name.startsWith("CODEX_") ? [] : [[name, value]],
  );
  const proc: Proc = Bun.spawn(program, {
    cwd: work,
    env: {
      ...Object.fromEntries(inherited),
      ...opts.env,
      HOME: home,
      CODEX_HOME: codexHome,
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  });
  // askCodex never rejects, so the app-server is always stopped before this returns.
  const answer = await askCodex(
    proc,
    work,
    copy,
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  await stop(proc);
  return answer;
}

/**
 * Asks the installed Codex for the trust status of every hook in `hooksPath`. Never throws: anything
 * that prevents an answer (codex absent, app-server error, timeout) returns `{ ok: false, reason }`.
 */
export async function readCodexHookStatus(
  hooksPath: string,
  configPath: string,
  opts: CodexHookTrustOptions = {},
): Promise<HookStatusRead> {
  const program = opts.codex ?? ["codex", "app-server"];
  const binary = program[0] ?? "codex";
  if (Bun.which(binary) === null)
    return { ok: false, reason: `${binary} is not on PATH` };

  const root = await mkdtemp(join(tmpdir(), "doctor-codex-trust-"));
  const outcome = await attempt(() =>
    readInCopy(root, hooksPath, configPath, opts, program),
  );
  await rm(root, { recursive: true, force: true });
  return outcome.ok
    ? outcome.value
    : {
        ok: false,
        reason: `copy-and-read failed: ${errorMessage(outcome.error)}`,
      };
}

/** Handler count declared in the hooks file; null when the file is not the expected shape. */
function declaredHandlers(text: string): number | null {
  const parsed = jsonText.safeParse(text);
  if (!parsed.success) return null;
  const file = HooksFileSchema.safeParse(parsed.data);
  if (!file.success) return null;
  return Object.values(file.data.hooks)
    .flat()
    .reduce((sum, group) => sum + group.hooks.length, 0);
}

const NAME = "codex-hook-trust";
const RESTORE = "review them with /hooks in Codex, then re-run mise run doctor";

const describeHook = (h: HookTrustEntry): string =>
  `${h.slug} ${h.event} index=${h.index} status=${h.status}`;

/**
 * PASS only when Codex reports every declared hook as trusted (or managed). FAIL names each hook
 * Codex has untrusted or modified, so it is skipped. WARN whenever Codex's status cannot be read.
 */
export async function checkCodexHookTrust(
  ctx: Ctx,
  read: HookTrustReader = (hooksPath, configPath) =>
    readCodexHookStatus(hooksPath, configPath),
): Promise<Finding> {
  const hooksPath = join(ctx.home, ".codex", "hooks.json");
  const configPath = join(ctx.home, ".codex", "config.toml");
  const declaredText = await attemptOr(() => readFile(hooksPath, "utf8"), null);
  if (declaredText === null)
    return {
      name: NAME,
      verdict: "SKIP",
      detail: `no ${hooksPath}; the rendered check reports its absence`,
    };
  const declared = declaredHandlers(declaredText);

  const result = await read(hooksPath, configPath);
  if (!result.ok)
    return {
      name: NAME,
      verdict: "WARN",
      detail: `Codex hook trust status unavailable: ${result.reason}`,
    };
  const hooks = result.hooks;
  if (hooks.length === 0)
    return declared === 0
      ? { name: NAME, verdict: "PASS", detail: "no hooks declared" }
      : {
          name: NAME,
          verdict: "WARN",
          detail: `Codex listed no hooks for ${hooksPath}; trust cannot be decided`,
        };

  const blocked = hooks.filter(
    (h) => h.status === "untrusted" || h.status === "modified",
  );
  if (blocked.length > 0)
    return {
      name: NAME,
      verdict: "FAIL",
      detail: `${blocked.length} of ${hooks.length} hook(s) not trusted by Codex, so Codex skips them silently`,
      lines: blocked.map((h) => describeHook(h)),
      fix: RESTORE,
    };
  const unknown = hooks.filter(
    (h) => h.status !== "trusted" && h.status !== "managed",
  );
  if (unknown.length > 0)
    return {
      name: NAME,
      verdict: "WARN",
      detail: `${unknown.length} hook(s) carry a trust status this check does not recognise`,
      lines: unknown.map((h) => describeHook(h)),
    };
  const disabled = hooks.filter((h) => !h.enabled);
  if (disabled.length > 0)
    return {
      name: NAME,
      verdict: "WARN",
      detail: `${disabled.length} trusted hook(s) are disabled in Codex, so they do not run`,
      lines: disabled.map((h) => describeHook(h)),
    };
  return {
    name: NAME,
    verdict: "PASS",
    detail: `${hooks.length} hook(s) in ${hooksPath} trusted by Codex`,
  };
}
