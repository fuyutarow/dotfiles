// PreToolUse gate — the Agent, Task and Workflow tools dispatch nothing; every worker starts
// through `agx worker run <ticket>` or `agx-worker run <ticket>`. matcher: Agent|Task|Workflow (settings.json: run.sh --fail-closed)
//
// THE ROSTER (read through agx-worker roster --json) is the one
// home of what may be dispatched, and agx is the one entry point: Jev picks a row from the
// brief, codex rows run `codex exec` (agx-worker), claude rows run `claude -p` (tools/agx-worker/src/workers/run-claude.ts,
// run-claude.ts, bounded by the roster's [claude_run]). Every run is logged, shown on the statusline
// Run: row and gradable — none of which an Agent or Workflow call would be.
//
// History: until 2026-10-06 a claude row ran as the Agent tool (`subagent_type: "<id>"`) and the
// roster switched rows on and off with `enabled`. Owner 2026-10-06: Jev routes everything with no
// on/off switch — so this hook no longer judges subagent types: it
// denies the tools and points at the entry point, with the table.
//
// FAIL CLOSED: an unreadable roster or any hook error denies; run.sh also denies when bun is
// missing.

import { attempt, errorMessage, type Attempt } from "../../hooks/attempt.ts";
import { strAt } from "../../hooks/narrow.ts";
import { jsonOf, z } from "../../hooks/zod.ts";
import { resolve } from "node:path";
import { decidePre, readStdinJson } from "./lib.ts";

const ROSTER_FILE = "agents/models/dispatch-roster.toml";
const ROSTER_CLI = resolve(
  import.meta.dir,
  "../../../tools/agx-worker/src/next/cli.ts",
);
const ROSTER_TIMEOUT_MS = 2000;
const ENTRY = "`agx worker run <ticket>` or `agx-worker run <ticket>`";

// Validate presentation fields only; strict roster policy belongs to the CLI.
// zod is the committed hook bundle, so this adds no install-time dependency.
const ChoiceSchema = z.object({
  id: z.string(),
  route: z.string(),
  use_for: z.string(),
  aa_index: z.number().optional(),
  tb4: z.number().optional(),
  tb4_source: z.string().optional(),
  scicode: z.number().optional(),
  scicode_source: z.string().optional(),
  price_in: z.number().optional(),
  price_cached_in: z.number().optional(),
  price_out: z.number().optional(),
});
const RosterJson = jsonOf(
  z.object({
    default: z.string(),
    choice: z.array(ChoiceSchema).min(1),
  }),
);
const num = (value: number | undefined): string =>
  value === undefined ? "–" : `${value}`;
const price = (value: number | undefined): string => {
  if (value === undefined) return "—";
  return `$${value.toFixed(value < 1 ? 2 : 0)}`;
};
const blended = (row: z.output<typeof ChoiceSchema>): number | undefined =>
  row.price_in === undefined || row.price_out === undefined
    ? undefined
    : row.price_in + row.price_out;

async function main(): Promise<void> {
  const payload = readStdinJson();
  const tool = strAt(payload, "tool_name") ?? "";
  if (tool !== "Agent" && tool !== "Task" && tool !== "Workflow") return;

  // The CLI honors DISPATCH_ROSTER_PATH; override the script only for boundary fixtures.
  const command = [
    process.execPath,
    process.env.DISPATCH_ROSTER_CLI ?? ROSTER_CLI,
    "roster",
    "--json",
  ];
  const loaded = await (async (): Promise<Attempt<string>> => {
    const spawned = await attempt(async () => {
      const child = Bun.spawn(command, {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: ROSTER_TIMEOUT_MS,
        killSignal: "SIGKILL",
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { stdout, stderr, code, signal: child.signalCode };
    });
    if (!spawned.ok) return { ok: false, error: spawned.error };
    const child = spawned.value;
    if (child.signal !== null)
      return { ok: false, error: `ETIMEDOUT after ${ROSTER_TIMEOUT_MS} ms` };
    if (child.code !== 0)
      return {
        ok: false,
        error: `exit ${child.code}: ${child.stderr.trim()}`,
      };
    const parsed = RosterJson.safeParse(child.stdout);
    if (!parsed.success)
      return {
        ok: false,
        error: `invalid roster JSON: ${parsed.error.message}`,
      };
    const roster = parsed.data;
    const rows = roster.choice;
    const prices = rows.flatMap((row) => blended(row) ?? []);
    const cheapest = Math.min(...prices);
    const table = rows.map((row) => {
      const own = blended(row);
      const cost =
        own === undefined || prices.length === 0
          ? "—"
          : `${Math.round((own / cheapest) * 10) / 10}x`;
      return `| ${row.id === roster.default ? "●" : "○"} | \`${row.id}\` | ${row.route} | ${num(row.aa_index)} | ${num(row.tb4)}${row.tb4_source === undefined ? "" : ` ([AA](${row.tb4_source}))`} | ${num(row.scicode)}${row.scicode_source === undefined ? "" : ` ([AA](${row.scicode_source}))`} | ${price(row.price_in)}/${price(row.price_cached_in)}/${price(row.price_out)} | ${cost} | ${row.use_for} |`;
    });
    return {
      ok: true,
      value: [
        "| default | id | route | AA | TB4 | SciCode | $in/cache/out | cost | use for |",
        "| :-: | --- | --- | --: | --: | --: | --- | --: | --- |",
        ...table,
      ].join("\n"),
    };
  })();
  if (!loaded.ok) {
    // FATAL: the roster could not be read, so dispatch guidance cannot be verified; fail closed.
    decidePre(
      "deny",
      `dispatch-contract: cannot read roster with ${command.join(" ")} (${errorMessage(loaded.error)}) — fix it, then re-invoke.`,
    );
  }

  // SINGLE-AXIS: one question (is this the entry point?) — the tool is never it, whatever its input.
  decidePre(
    "deny",
    `dispatch-contract: the ${tool} tool dispatches nothing — every worker starts with ${ENTRY}. ` +
      "Dispatch with `agx worker dispatch <ticket>` or `agx-worker dispatch <ticket>`. " +
      "For durable runs use `systemd-run --user --unit=agt_<slug> --collect -- agx worker dispatch …`; " +
      "continue with `agx worker run <ticket> --continue <run>` or `agx-worker run <ticket> --continue <run>`.\n" +
      `Roster (${ROSTER_FILE}):\n${loaded.value}`,
  );
}

const r = await attempt(main);
if (!r.ok) {
  // FATAL: the hook itself failed, so no axis could be evaluated; fail closed.
  decidePre(
    "deny",
    `dispatch-contract: hook error while verifying (${errorMessage(r.error)}) — failing closed. ` +
      `Fix ~/.claude/hooks/enforce-dispatch-contract.ts.`,
  );
}
process.exit(0);
