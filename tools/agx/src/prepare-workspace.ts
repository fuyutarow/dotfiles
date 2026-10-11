import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { attempt } from "../../shared/src/attempt.ts";
import {
  checkoutBytes,
  workspaceCommand,
  workspacePolicy,
} from "../../shared/src/workspace-policy.ts";

/** The first checkout is empty; no heavy file is materialized transiently. */
export async function createSparseWorkspace(
  root: string,
  name: string,
  path: string,
  command = workspaceCommand,
) {
  const policy = await workspacePolicy(root);
  if (!policy.ok) return policy;
  const claim = `${path}.agx-claim`;
  const claimed = await attempt(() => mkdir(claim));
  if (!claimed.ok)
    return { ok: false as const, error: `workspace already claimed: ${path}` };
  const created = await attempt(() =>
    createClaimedWorkspace(root, name, path, command, policy.value),
  );
  await rm(claim, { recursive: true, force: true });
  return created.ok ? created.value : created;
}

async function createClaimedWorkspace(
  root: string,
  name: string,
  path: string,
  command: typeof workspaceCommand,
  policy: Extract<
    Awaited<ReturnType<typeof workspacePolicy>>,
    { ok: true }
  >["value"],
) {
  const added = await command(
    [
      "jj",
      "workspace",
      "add",
      "--sparse-patterns",
      "empty",
      "--name",
      name,
      path,
    ],
    root,
  );
  if (!added.ok) return added;
  const prepared = await attempt(async () => {
    const sparse = await command(
      [
        "jj",
        "sparse",
        "set",
        "--clear",
        ...policy.sparse_set.flatMap((p) => ["--add", p]),
      ],
      path,
    );
    if (!sparse.ok) return sparse;
    const commands: string[][] = [];
    if (await Bun.file(join(path, "mise.toml")).exists())
      commands.push(["mise", "trust"]);
    if (await Bun.file(join(path, "bun.lock")).exists())
      commands.push(["bun", "install", "--frozen-lockfile"]);
    for (const args of commands) {
      const setup = await command(args, path);
      if (!setup.ok) return setup;
    }
    const size = await checkoutBytes(path);
    return size.ok
      ? ({
          ok: true,
          value: { ...policy, checkout_bytes: size.value },
        } as const)
      : size;
  });
  if (prepared.ok && prepared.value.ok) return prepared.value;
  await command(["jj", "workspace", "forget", name], root);
  await rm(path, { recursive: true, force: true });
  return prepared.ok ? prepared.value : prepared;
}
