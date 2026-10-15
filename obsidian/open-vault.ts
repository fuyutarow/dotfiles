import { cli } from "cleye";
import {
  existsSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, sep } from "node:path";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";

// Consumer: human, verdict lines. Register an unregistered directory, then open it on macOS.
// Evidence: obsidian-1.14.4.asar main.js (2026-10-15), C=ee("obsidian"),
// ipcMain.on("cli") writes C.cli via ae("obsidian",C). CLI At() requires R[id];
// TUI vault:open resolves an existing ID or reports "Vault not found". It cannot register.
// Never enable the CLI or touch Chromium storage just to open a folder.
// Exit: 0 opened / 2 FATAL. No signals are ever sent to Obsidian.
const REGISTRY = join(
  process.env.HOME ?? "",
  "Library/Application Support/obsidian/obsidian.json",
);
const Registry = z.record(z.string(), z.unknown());
const Vaults = z.record(z.string(), z.unknown());
const Vault = z.object({ path: z.string() });
const WAIT_MS = 20_000;

async function readRegistry(): Promise<
  Result<
    { data: Record<string, unknown>; vaults: Record<string, unknown> },
    string
  >
> {
  const text = existsSync(REGISTRY) ? await Bun.file(REGISTRY).text() : "{}";
  const parsed = jsonOf(Registry).safeParse(text);
  if (!parsed.success)
    return err(`${REGISTRY}: invalid JSON object; refusing to replace it`);
  const vaults = Vaults.safeParse(parsed.data.vaults ?? {});
  if (!vaults.success)
    return err(`${REGISTRY}: invalid vaults; refusing to replace it`);
  return ok({ data: parsed.data, vaults: vaults.data });
}

function containing(
  vaults: Record<string, unknown>,
  target: string,
): { id: string; root: string } | undefined {
  let best: { id: string; root: string } | undefined;
  for (const [id, value] of Object.entries(vaults)) {
    const vault = Vault.safeParse(value);
    if (!vault.success || !existsSync(vault.data.path)) continue;
    if (!statSync(vault.data.path).isDirectory()) continue;
    const root = realpathSync(vault.data.path);
    const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
    if (target !== root && !target.startsWith(prefix)) continue;
    if (best === undefined || root.length > best.root.length)
      best = { id, root };
  }
  return best;
}

