import { realpath } from "node:fs/promises";
import { fromAsyncThrowable } from "neverthrow";
import { resolve, sep } from "node:path";
import { fromThrowable, jsonOf, z } from "@dotfiles/shared/src/zod.ts";

const Runs = z.array(
  z.looseObject({
    id: z.string(),
    state: z.string(),
    started_at: z.string().optional(),
    cwd: z.string().nullable().optional(),
    workspace: z.string().nullable(),
    continues: z.string().nullable().optional(),
    end_commit: z.string().nullable().optional(),
    judgment: z.looseObject({ decision: z.string() }).nullable().optional(),
  }),
);
const real = async (path: string) =>
  (await fromAsyncThrowable(() => realpath(path))()).unwrapOr(resolve(path));

async function command(argv: string[], cwd: string) {
  const result = await fromAsyncThrowable(async () => {
    const child = Bun.spawn(argv, {
      cwd,
      env: process.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return {
      ok: exitCode === 0,
      stdout,
      detail: `exit ${exitCode}: ${stderr.slice(-300)}`,
    };
  })();
  return result.unwrapOr({
    ok: false,
    stdout: "",
    detail: "command unavailable",
  });
}

type Inventory =
  | { kind: "ok"; runs: z.output<typeof Runs> }
  | { kind: "error"; error: string };

async function readInventory(store: string): Promise<Inventory> {
  const read = await command(["agx", "worker", "ls", "--all", "--json"], store);
  if (!read.ok)
    return {
      kind: "error",
      error: `cannot read agx run inventory (${read.detail}); keep workspace`,
    };
  const parsed = jsonOf(Runs).safeParse(read.stdout);
  if (!parsed.success)
    return {
      kind: "error",
      error: "invalid agx run inventory; keep workspace",
    };
  return { kind: "ok", runs: parsed.data };
}

/** One inventory per plan; create a new guard for each independent operation. */
export function createRunProtection() {
  let inventory: Promise<Inventory> | undefined;
  return async (store: string, path: string, forgottenCommit?: string) => {
    inventory ??= readInventory(store);
    return protect(await inventory, store, path, forgottenCommit);
  };
}

/** Fresh owner inventory, never the verdict cache: unknown judgment/landing retains data. */
export async function runProtection(
  store: string,
  path: string,
  forgottenCommit?: string,
): Promise<string | null> {
  return protect(await readInventory(store), store, path, forgottenCommit);
}

async function protect(
  inventory: Inventory,
  store: string,
  path: string,
  forgottenCommit?: string,
): Promise<string | null> {
  if (inventory.kind === "error") return inventory.error;
  const dir = await real(path);
  const inside = async (p: string | null | undefined) => {
    if (p === null || p === undefined || p === "") return false;
    const resolved = await real(p);
    return resolved === dir || resolved.startsWith(dir + sep);
  };
  const links = new Map<string, string[]>();
  for (const r of inventory.runs) {
    if (r.continues === null || r.continues === undefined) continue;
    links.set(r.id, [...(links.get(r.id) ?? []), r.continues]);
    links.set(r.continues, [...(links.get(r.continues) ?? []), r.id]);
  }
  const pending: string[] = [];
  for (const r of inventory.runs) {
    if ((await inside(r.workspace)) || (await inside(r.cwd)))
      pending.push(r.id);
  }
  const selected = new Set<string>();
  for (const id of pending) {
    if (selected.has(id)) continue;
    selected.add(id);
    pending.push(...(links.get(id) ?? []));
  }
  const lineage = inventory.runs.filter((r) => selected.has(r.id));
  const live = lineage.find((r) => !["ended", "orphaned"].includes(r.state));
  if (live !== undefined)
    return `live or continuing run ${live.id}; keep workspace`;
  const parents = new Set(lineage.map((r) => r.continues));
  const leaves = lineage.filter((r) => !parents.has(r.id));
  if (lineage.length > 0 && leaves.length === 0)
    return "cyclic run lineage; keep workspace";
  const dates = leaves.map((r) =>
    fromThrowable(
      () => Temporal.Instant.from(r.started_at ?? "").epochMilliseconds,
    )().unwrapOr(Number.NaN),
  );
  const latest = dates.every((date) => Number.isFinite(date))
    ? leaves.filter((_, i) => dates[i] === Math.max(...dates))
    : leaves;
  for (const run of latest) {
    if (run.judgment?.decision === "reject") continue;
    if (run.judgment?.decision !== "accept")
      return `run ${run.id} is unjudged; keep workspace`;
    let tip =
      forgottenCommit === undefined
        ? await command(
            [
              "jj",
              "-R",
              path,
              "--ignore-working-copy",
              "log",
              "--no-graph",
              "-r",
              "@",
              "-T",
              "commit_id",
            ],
            store,
          )
        : { ok: true, stdout: forgottenCommit };
    if (
      run.end_commit !== null &&
      run.end_commit !== undefined &&
      run.end_commit !== ""
    )
      tip = { ok: true, stdout: run.end_commit };
    const commit = tip.stdout.trim();
    if (!tip.ok || !/^[0-9a-f]{40,64}$/u.test(commit))
      return `accepted run ${run.id} has no valid run-end commit; keep workspace`;
    const landed = await command(
      [
        "jj",
        "-R",
        store,
        "--ignore-working-copy",
        "log",
        "--no-graph",
        "-r",
        `(${commit}) & ::trunk()`,
        "-T",
        "commit_id",
      ],
      store,
    );
    if (!landed.ok || landed.stdout.trim() !== commit)
      return `accepted run ${run.id} is not reachable from trunk(); keep workspace`;
  }
  return null;
}
