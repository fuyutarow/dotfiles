#!/usr/bin/env bun
// Consumer: humans (tables) and machine callers (one JSON document).
import { cli, command } from "cleye";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fromAsyncThrowable } from "neverthrow";
import { z } from "../../shared/src/zod.ts";
import { loadConfig, plan, run, type EngineOptions } from "./engine.ts";
import { Plan, Tier } from "./model.ts";
import { errorMessage, readReceipts, stateDir, wrap } from "./receipt.ts";
import { deleteApproved } from "./delete.ts";
import { readHeadroom } from "./storage.ts";
import { registry, type Context, type Target } from "./targets/index.ts";
import { typedYes } from "./targets/purge.ts";
import { workerMutationRefusal } from "./lib/worker-guard.ts";
import { resolveProcRoot } from "./lib/procs.ts";

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("disk-reclaim: unknown flag --__proto__\n");
    process.exit(2);
  }
};
const flags = {
  json: {
    type: Boolean,
    default: false,
    description: "Write exactly one JSON document",
  },
  tier: { type: String, description: "Select a decision tier" },
  all: {
    type: Boolean,
    default: false,
    description: "Plan all registered targets",
  },
  yes: { type: Boolean, default: false, description: "Authorize run" },
  noProgress: {
    type: Boolean,
    default: false,
    description: "Disable stderr progress",
  },
  fetch: {
    type: Boolean,
    default: false,
    description: "Fetch jj Git remotes before judging workspaces (opt-in)",
  },
  stopOnError: {
    type: Boolean,
    default: false,
    description: "Stop this target after its first candidate failure",
  },
  interactive: {
    type: Boolean,
    default: false,
    description: "Keep the terminal for wrap",
  },
  last: { type: Number, default: 10, description: "Number of latest receipts" },
};
const usageExit = (code: number) => {
  if (code === 1) process.exitCode = 2;
};
const common = { strictFlags: true, ignoreArgv: rejectPrototypeFlag };
const planFlags = {
  json: flags.json,
  tier: flags.tier,
  all: flags.all,
  fetch: flags.fetch,
  noProgress: flags.noProgress,
};
const parsedFlags = z.object({
  json: z.boolean().default(false),
  tier: z.string().optional(),
  all: z.boolean().default(false),
  yes: z.boolean().default(false),
  noProgress: z.boolean().default(false),
  fetch: z.boolean().default(false),
  stopOnError: z.boolean().default(false),
  interactive: z.boolean().default(false),
  last: z.number().default(10),
});
const commands = [
  command({
    ...common,
    name: "plan",
    parameters: ["[targets...]"],
    flags: planFlags,
  }),
  command({
    ...common,
    name: "run",
    parameters: ["[targets...]"],
    flags: {
      json: flags.json,
      tier: flags.tier,
      yes: flags.yes,
      noProgress: flags.noProgress,
      interactive: flags.interactive,
      stopOnError: flags.stopOnError,
      fetch: flags.fetch,
    },
  }),
  command({
    ...common,
    name: "targets",
    parameters: [],
    flags: { json: flags.json },
  }),
  command({
    ...common,
    name: "delete",
    parameters: ["<paths...>"],
    flags: { json: flags.json, yes: flags.yes },
  }),
  command({
    ...common,
    name: "receipts",
    parameters: [],
    flags: { json: flags.json, last: flags.last },
  }),
  command({
    ...common,
    name: "wrap",
    parameters: ["<name>", "--", "<command...>"],
    flags: { interactive: flags.interactive },
  }),
];
const print = (value: unknown, human: string, json: boolean): void => {
  process.stdout.write(`${json ? JSON.stringify(value) : human}\n`);
};
const fail = (message: string): number => {
  process.stderr.write(`disk-reclaim: ${message}\n`);
  return 2;
};

function planTable(value: Plan): string {
  const lines = ["TARGET\tTIER\tVERDICT\tPATH\tBYTES\tREASON"];
  for (const target of value.targets) {
    if (!target.available)
      process.stderr.write(
        `disk-reclaim: SKIP ${target.name}: ${target.skip_reason ?? "unavailable"}\n`,
      );
    lines.push(
      ...target.candidates.map(
        (c) =>
          `${target.name}\t${target.tier}\t${c.verdict}\t${c.path ?? "-"}\t${c.bytes ?? "-"}\t${c.reason}`,
      ),
    );
  }
  return lines.join("\n");
}