async function command(
  args: string[],
  waitMs = WAIT_MS,
): Promise<{ exit: number; stderr: string }> {
  const executable = args[0];
  if (executable === undefined || Bun.which(executable) === null)
    return {
      exit: 127,
      stderr: `required command not found: ${executable ?? "<empty>"}`,
    };
  const signal = AbortSignal.timeout(waitMs);
  const child = Bun.spawn(args, {
    stdout: "ignore",
    stderr: "pipe",
    signal,
  });
  const [exit, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  if (signal.aborted)
    return { exit: 2, stderr: `${executable} timed out after ${waitMs} ms` };
  return { exit, stderr: stderr.slice(0, 2_000) };
}

async function running(): Promise<Result<boolean, string>> {
  const result = await command(["pgrep", "-x", "Obsidian"]);
  if (result.exit > 1) return err(`pgrep failed: ${result.stderr}`);
  return ok(result.exit === 0);
}

async function quit(): Promise<Result<void, string>> {
  const result = await command(["osascript", "-e", 'quit app "Obsidian"']);
  if (result.exit !== 0)
    return err(`Obsidian refused graceful quit: ${result.stderr}`);
  const deadline = performance.now() + WAIT_MS;
  while (performance.now() < deadline) {
    const active = await running();
    if (active.isErr()) return err(active.error);
    if (!active.value) return ok(undefined);
    await Bun.sleep(250);
  }
  return err(
    "Obsidian did not quit within 20 seconds; registry unchanged (no forced termination)",
  );
}

async function atomicWrite(data: Record<string, unknown>): Promise<void> {
  const temp = `${REGISTRY}.${crypto.randomUUID()}.tmp`;
  const mode = existsSync(REGISTRY) ? statSync(REGISTRY).mode & 0o777 : 0o600;
  await Bun.write(temp, `${JSON.stringify(data, null, 2)}\n`, { mode })
    .then(() => {
      renameSync(temp, REGISTRY);
    })
    .finally(() => {
      if (existsSync(temp)) unlinkSync(temp);
    });
}

async function openUri(
  id: string,
  root: string,
  target: string,
): Promise<Result<void, string>> {
  const query =
    target === root
      ? `vault=${encodeURIComponent(id)}`
      : `path=${encodeURIComponent(target)}`;
  const uri = `obsidian://open?${query}`;
  const result = await command(["open", uri]);
  if (result.exit !== 0) return err(`could not open ${uri}: ${result.stderr}`);
  process.stdout.write(`OPEN  ${uri}\n`);
  return ok(undefined);
}

async function acquireLock(lock: string): Promise<Result<void, string>> {
  const deadline = performance.now() + 120_000;
  while (performance.now() < deadline) {
    const locked = fromThrowable(
      () => {
        mkdirSync(lock);
      },
      () => `cannot create registration lock ${lock}`,
    )();
    if (locked.isOk()) return ok(undefined);
    if (!existsSync(lock)) return err(locked.error);
    await Bun.sleep(250);
  }
  return err(`timed out waiting for another obs registration: ${lock}`);
}

async function register(target: string): Promise<Result<void, string>> {
  const active = await running();
  if (active.isErr()) return err(active.error);
  if (active.value) {
    const stopped = await quit();
    if (stopped.isErr()) return stopped;
  }
  // Read AFTER graceful quit: Obsidian flushes its latest entries while exiting.
  // Restore the app even if validation, disk writes, or plugin application fail.
  let launched = false;
  const outcome = await Promise.try(async (): Promise<Result<void, string>> => {
    const latest = await readRegistry();
    if (latest.isErr()) return err(latest.error);
    let match = containing(latest.value.vaults, target);
    if (match === undefined) {
      let id = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      while (Object.hasOwn(latest.value.vaults, id))
        id = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      // Append only: retain every existing entry, field, and their insertion order.
      Object.defineProperty(latest.value.vaults, id, {
        value: { path: target, ts: Temporal.Now.instant().epochMilliseconds },
        enumerable: true,
      });
      latest.value.data.vaults = latest.value.vaults;
      await atomicWrite(latest.value.data);
      process.stdout.write(`SET   registered ${target} as ${id}\n`);
      const applied = await command(
        [
          process.execPath,
          join(import.meta.dir, "apply.ts"),
          "--vault",
          target,
        ],
        120_000,
      );
      if (applied.exit !== 0)
        process.stderr.write(
          `WARN: house settings incomplete: ${applied.stderr}\nRun: bun ${JSON.stringify(join(import.meta.dir, "apply.ts"))} --vault ${JSON.stringify(target)}\n`,
        );
      match = { id, root: target };
    }
    const launch = await command(["open", "-a", "Obsidian"]);
    if (launch.exit !== 0)
      return err(`could not relaunch Obsidian: ${launch.stderr}`);
    launched = true;
    return openUri(match.id, match.root, target);
  }).then(
    (value) => value,
    (error: unknown) =>
      err(error instanceof Error ? error.message : String(error)),
  );
  if (active.value && !launched) await command(["open", "-a", "Obsidian"]);
  return outcome;
}

async function main(): Promise<Result<void, string>> {
  let prototypeFlag = false;
  const rejectPrototypeFlag = (
    type: "known-flag" | "unknown-flag" | "argument",
    flag: string,
  ): void => {
    if (type === "unknown-flag" && flag === "__proto__") prototypeFlag = true;
  };
  const parsed = cli({
    name: "open-vault.ts",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: ["[dir]"],
    help: {
      description:
        "Register a directory as an Obsidian vault and open it; OBS_DRY_RUN=1 writes nothing.",
    },
  });
  if (prototypeFlag) return err("Unknown option '--__proto__'");
  if (parsed._.length > 1) return err("usage: open-vault.ts [dir]");
  if (
    (process.env.SSH_CONNECTION ?? "") !== "" ||
    (process.env.SSH_TTY ?? "") !== ""
  )
    return err("run obs in a local macOS shell");
  const target = realpathSync(parsed._.dir ?? process.cwd());
  if (!statSync(target).isDirectory()) return err(`${target}: not a directory`);
  const registry = await readRegistry();
  if (registry.isErr()) return err(registry.error);
  const match = containing(registry.value.vaults, target);
  if (process.env.OBS_DRY_RUN === "1") {
    if (match === undefined)
      process.stdout.write(
        `DRY   register ${target}; apply house settings; relaunch Obsidian; open obsidian://open?vault=<new-id>\n`,
      );
    else
      process.stdout.write(
        `obsidian://open?${target === match.root ? `vault=${encodeURIComponent(match.id)}` : `path=${encodeURIComponent(target)}`}\n`,
      );
    return ok(undefined);
  }
  if (match !== undefined) return openUri(match.id, match.root, target);
  mkdirSync(dirname(REGISTRY), { recursive: true });
  // Serialize cooperating obs invocations through relaunch, so the next writer sees the vault.
  const lock = `${REGISTRY}.obs-lock`;
  const locked = await acquireLock(lock);
  if (locked.isErr()) return err(locked.error);
  return register(target).finally(() => {
    rmdirSync(lock);
  });
}

if (import.meta.main) {
  const outcome = await Promise.try(main).then(
    (result) => result,
    (error: unknown) =>
      err(error instanceof Error ? error.message : String(error)),
  );
  outcome.match(
    () => {
      process.exitCode = 0;
    },
    (message) => {
      process.stderr.write(`FATAL: ${message}\n`);
      process.exitCode = 2;
    },
  );
}
