import { fromPromise, fromThrowable } from "neverthrow";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { validateSlug } from "../../../shared/src/slug.ts";
import { ownerlessRefLocks } from "../../../shared/src/ref-locks.ts";
import { checkPremises } from "../premises.ts";
import {
  exhaustionPolicy,
  loadRoster,
  routeFilterLabel,
} from "../../../../agents/models/roster.ts";
import { parseNextTicket, writeGlob } from "./ticket.ts";
import { ticketContext, ticketPlacement } from "./ticket-home.ts";
import { foldedRuns, runningWorkspaceRun } from "./store.ts";
import { verificationEnvironment } from "./verify.ts";
import { pinContinuation } from "./continue.ts";
import { readRouteUsage } from "./usage.ts";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { DispatchBindingSchema } from "../../../shared/src/agx-dispatch-binding.ts";
import {
  AgxConfigError,
  InspectionTimeout,
  InspectionUnavailable,
} from "../../../shared/src/agx-config.ts";

export const PREFLIGHT_PREMISE_BUDGET_MS = 60_000;

export type PreflightFlags = Readonly<
  Record<string, string | boolean | undefined>
>;
const value = (flags: PreflightFlags, key: string) =>
  typeof flags[key] === "string" ? flags[key] : undefined;

const LegacyReport = z.looseObject({
  summary: z.string().optional(),
  changes: z.array(z.unknown()).optional(),
});

export async function earlyQuitRows(
  ticket: string,
  cwd: string,
): Promise<string[]> {
  return (
    await Promise.all(
      (await foldedRuns())
        .filter(
          (priorRun) => priorRun.ticket === ticket && priorRun.cwd === cwd,
        )
        .map(async (priorRun) => {
          if (priorRun.failed_early_quit) return [priorRun.row];
          const endedAt = priorRun.ended_at;
          const reportPath = priorRun.report_path;
          if (
            priorRun.state !== "ended" ||
            priorRun.exit !== 0 ||
            priorRun.returned !== undefined ||
            priorRun.changed_files !== undefined ||
            endedAt === null ||
            reportPath === null
          )
            return [];
          const duration = fromThrowable(
            () =>
              Temporal.Instant.from(endedAt)
                .since(Temporal.Instant.from(priorRun.started_at))
                .total({ unit: "seconds" }),
            (error) => error,
          )();
          if (!duration.isOk() || duration.value >= 120) return [];
          const text = await fromPromise(
            readFile(reportPath, "utf8"),
            (error) => error,
          );
          if (!text.isOk()) return [];
          const report = jsonOf(LegacyReport).safeParse(text.value);
          if (!report.success) return [];
          const returned = report.data.summary?.includes("agx-return") ?? false;
          return !returned && report.data.changes?.length === 0
            ? [priorRun.row]
            : [];
        }),
    )
  ).flat();
}

