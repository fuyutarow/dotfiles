import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, win32 } from "node:path";
import { attempt, errorMessage, type Attempt } from "./attempt.ts";
import { JJ_READ_ARGS } from "./jj-read.ts";
import { readonlyCommand } from "./readonly-command.ts";
import { z } from "./zod.ts";

/** Only this error class changes the ticket CLI's existing failure exit code. */
export class AgxConfigError extends Error {}
const Config = z.strictObject({
  schema: z.literal(1),
  tickets: z.string().trim().min(1).optional(),
  ws: z.record(z.string(), z.unknown()).optional(),
});
const LocalConfig = Config.extend({
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

async function readCommand(
  argv: string[],
  cwd: string,
): Promise<Attempt<string>> {
  const result = await attempt(async () => {
    const invocation = readonlyCommand(argv, cwd);
    const child = Bun.spawn(invocation.cmd, {
      cwd,
      env: invocation.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    const [exit, out, err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exit, out, err };
  });
  if (!result.ok) return result;
  return result.value.exit === 0
    ? good(result.value.out.trimEnd())
    : failure(result.value.err.trim());
}

async function committedPolicy(
  root: string,
  vcs: Vcs,
  workspace: string,
): Promise<Attempt<string | undefined>> {
  if (vcs === "none") return good(undefined);
  if (vcs === "git") {
    const head = await readCommand(
      ["git", "--no-optional-locks", "rev-parse", "--verify", "HEAD^{commit}"],
      root,
    );
    if (!head.ok) return good(undefined); // An unborn Git tree has no committed policy.
  }
  const revision = vcs === "jj" ? "trunk()" : "HEAD";
  const names = (rev: string, cwd = root) =>
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
      cwd,
    );
  const inventory = await names(revision);
  if (!inventory.ok) return inventory;
  if (inventory.value.split("\n").includes(".agx.toml")) return retired(root);
  for (const cwd of vcs === "jj" ? new Set([root, workspace]) : []) {
    const recorded = await names("@", cwd);
    if (!recorded.ok) return recorded;
    if (recorded.value.split("\n").includes(".agx.toml")) return retired(root);
  }
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
  for (const directory of new Set([root, workspace])) {
    const info = await attempt(() => lstat(join(directory, ".agx.toml")));
    if (info.ok) return retired(root);
    if (!missing(info.error)) return info;
  }
  const policy = await committedPolicy(root, vcs, workspace);
  if (!policy.ok) return policy;
  let tickets = ".agents/tickets";
  if (policy.value !== undefined) {
    const name = "agx.toml";
    const text = policy.value;
    const decoded = await attempt((): unknown => Bun.TOML.parse(text));
    if (!decoded.ok)
      return failure(
        `${join(root, name)}: invalid TOML: ${errorMessage(decoded.error)}`,
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
  }
  const local = await localConfig(root);
  if (!local.ok) return local;
  tickets = local.value?.tickets ?? tickets;
  return good({
    root,
    tickets: resolve(
      root,
      tickets.startsWith("~/") ? join(homedir(), tickets.slice(2)) : tickets,
    ),
  });
}

/** L1 is immutable trunk policy; XDG L2 is selected by the real main-checkout root. */
export async function resolveAgxConfig(
  repoRoot: string,
  options: { vcs?: Vcs } = {},
): Promise<Attempt<{ root: string; tickets: string }>> {
  const result = await attempt(() => resolveConfig(repoRoot, options));
  const resolved = result.ok ? result.value : result;
  if (resolved.ok) return resolved;
  if (resolved.error instanceof AgxConfigError) return resolved;
  return failure(
    `${repoRoot}: cannot resolve agx configuration: ${errorMessage(resolved.error)}`,
  );
}
