// Consumer: obs wrapper / vouched receiver. Remove one exact shadow, recoverably.
import { cli } from "cleye";
import { access, realpath, rmdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import {
  acquireLock,
  atomicWrite,
  command,
  quit,
  readRegistry,
  running,
} from "./open-vault.ts";

export async function forgetShadow(
  selector:
    | { kind: "profile"; value: string }
    | { kind: "path"; value: string },
): Promise<Result<void, string>> {
  const home = process.env["HOME"] ?? "";
  const registry = join(
    home,
    "Library/Application Support/obsidian/obsidian.json",
  );
  if (
    !(await access(registry).then(
      () => true,
      () => false,
    ))
  )
    return err("unknown shadow vault: no registry");
  const base = await realpath(join(home, ".obsidian-remote/vaults")).catch(
    () => null,
  );
  if (base === null) return err("unknown shadow vault: no shadow directory");
  const lock = `${registry}.obs-lock`;
  const locked = await acquireLock(lock);
  if (locked.isErr()) return locked;
  await using _unlock = {
    async [Symbol.asyncDispose]() {
      await rmdir(lock);
    },
  };
  const locate = async () => {
    const state = await readRegistry();
    if (state.isErr()) return err(state.error);
    const matches: { id: string; path: string }[] = [];
    for (const [id, value] of Object.entries(state.value.vaults)) {
      const entry = z.object({ path: z.string() }).safeParse(value);
      if (!entry.success) continue;
      const path = await realpath(entry.data.path).catch(() => null);
      if (path === null || !path.startsWith(base + sep)) continue;
      const dataFile = join(path, ".obsidian/plugins/remote-ssh/data.json");
      const data = jsonOf(
        z.object({ autoConnectProfileId: z.string().min(1) }),
      ).safeParse(
        await Bun.file(dataFile)
          .text()
          .catch(() => ""),
      );
      if (!data.success) continue;
      if (
        (selector.kind === "profile" &&
          data.data.autoConnectProfileId === selector.value) ||
        (selector.kind === "path" && path === selector.value)
      )
        matches.push({ id, path });
    }
    if (matches.length !== 1)
      return err(
        `unknown or ambiguous shadow vault (${matches.length} exact matches)`,
      );
    const match = matches[0];
    if (match === undefined) return err("unknown shadow vault");
    // A second registry entry for the same directory makes directory removal non-exclusive.
    for (const [id, value] of Object.entries(state.value.vaults)) {
      const entry = z.object({ path: z.string() }).safeParse(value);
      const other = entry.success
        ? await realpath(entry.data.path).catch(() => null)
        : null;
      if (
        id !== match.id &&
        other !== null &&
        (other === match.path || other.startsWith(match.path + sep))
      )
        return err(
          "shadow directory contains another registry entry; refusing removal",
        );
    }
    return ok({ ...state.value, match });
  };
  const initial = await locate();
  if (initial.isErr()) return initial;
  if (Bun.which("rip") === null)
    return err("rip is required for recoverable shadow removal");
  const graveyard = resolve(
    process.env["GRAVEYARD"] ??
      process.env["RIP_GRAVEYARD"] ??
      join(
        process.env["XDG_DATA_HOME"] ?? join(home, ".local/share"),
        "graveyard",
      ),
  );
  if (
    graveyard === initial.value.match.path ||
    graveyard.startsWith(initial.value.match.path + sep)
  )
    return err("graveyard must be outside the shadow vault");
  const active = await running();
  if (active.isErr()) return err(active.error);
  if (active.value) {
    const stopped = await quit();
    if (stopped.isErr()) return stopped;
  }
  // Graceful quit may flush registry entries; re-read and revalidate before mutation.
  const latest = await locate();
  if (latest.isErr()) return latest;
  const { data, vaults, match } = latest.value;
  const remaining = Object.fromEntries(
    Object.entries(vaults).filter(([id]) => id !== match.id),
  );
  await atomicWrite({ ...data, vaults: remaining });
  const moved = await command([
    "rip",
    "--graveyard",
    graveyard,
    "--",
    match.path,
  ]);
  if (moved.exit !== 0) {
    await atomicWrite(data);
    return err(`rip failed; registry restored: ${moved.stderr}`);
  }
  process.stdout.write(
    `FORGET ${match.path}; recover with rip from ${graveyard}\n`,
  );
  return ok(undefined);
}

if (import.meta.main) {
  const outcome = await Promise.try(async () => {
    let prototype = false;
    const rejectPrototypeFlag = (
      type: "known-flag" | "unknown-flag" | "argument",
      flag: string,
    ): void => {
      if (type === "unknown-flag" && flag === "__proto__") prototype = true;
    };
    const args = cli({
      name: "forget-shadow.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["[dir]"],
    });
    if (prototype || args._.length > 1)
      return err("usage: forget-shadow.ts [dir]");
    const target = await realpath(args._.dir ?? process.cwd());
    if (!(await stat(target)).isDirectory())
      return err("not a shadow directory");
    return forgetShadow({ kind: "path", value: target });
  }).then(
    (value) => value,
    (error: unknown) => err(String(error)),
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