/** Inspect only: no routing, workspace reservation, run artifacts or worker launch. */
export async function preflight(
  path: string,
  cwd: string,
  flags: PreflightFlags = {},
) {
  const failures: (string | AgxConfigError)[] = [];
  const add = (reason: string, repair: string) => {
    failures.push(`${reason.replaceAll(/[\r\n]+/gu, "; ")}; repair: ${repair}`);
  };
  const bytes = await readFile(path).catch(() => null);
  const parsed =
    bytes === null ? undefined : parseNextTicket(bytes.toString("utf8"), true);
  const ticket = parsed?.success === true ? parsed.ticket : undefined;
  if (bytes === null)
    add(`no such ticket: ${path}`, "supply a readable ticket path");
  for (const reason of parsed?.success === false
    ? (parsed.reasons ?? [parsed.reason])
    : [])
    add(`invalid ticket: ${reason}`, "correct the ticket front matter");
  if (parsed?.success === true && parsed.warnings.length > 0)
    process.stderr.write(
      `WARN ignored legacy ticket fields: ${parsed.warnings.join(", ")}\n`,
    );
  const continuationId = value(flags, "continue");
  for (const [index, glob] of (ticket?.writes ?? []).entries())
    if (!writeGlob.safeParse(glob).success)
      add(
        `invalid ticket writes.${index}: ${glob}`,
        "use a relative glob without .., relative to --cd",
      );
  if (ticket !== undefined && continuationId === undefined) {
    const slug = validateSlug(
      ticket.name ?? basename(path, ".md"),
      "agx ticket new",
    );
    if (!slug.ok)
      add(String(slug.error), "use the suggested agx ticket new command");
  }
  const located = await ticketContext(dirname(resolve(path)));
  if (
    !located.ok &&
    located.configurationError instanceof InspectionUnavailable
  )
    return { temporary: located.configurationError };
  const repository =
    located.ok && located.vcs === undefined
      ? await ticketContext(cwd)
      : located;
  if (
    !repository.ok &&
    repository.configurationError instanceof InspectionUnavailable
  )
    return { temporary: repository.configurationError };
  if (!repository.ok && repository.configurationError !== undefined)
    failures.push(repository.configurationError);
  else if (!repository.ok)
    add(
      repository.error,
      "repair the repository, agx.toml and the XDG_CONFIG_HOME/agx/repos/*.toml override",
    );
  else {
    const placement = await ticketPlacement(path, repository);
    if (placement !== null)
      add(
        placement,
        "create or move the ticket using agx ticket new in the declared home",
      );
  }
  const worker = await ticketContext(cwd);
  if (!worker.ok && worker.configurationError instanceof InspectionUnavailable)
    return { temporary: worker.configurationError };
  const ctx =
    repository.ok && worker.ok
      ? {
          ...repository,
          base_rev: worker.base_rev,
          revision: worker.revision,
          vcs: worker.vcs,
          verifyAlways: worker.verifyAlways,
        }
      : undefined;
  if (!worker.ok && worker.configurationError !== undefined)
    failures.push(worker.configurationError);
  else if (!worker.ok) add(worker.error, "repair the --cd repository");
  if (ctx !== undefined && ctx.base_rev === null && ctx.vcs !== undefined)
    add(
      "cannot resolve --cd commit for base_rev",
      "select a tree with a resolvable commit",
    );
  const premise_commits: { premise: string; commit: string }[] = [];
  if (ticket !== undefined && ctx !== undefined) {
    if (ticket.base_rev !== undefined && ticket.base_rev !== ctx.base_rev)
      add(
        `base_rev mismatch: ticket ${resolve(path)}, declared ${ticket.base_rev}, repository ${ctx.root}, worker ${cwd} commit ${ctx.base_rev ?? "unavailable"}`,
        "update base_rev or select the intended --cd commit",
      );
    let temporary: InspectionUnavailable | undefined;
    const premises = checkPremises(
      ticket.premises?.filter(
        (premise) => ctx.vcs !== "git" || !premise.startsWith("rev:"),
      ),
      cwd,
      {
        budgetMs: PREFLIGHT_PREMISE_BUDGET_MS,
        onTimeout: (argv, directory, milliseconds) => {
          temporary = new InspectionTimeout(
            "PREFLIGHT_PREMISE_BUDGET_MS",
            milliseconds,
            argv,
            directory,
          );
        },
        onTemporaryFailure: (argv, directory, output) => {
          temporary = new InspectionUnavailable(
            output.trim() === ""
              ? `inspection unavailable; command=${JSON.stringify(argv)}; cwd=${directory}; exit=75; no stderr`
              : output.trim().replaceAll(/[\r\n]+/gu, "; "),
          );
        },
      },
    );
    if (temporary !== undefined) return { temporary };
    for (const detail of premises.status === "missing" ? premises.details : [])
      add(
        `missing premises in --cd tree: ${detail}`,
        "restore the premise or correct the ticket/--cd tree",
      );
    if (premises.status === "timeout")
      add(
        "premise inspection command failed",
        "repair the premise command and retry",
      );
  }
  for (const premise of ticket !== undefined && ctx !== undefined
    ? (ticket.premises ?? [])
    : []) {
    if (ctx === undefined) continue;
    let reference = /^(?:rev|bookmark):(.+)$/u.exec(premise)?.[1];
    if (
      ctx.vcs === "git" &&
      premise.startsWith("bookmark:") &&
      reference !== undefined
    ) {
      const at = reference.lastIndexOf("@");
      reference =
        at < 0
          ? `refs/heads/${reference}`
          : `refs/remotes/${reference.slice(at + 1)}/${reference.slice(0, at)}`;
    }
    const commit =
      reference === undefined ? ctx.base_rev : await ctx.revision(reference);
    if (commit instanceof InspectionUnavailable) return { temporary: commit };
    if (commit === null && reference === undefined && ctx.vcs === undefined)
      continue;
    if (commit === null)
      add(
        `cannot resolve premise commit: ${premise}`,
        "restore the revision or correct the premise",
      );
    else premise_commits.push({ premise, commit });
  }
  const holder = await runningWorkspaceRun(cwd);
  if (holder !== undefined)
    add(
      `workspace ${cwd} already has running run ${holder.id}`,
      "wait for that run to end or select another --cd workspace",
    );
  for (const { path: lockPath, ageMs } of ownerlessRefLocks(cwd))
    add(
      `ownerless Git ref lock(s) block dispatch: ${lockPath} age=${Math.floor(ageMs / 1000)}s`,
      "Confirm no holder, then repair with: rip <path>",
    );
  const environment = verificationEnvironment(
    cwd,
    process.env,
    {},
    (reason) => {
      add(
        reason,
        `inspect the target configuration, then run mise trust in ${cwd}`,
      );
    },
  );
  if (environment instanceof InspectionUnavailable)
    return { temporary: environment };
  const sandbox =
    value(flags, "sandbox") ?? ticket?.sandbox ?? "workspace-write";
  if (!["none", "read-only", "workspace-write"].includes(sandbox))
    add(
      "--sandbox must be none, read-only, or workspace-write",
      "choose a supported sandbox",
    );
  if (ticket?.sandbox !== undefined && sandbox !== ticket.sandbox)
    add(
      `--sandbox ${sandbox} differs from ticket sandbox ${ticket.sandbox}`,
      "use the ticket sandbox or amend the ticket",
    );
  const rawBinding = value(flags, "dispatchBinding");
  const binding =
    rawBinding === undefined
      ? undefined
      : jsonOf(DispatchBindingSchema).safeParse(rawBinding);
  if (binding?.success === false)
    add(
      `invalid dispatch binding: ${binding.error.message}`,
      "dispatch again to create a valid binding",
    );
  if (
    binding?.success === true &&
    (binding.data.ticket !== (ticket?.name ?? basename(path, ".md")) ||
      resolve(binding.data.workspace) !== cwd)
  )
    add(
      "dispatch binding does not match the ticket and --cd workspace",
      "dispatch again for the intended ticket and workspace",
    );
  const supersedes = value(flags, "supersedes") ?? ticket?.supersedes;
  if (continuationId !== undefined && supersedes !== undefined)
    add(
      "supersedes and --continue are mutually exclusive",
      "choose replacement or continuation",
    );
  if (
    supersedes !== undefined &&
    !(await foldedRuns()).some((prior) => prior.id === supersedes)
  )
    add(
      `cannot supersede unknown run ${supersedes}`,
      "select an existing run id from agx worker ls",
    );
  const loaded = await loadRoster(process.env.DISPATCH_ROSTER_PATH);
  if (!loaded.ok)
    add(
      `cannot read dispatch roster: ${loaded.error}`,
      "repair DISPATCH_ROSTER_PATH or its roster",
    );
  const pinned =
    continuationId === undefined
      ? undefined
      : await pinContinuation(continuationId, path, undefined, (reason) => {
          add(reason, `start a fresh run with: agx worker run ${path}`);
        });
  const capacityPrevious =
    continuationId === undefined
      ? undefined
      : (await foldedRuns()).find(
          (prior) =>
            prior.id === continuationId && prior.outcome === "capacity",
        );
  if (
    loaded.ok &&
    (continuationId === undefined || capacityPrevious !== undefined) &&
    ticket !== undefined
  ) {
    const usage = await readRouteUsage(
      undefined,
      exhaustionPolicy(loaded.value.auto),
    );
    const minimumTb4 = ticket.capabilities.some((tag) =>
      ["terminal-agentic", "long-tool-loop"].includes(tag),
    )
      ? 30
      : undefined;
    const maskedRows = await earlyQuitRows(
      ticket.name ?? basename(path, ".md"),
      cwd,
    );
    if (capacityPrevious !== undefined) {
      const previousRow = loaded.value.choice.find(
        (row) => row.id === capacityPrevious.row,
      );
      maskedRows.push(
        capacityPrevious.row,
        ...loaded.value.choice
          .filter(
            (row) =>
              previousRow !== undefined &&
              row.route === previousRow.route &&
              row.model === previousRow.model,
          )
          .map((row) => row.id),
      );
    }
    const eligible = loaded.value.choice.filter(
      (row) =>
        !maskedRows.includes(row.id) &&
        (loaded.value.auto.routes === undefined ||
          loaded.value.auto.routes.includes(row.route)) &&
        (minimumTb4 === undefined || (row.tb4 ?? 0) >= minimumTb4),
    );
    if (eligible.length === 0)
      add(
        `no roster row satisfies required capabilities (${routeFilterLabel(loaded.value.auto)})`,
        "correct capabilities or the dispatch roster",
      );
    else if (!eligible.some((row) => usage[row.route].available))
      add(
        "all capability-eligible routes are at their subscription limit",
        "wait for subscription reset or enable an available route",
      );
  }
  return {
    temporary: undefined,
    failures,
    ticket,
    prose: parsed?.success === true ? parsed.prose : "",
    bytes,
    ctx,
    premise_commits,
    sandbox,
    binding: binding?.success === true ? binding.data : undefined,
    pinned,
    loaded,
  };
}

export function printPreflightFailures(
  failures: (string | AgxConfigError)[],
): number {
  const lines = failures.map((failure) =>
    failure instanceof AgxConfigError ? failure.message : `agx: ${failure}`,
  );
  for (const line of new Set(lines)) process.stderr.write(`${line}\n`);
  return 2;
}
