import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { attempt, errorMessage } from "../../shared/src/attempt.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";

const Payload = z.looseObject({
  session_id: z.string().optional(),
  cwd: z.string().min(1).optional(),
  hook_event_name: z.enum(["UserPromptSubmit", "Stop"]).optional(),
  prompt: z.string().optional(),
  stop_hook_active: z.boolean().optional(),
  last_assistant_message: z.string().optional(),
});
export type HookPayload = z.output<typeof Payload>;
export type HookContext = {
  repoRoot: string;
  cwd: string;
  payload: HookPayload;
};
export type HookResult = string | false | null | undefined;
type Callback = (
  ctx: HookContext,
) => HookResult | HookResult[] | Promise<HookResult | HookResult[]>;
const BUDGET_MS = 3_000;

function repoRoot(cwd: string): string {
  let dir = resolve(cwd);
  while (!existsSync(join(dir, ".git")) && !existsSync(join(dir, ".jj"))) {
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
  return dir;
}

function message(slug: string, text: string): string {
  return `[${slug}] ${text}`;
}

function failure(slug: string, reason: string): void {
  process.stderr.write(`${message(slug, reason.replaceAll(/\s+/gu, " "))}\n`);
}

function defaultSlug(event: "UserPromptSubmit" | "Stop", cwd: string): string {
  const name = basename(repoRoot(cwd))
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  let project = name === "" ? "project" : name;
  if (/^[0-9]/u.test(project)) project = `project-${project}`;
  return `${project}-${event === "Stop" ? "stop" : "prompt"}`;
}

async function run(
  event: "UserPromptSubmit" | "Stop",
  fn: Callback,
  slug?: string,
): Promise<void> {
  if (slug !== undefined && !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(slug)) {
    failure("agx-usehooks", "hook slug must be kebab-case; fail open");
    process.exit(0);
  }
  let effectiveSlug = slug ?? defaultSlug(event, process.cwd());
  const started = performance.now();
  const timer = setTimeout(() => {
    failure(effectiveSlug, "3 s budget exceeded; fail open");
    process.exit(0);
  }, BUDGET_MS);
  const result = await attempt(async () => {
    const parsed = jsonOf(Payload).safeParse(await Bun.stdin.text());
    if (!parsed.success) return new Error("invalid hook payload; fail open");
    const cwd = resolve(parsed.data.cwd ?? process.cwd());
    effectiveSlug = slug ?? defaultSlug(event, cwd);
    if (
      parsed.data.hook_event_name !== undefined &&
      parsed.data.hook_event_name !== event
    )
      return new Error("wrong hook event; fail open");
    const value = await fn({
      cwd,
      repoRoot: repoRoot(cwd),
      payload: parsed.data,
    });
    const strings = (Array.isArray(value) ? value : [value]).filter(
      (entry) => typeof entry === "string" && entry !== "",
    );
    const text = strings.join("\n");
    if (performance.now() - started >= BUDGET_MS)
      return new Error("3 s budget exceeded; fail open");
    if (
      text === "" ||
      (event === "Stop" && parsed.data.stop_hook_active === true)
    )
      return null;
    return event === "Stop"
      ? { decision: "block", reason: message(effectiveSlug, text) }
      : {
          hookSpecificOutput: {
            hookEventName: event,
            additionalContext: message(effectiveSlug, text),
          },
        };
  });
  clearTimeout(timer);
  if (!result.ok) failure(effectiveSlug, errorMessage(result.error));
  else if (result.value instanceof Error)
    failure(effectiveSlug, result.value.message);
  else if (result.value !== null)
    process.stdout.write(`${JSON.stringify(result.value)}\n`);
  process.exit(0);
}

/** Read stdin, call project code, and emit one additionalContext block; exits 0. */
export function onPrompt(fn: Callback, slug?: string): Promise<void> {
  return run("UserPromptSubmit", fn, slug);
}
/** Read stdin and block once with project reasons; exits 0, including on failure. */
export function onStop(fn: Callback, slug?: string): Promise<void> {
  return run("Stop", fn, slug);
}
