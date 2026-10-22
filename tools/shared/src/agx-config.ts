import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, win32 } from "node:path";
import { attempt, errorMessage, type Attempt } from "./attempt.ts";
import { JJ_READ_ARGS } from "./jj-read.ts";
import { readonlyCommand } from "./readonly-command.ts";
import { z } from "./zod.ts";

/** Only this error class changes the ticket CLI's existing failure exit code. */
export class AgxConfigError extends Error {}
/** Inspection did not produce a policy verdict; callers must preserve exit 75. */
export class InspectionUnavailable extends AgxConfigError {}
export class InspectionTimeout extends InspectionUnavailable {
  constructor(
    bound: string,
    milliseconds: number,
    argv: string[],
    cwd: string,
  ) {
    super(
      `inspection timeout ${bound}=${milliseconds}ms; command=${JSON.stringify(argv)}; cwd=${cwd}`,
    );
  }
}
export const CONFIG_READ_TIMEOUT_MS = 60_000;
const NonEmptyStrings = z.array(
  z.string().refine((value) => value.trim().length > 0, "must not be empty"),
);
const VerifyConfig = z.strictObject({
  always: NonEmptyStrings.optional(),
});
const WorkspaceConfig = z.strictObject({
  ready: NonEmptyStrings.optional(),
});
const LocalWorkspaceConfig = z.strictObject({
  ready: NonEmptyStrings.optional(),
  keep: NonEmptyStrings.optional(),
});
const Config = z.strictObject({
  schema: z.literal(1),
  tickets: z.string().trim().min(1).optional(),
  ws: WorkspaceConfig.optional(),
  verify: VerifyConfig.optional(),
});
const LocalConfig = z.strictObject({
  schema: z.literal(1),
  tickets: z.string().trim().min(1).optional(),
  ws: LocalWorkspaceConfig.optional(),
  verify: VerifyConfig.optional(),
  root: z
    .string()
    .refine(isAbsolute, "root must be an absolute main-checkout path"),
});
const missing = (error: unknown) =>
  z.object({ code: z.literal("ENOENT") }).safeParse(error).success;
const failure = (message: string) => ({
  ok: false as const,
  error: new AgxConfigError(message.replaceAll(/[\r\n]+/gu, " ")),
});
const good = <T>(value: T) => ({ ok: true as const, value });
type Vcs = "jj" | "git" | "none";

export async function readCommand(
  argv: string[],
  cwd: string,
  timeoutMs = CONFIG_READ_TIMEOUT_MS,
): Promise<Attempt<string>> {
  const result = await attempt(async () => {
    const invocation = readonlyCommand(argv, cwd);
    const started = performance.now();
    const child = Bun.spawn(invocation.cmd, {
      cwd,
      env: invocation.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      // Allow the same lock-contention window as repository landing reads.
      timeout: timeoutMs,
      killSignal: "SIGKILL",
    });
    const [exit, out, err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return {
      exit,
      out,
      err,
      timedOut:
        child.signalCode === "SIGKILL" &&
        performance.now() - started >= timeoutMs,
    };
  });
  if (!result.ok) return result;
  if (result.value.timedOut)
    return {
      ok: false,
      error: new InspectionTimeout(
        "CONFIG_READ_TIMEOUT_MS",
        timeoutMs,
        argv,
        cwd,
      ),
    };
  if (result.value.exit === 75)
    return {
      ok: false,
      error: new InspectionUnavailable(
        result.value.err.trim() === ""
          ? `inspection unavailable; command=${JSON.stringify(argv)}; cwd=${cwd}; exit=75; no stderr`
          : result.value.err.trim().replaceAll(/[\r\n]+/gu, "; "),
      ),
    };
  if (result.value.exit === 0) return good(result.value.out.trimEnd());
  const reason =
    result.value.err.trim() === "" ? "no stderr" : result.value.err.trim();
  return failure(
    `config read ${JSON.stringify(argv)} in ${cwd} exited ${result.value.exit}: ${reason}`,
  );
}

async function committedPolicy(
  root: string,
  vcs: Vcs,
): Promise<Attempt<string | undefined>> {
  if (vcs === "none") return good(undefined);
  if (vcs === "git") {
    const head = await readCommand(
      ["git", "--no-optional-locks", "rev-parse", "--verify", "HEAD^{commit}"],
      root,
    );
    if (!head.ok && head.error instanceof InspectionUnavailable) return head;
    if (!head.ok) return good(undefined); // An unborn Git tree has no committed policy.
  }
  const revision = vcs === "jj" ? "trunk()" : "HEAD";
  const names = (rev: string) =>
    readCommand(
      vcs === "jj"
        ? [
            "jj",
            ...JJ_READ_ARGS,
            "file",
            "list",
            "-r",
            rev,
            ".agx.toml",
            "agx.toml",
          ]
        : [
            "git",
            "--no-optional-locks",
            "ls-tree",
            "--name-only",
            rev,
            "--",
            ".agx.toml",
            "agx.toml",
          ],
      root,
    );
  const inventory = await names(revision);
  if (!inventory.ok) return inventory;
  if (inventory.value.split("\n").includes(".agx.toml")) return retired(root);
  if (!inventory.value.split("\n").includes("agx.toml")) return good(undefined);
  return readCommand(
    vcs === "jj"
      ? ["jj", ...JJ_READ_ARGS, "file", "show", "-r", revision, "agx.toml"]
      : ["git", "--no-optional-locks", "show", "HEAD:agx.toml"],
    root,
  );
}
const retired = (root: string) =>
  failure(
    `${join(root, ".agx.toml")} is retired; rename it: mv .agx.toml agx.toml (machine-local absolute paths go in $XDG_CONFIG_HOME/agx/repos/<name>.toml (default ~/.config/agx/repos/<name>.toml) with root = ${JSON.stringify(root)})`,
  );

async function localConfig(
  root: string,
): Promise<Attempt<z.output<typeof LocalConfig> | undefined>> {
  const directory = join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "agx/repos",
  );
  const entries = await attempt(() =>
    readdir(directory, { withFileTypes: true }),
  );
  if (!entries.ok) return missing(entries.error) ? good(undefined) : entries;
  let selected: z.output<typeof LocalConfig> | undefined;
  for (const entry of entries.value.toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (
      !entry.name.endsWith(".toml") ||
      (!entry.isFile() && !entry.isSymbolicLink())
    )
      continue;
    const path = join(directory, entry.name);
    const raw = await attempt(async (): Promise<unknown> =>
      Bun.TOML.parse(await readFile(path, "utf8")),
    );
    if (!raw.ok)
      return failure(`${path}: invalid TOML: ${errorMessage(raw.error)}`);
    const parsed = LocalConfig.safeParse(raw.value);
    if (!parsed.success) return failure(`${path}: ${parsed.error.message}`);
    if (parsed.data.root !== root) continue;
    if (selected !== undefined)
      return failure(
        `${directory}: two files claim root ${root}; keep one repository override`,
      );
    selected = parsed.data;
  }
  return good(selected);
}

