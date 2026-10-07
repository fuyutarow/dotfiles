#!/usr/bin/env bun
// Consumer: a human or root agent explicitly starting one bounded Serena service for one
// project. The process remains foreground-owned; Ctrl-C reaches the resource controller,
// which terminates the whole service/LSP process group before releasing its reservation.

import { createHash } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import {
  executeJob,
  validateManifest,
  type ResourceManifest,
} from "../../agent-resource-run/src/index.ts";
import pkg from "../package.json" with { type: "json" };

const GiB = 1024 ** 3;
export const SERENA_COMMIT = "29d07d4f6b7a04a0db3981d6c6be6f736cfb44d2";
export const SERENA_DEFAULT_CONTEXT = "claude-code";

class UsageError extends Error {}

export type SerenaCommandOptions = {
  project: string;
  context: string;
  port: number;
};

export type SerenaResourceOptions = {
  project: string;
  cpuThreads: number;
  ramBytes: number;
  processes: number;
  scratchBytes: number;
  walltimeSeconds: number;
};

export function buildSerenaCommand(options: SerenaCommandOptions): string[] {
  return [
    "uvx",
    "--from",
    `git+https://github.com/oraios/serena@${SERENA_COMMIT}`,
    "serena",
    "start-mcp-server",
    "--transport",
    "streamable-http",
    "--host",
    "127.0.0.1",
    "--port",
    String(options.port),
    "--context",
    options.context,
    "--project",
    options.project,
    "--open-web-dashboard",
    "False",
  ];
}

export function buildSerenaManifest(
  options: SerenaResourceOptions,
): ResourceManifest {
  const projectHash = createHash("sha256")
    .update(options.project)
    .digest("hex")
    .slice(0, 16);
  return {
    schema: 1,
    job_id: `serena-${projectHash}`,
    run_class: "service",
    cpu_threads: options.cpuThreads,
    processes: options.processes,
    host_ram_peak_bytes: options.ramBytes,
    memory_bound:
      "observed Serena/LSP instances were below 2 GiB; this foreground service gets a " +
      `${options.ramBytes}-byte kernel MemoryMax with zero job swap`,
    device: {
      kind: "cpu",
      gpu_status: "incompatible",
      rationale:
        "Serena and language-server parsing/indexing have no compatible CUDA execution path",
    },
    scratch_bytes: options.scratchBytes,
    child_fanout: 0,
    walltime_seconds: options.walltimeSeconds,
    cleanup: { mode: "term-then-kill", grace_seconds: 10 },
  } satisfies ResourceManifest;
}

let prototypeFlagSeen = false;
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    prototypeFlagSeen = true;
  }
}

function nonEmptyString(flag: string): (value: string) => string {
  void flag;
  return (value) => value;
}

function integerFlag(
  flag: string,
  minimum: number,
  maximum: number,
): (value: string) => number {
  return (value) => {
    void flag;
    void minimum;
    void maximum;
    return /^\d+$/u.test(value) ? Number(value) : Number.NaN;
  };
}