export async function main(
  argv = Bun.argv.slice(2),
  targets: Target[] = registry,
  dependencies: Pick<EngineOptions, "captureLiveness"> = {},
): Promise<number> {
  // Cleye exits 1 for parser errors; reclaim reserves 1 for partial action failure.

  process.on("exit", usageExit);
  const parsed = cli(
    {
      ...common,
      name: "disk-reclaim",
      version: "0.2.0",
      parameters: ["[targets...]"],
      commands,
      flags: planFlags,
      help: {
        description:
          "Preview safe disk reclamation; run and delete require --yes.",
      },
    },
    undefined,
    argv,
  );
  process.removeListener("exit", usageExit);
  const validatedFlags = parsedFlags.safeParse(parsed.flags);
  if (!validatedFlags.success) return fail(validatedFlags.error.message);
  const f = validatedFlags.data;
  const selectedCommand = parsed.command;
  if (selectedCommand === "wrap") {
    const name = parsed._[0];
    if (name === undefined) return fail("wrap requires a name");
    if (f.json)
      return fail("wrap forwards command output and does not support --json");
    return wrap(name, parsed._["--"], f.interactive);
  }
  if (selectedCommand === "run" || (selectedCommand === "delete" && f.yes)) {
    const refusal = workerMutationRefusal();
    if (refusal !== null) return fail(refusal);
  }
  const p = parsed;
  if (["targets", "receipts"].includes(selectedCommand ?? "") && p._.length > 0)
    return fail("unexpected positional arguments");
  if (f.interactive && selectedCommand !== "run")
    return fail("--interactive is supported only by run and wrap");
  if (selectedCommand === "delete") {
    const paths = p._.map(String);
    if (paths.length === 0) return fail("delete requires at least one path");
    const loaded = loadConfig();
    if (loaded.config === null) return fail(loaded.error ?? "invalid config");
    const result = await deleteApproved(paths, {
      config: loaded.config,
      yes: f.yes,
      state: stateDir(),
      procRoot: resolveProcRoot(),
    });
    for (const refusal of result.refused)
      process.stderr.write(
        `disk-reclaim: REFUSED ${refusal.path}: ${refusal.reason} (owner ${refusal.owner_name}, uid ${refusal.owner_uid}); repair: ${refusal.repair}\n`,
      );
    print(result, result.lines.join("\n"), f.json);
    return result.exit;
  }
  if (selectedCommand === "receipts") {
    if (!Number.isSafeInteger(f.last) || f.last < 0)
      return fail("--last must be a non-negative integer");
    const result = readReceipts(f.last);
    if (result.errors.length > 0) return fail(result.errors.join("; "));
    print(
      result.receipts,
      [
        "NAME\tENDED\tEXIT\tFREE BEFORE\tFREE AFTER\tOUTPUT",
        ...result.receipts.map(
          (r) =>
            `${r.name}\t${r.ended}\t${r.exit}\t${r.free_before}\t${r.free_after}\t${r.output ?? "-"}`,
        ),
      ].join("\n"),
      f.json,
    );
    return 0;
  }
  const loaded = loadConfig();
  if (loaded.config === null) return fail(loaded.error ?? "invalid config");
  const progressTimes = new Map<string, number>();
  let progressTarget: string | null = null;
  const progressTty = process.stderr.isTTY ?? false;
  const reportProgress = (
    target: string,
    root: string,
    entries: number,
    bytes: number,
  ): void => {
    const now = Temporal.Now.instant().epochMilliseconds;
    const last = progressTimes.get(target) ?? 0;
    if (last !== 0 && now - last < (progressTty ? 250 : 2000)) return;
    progressTimes.set(target, now);
    const line = `[reclaim] ${target}: scanning ${root} · ${entries} entries · ${bytes} bytes so far`;
    if (progressTty) {
      if (progressTarget !== null && progressTarget !== target)
        process.stderr.write("\n");
      process.stderr.write(`\r${line}`);
      progressTarget = target;
    } else process.stderr.write(`${line}\n`);
  };
  const context: Context = {
    mode: "plan",
    explicit: false,
    fetch: f.fetch,
    progress: !f.noProgress,
    progressTty,
    reportProgress: f.noProgress ? undefined : reportProgress,
    config: loaded.config,
    procDir: resolveProcRoot(),
    log: (m) => {
      process.stderr.write(`reclaim: ${m}\n`);
    },
  };
  if (selectedCommand === "targets") {
    const rows = await Promise.all(
      targets.map(async (t) => {
        const availability = await t.available(context);
        return {
          name: t.name,
          tier: t.tier,
          ...availability,
          what: t.description?.what ?? "",
          why: availability.skip_reason ?? t.description?.why ?? "",
        };
      }),
    );
    print(
      rows,
      [
        "NAME\tTIER\tAVAILABLE\tWHAT\tWHY",
        ...rows.map(
          (t) => `${t.name}\t${t.tier}\t${t.available}\t${t.what}\t${t.why}`,
        ),
      ].join("\n"),
      f.json,
    );
    return 0;
  }
  const names = p._.slice();
  const tier = f.tier === undefined ? null : Tier.safeParse(f.tier);
  if (tier !== null && !tier.success) return fail(`unknown tier ${f.tier}`);
  const unknown = names.filter((name) => !targets.some((t) => t.name === name));
  if (unknown.length > 0)
    return fail(`unknown target(s): ${unknown.join(", ")}`);
  if (
    selectedCommand === "run" &&
    (f.all || (names.length === 0 && f.tier !== "blind"))
  )
    return fail(
      "run requires named targets or --tier blind; --all is plan-only",
    );
  // sudo is part of blind selection and emits SKIP when unavailable.
  const picked = targets.filter(
    (t) =>
      (names.length === 0 || names.includes(t.name)) &&
      (tier === null ||
        !tier.success ||
        t.tier === tier.data ||
        (tier.data === "blind" && t.tier === "sudo")),
  );
  const measured = readHeadroom();
  if (names.some((name) => !picked.some((t) => t.name === name)))
    return fail("named targets do not match --tier");
  let authorized = f.yes;
  if (f.interactive) {
    if (!stdin.isTTY) return fail("--interactive requires a terminal");
    if (picked.length !== 1 || picked[0]?.name !== "purge")
      return fail(
        "--interactive is reserved for the irreversible purge target",
      );
    const prompt = createInterface({ input: stdin, output: stdout });
    let onKeypress:
      | ((_character: string, key: { name?: string }) => void)
      | undefined;
    const escape = new Promise<string>((resolve) => {
      onKeypress = (_character, key) => {
        if (key.name === "escape") resolve("\u001B");
      };
      stdin.on("keypress", onKeypress);
    });
    const answer = await Promise.race([
      prompt.question(
        "Empty every graveyard permanently. Type yes to continue: ",
      ),
      escape,
    ]).finally(() => {
      if (onKeypress !== undefined)
        stdin.removeListener("keypress", onKeypress);
      prompt.close();
    });
    if (!typedYes(answer)) {
      process.stderr.write("disk-reclaim: purge cancelled\n");
      return 1;
    }
    authorized = true;
  }
  const options = {
    ...dependencies,
    context,
    explicit: names,
    yes: authorized,
    stopOnError: f.stopOnError,
    headroom: measured,
  };
  if (!f.noProgress)
    process.stderr.write(
      `[reclaim] plan: scanning ${picked.length} targets…\n`,
    );
  const result =
    selectedCommand === "run"
      ? await run(picked, options)
      : await plan(picked, options);
  if (progressTarget !== null) process.stderr.write("\n");
  if (result.error !== null) process.stderr.write(`reclaim: ${result.error}\n`);
  if (result.plan !== null) {
    const validated = Plan.safeParse(result.plan);
    if (!validated.success) return fail(validated.error.message);
    print(validated.data, planTable(validated.data), f.json);
  }
  return result.exit;
}
if (import.meta.main) {
  const result = await fromAsyncThrowable(main)();
  if (result.isErr())
    process.stderr.write(`reclaim: ${errorMessage(result.error)}\n`);
  process.exit(result.isOk() ? result.value : 2);
}