async function resolveConfig(repoRoot: string, options: { vcs?: Vcs }) {
  const workspace = await realpath(repoRoot);
  const vcs =
    options.vcs ??
    ((await lstat(join(workspace, ".jj")).catch(() => null)) !== null
      ? "jj"
      : "git");
  let root = workspace;
  if (vcs === "jj") {
    const main = await readCommand(
      ["jj", ...JJ_READ_ARGS, "workspace", "root", "--name", "default"],
      workspace,
    );
    if (!main.ok) return main;
    root = await realpath(main.value);
  }
  const policy = await committedPolicy(root, vcs);
  if (!policy.ok) return policy;
  let tickets = ".agents/tickets";
  let ready: string[] = [];
  let keep: string[] = [];
  let verifyAlways: string[] = [];
  if (policy.value !== undefined) {
    const name = "agx.toml";
    const text = policy.value;
    const decoded = await attempt((): unknown => Bun.TOML.parse(text));
    if (!decoded.ok)
      return failure(
        `${join(root, name)}: invalid TOML: ${errorMessage(decoded.error)}`,
      );
    const workspaceTable = z
      .looseObject({ ws: z.looseObject({}) })
      .safeParse(decoded.value);
    if (workspaceTable.success && Object.hasOwn(workspaceTable.data.ws, "keep"))
      return failure(
        `${join(root, name)}: [ws].keep belongs in $XDG_CONFIG_HOME/agx/repos/<name>.toml`,
      );
    const parsed = Config.safeParse(decoded.value);
    if (!parsed.success)
      return failure(`${join(root, name)}: ${parsed.error.message}`);
    const declared = parsed.data.tickets;
    if (
      declared !== undefined &&
      (isAbsolute(declared) ||
        win32.isAbsolute(declared) ||
        declared.startsWith("~/"))
    )
      return failure(
        `${join(root, name)}: tickets must be relative; move absolute paths into $XDG_CONFIG_HOME/agx/repos/<name>.toml (default ~/.config/agx/repos/<name>.toml) with root = ${JSON.stringify(root)}`,
      );
    tickets = declared ?? tickets;
    ready = parsed.data.ws?.ready ?? ready;
    verifyAlways = parsed.data.verify?.always ?? verifyAlways;
  }
  const local = await localConfig(root);
  if (!local.ok) return local;
  tickets = local.value?.tickets ?? tickets;
  ready = local.value?.ws?.ready ?? ready;
  keep = local.value?.ws?.keep ?? keep;
  verifyAlways = local.value?.verify?.always ?? verifyAlways;
  return good({
    root,
    tickets: resolve(
      root,
      tickets.startsWith("~/") ? join(homedir(), tickets.slice(2)) : tickets,
    ),
    ready,
    keep,
    verifyAlways,
  });
}

/** L1 is immutable trunk policy; XDG L2 is selected by the real main-checkout root. */
export async function resolveAgxConfig(
  repoRoot: string,
  options: { vcs?: Vcs } = {},
): Promise<
  Attempt<{
    root: string;
    tickets: string;
    ready: string[];
    keep: string[];
    verifyAlways: string[];
  }>
> {
  const result = await attempt(() => resolveConfig(repoRoot, options));
  const resolved = result.ok ? result.value : result;
  if (resolved.ok) return resolved;
  if (resolved.error instanceof AgxConfigError) return resolved;
  return failure(
    `${repoRoot}: cannot resolve agx configuration: ${errorMessage(resolved.error)}`,
  );
}