function existingProject(path: string): string | UsageError {
  const resolved = fromThrowable(() => realpathSync(resolve(path)))();
  if (resolved.isErr()) {
    return new UsageError(
      `cannot resolve project '${path}': ${
        resolved.error instanceof Error
          ? resolved.error.message
          : String(resolved.error)
      }`,
    );
  }
  const project = resolved.value;
  const directory = fromThrowable((candidate: string) => statSync(candidate))(
    project,
  );
  if (directory.isErr())
    return new UsageError(
      directory.error instanceof Error
        ? directory.error.message
        : String(directory.error),
    );
  if (!directory.value.isDirectory())
    return new UsageError(`project is not a directory: ${project}`);
  return project;
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "serena-foreground",
      version: pkg.version,
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Run one pinned, bounded Serena HTTP service in the foreground.",
      },
      flags: {
        project: { type: nonEmptyString("--project") },
        context: {
          type: nonEmptyString("--context"),
          default: SERENA_DEFAULT_CONTEXT,
        },
        port: { type: integerFlag("--port", 1_024, 65_535), default: 9_121 },
        cpuThreads: {
          type: integerFlag("--cpu-threads", 1, 8),
          default: 2,
        },
        ramGib: { type: integerFlag("--ram-gib", 1, 16), default: 4 },
        processes: {
          type: integerFlag("--processes", 3, 32),
          default: 12,
        },
        scratchGib: {
          type: integerFlag("--scratch-gib", 0, 32),
          default: 2,
        },
        walltimeSeconds: {
          type: integerFlag("--walltime-seconds", 60, 86_400),
          default: 14_400,
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (prototypeFlagSeen) {
    process.stderr.write("USAGE: Unknown option '--__proto__'\n");
    process.exitCode = 2;
    return;
  }
  if (parsed._.length > 0) {
    process.stderr.write(`USAGE: unexpected argument '${parsed._[0]}'\n`);
    process.exitCode = 2;
    return;
  }
  if (parsed.flags.project === undefined) {
    process.stderr.write("USAGE: --project is required\n");
    process.exitCode = 2;
    return;
  }
  const requiredTextFlags = [
    ["--project", parsed.flags.project],
    ["--context", parsed.flags.context],
  ] as const;
  for (const [flag, value] of requiredTextFlags) {
    if (value === "") {
      process.stderr.write(`USAGE: ${flag} requires a value\n`);
      process.exitCode = 2;
      return;
    }
  }
  if (Bun.which("uvx") === null) {
    process.stderr.write("USAGE: uvx is required to start pinned Serena\n");
    process.exitCode = 2;
    return;
  }

  const project = existingProject(parsed.flags.project);
  if (project instanceof UsageError) {
    process.stderr.write(`USAGE: ${project.message}\n`);
    process.exitCode = 2;
    return;
  }
  const integerFlags = [
    ["--port", parsed.flags.port, 1_024, 65_535],
    ["--cpu-threads", parsed.flags.cpuThreads, 1, 8],
    ["--ram-gib", parsed.flags.ramGib, 1, 16],
    ["--processes", parsed.flags.processes, 3, 32],
    ["--scratch-gib", parsed.flags.scratchGib, 0, 32],
    ["--walltime-seconds", parsed.flags.walltimeSeconds, 60, 86_400],
  ] as const;
  for (const [flag, value, minimum, maximum] of integerFlags) {
    if (!Number.isSafeInteger(value)) {
      process.stderr.write(`USAGE: ${flag} must be an integer\n`);
      process.exitCode = 2;
      return;
    }
    if (value < minimum || value > maximum) {
      process.stderr.write(
        `USAGE: ${flag} must be in [${minimum}, ${maximum}]\n`,
      );
      process.exitCode = 2;
      return;
    }
  }
  const manifestResult = validateManifest(
    buildSerenaManifest({
      project,
      cpuThreads: parsed.flags.cpuThreads,
      ramBytes: parsed.flags.ramGib * GiB,
      processes: parsed.flags.processes,
      scratchBytes: parsed.flags.scratchGib * GiB,
      walltimeSeconds: parsed.flags.walltimeSeconds,
    }),
  );
  if (manifestResult.isErr()) {
    process.stderr.write(`USAGE: ${manifestResult.error.message}\n`);
    process.exitCode = 2;
    return;
  }
  const manifest = manifestResult.value;
  const command = buildSerenaCommand({
    project,
    context: parsed.flags.context,
    port: parsed.flags.port,
  });

  process.stdout.write(
    `SERENA_FOREGROUND project=${project} endpoint=http://127.0.0.1:${parsed.flags.port}/mcp ` +
      `commit=${SERENA_COMMIT}\n`,
  );
  process.stdout.write(
    "Keep this process in the foreground; Ctrl-C performs TERM→KILL cleanup. " +
      "Register the HTTP endpoint only in the intended project/session.\n",
  );
  const execution = await executeJob(manifest, command, { cwd: project });
  if (execution.isErr()) {
    process.stderr.write(`ERROR: ${execution.error.message}\n`);
    process.exitCode = 70;
    return;
  }
  process.exitCode = execution.value.exitCode;
}

if (import.meta.main) {
  await main().then(undefined, (error: unknown) => {
    process.stderr.write(
      `${error instanceof UsageError ? "USAGE" : "ERROR"}: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = error instanceof UsageError ? 2 : 70;
  });
}
