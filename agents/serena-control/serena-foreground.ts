#!/usr/bin/env bun
// Consumer: a human or root agent explicitly starting one bounded Serena service for one
// project. The process remains foreground-owned; Ctrl-C reaches the resource controller,
// which terminates the whole service/LSP process group before releasing its reservation.

import { createHash } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { cli } from "cleye";
import {
  executeJob,
  validateManifest,
  type ResourceManifest,
} from "../resource-control/agent-resource-run.ts";

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
  return validateManifest({
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
  });
}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`Unknown option '--${flag}'`);
  }
}

function nonEmptyString(flag: string): (value: string) => string {
  return (value) => {
    if (value === "") throw new UsageError(`${flag} requires a value`);
    return value;
  };
}

function integerFlag(
  flag: string,
  minimum: number,
  maximum: number,
): (value: string) => number {
  return (value) => {
    if (!/^\d+$/.test(value)) {
      throw new UsageError(`${flag} must be an integer`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new UsageError(`${flag} must be in [${minimum}, ${maximum}]`);
    }
    return parsed;
  };
}

function existingProject(path: string): string {
  let project: string;
  try {
    project = realpathSync(resolve(path));
  } catch (error) {
    throw new UsageError(
      `cannot resolve project '${path}': ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!statSync(project).isDirectory()) {
    throw new UsageError(`project is not a directory: ${project}`);
  }
  return project;
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "serena-foreground",
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
  if (parsed._.length > 0) {
    throw new UsageError(`unexpected argument '${parsed._[0]}'`);
  }
  if (parsed.flags.project === undefined) {
    throw new UsageError("--project is required");
  }
  if (Bun.which("uvx") === null) {
    throw new UsageError("uvx is required to start pinned Serena");
  }

  const project = existingProject(parsed.flags.project);
  const manifest = buildSerenaManifest({
    project,
    cpuThreads: parsed.flags.cpuThreads,
    ramBytes: parsed.flags.ramGib * GiB,
    processes: parsed.flags.processes,
    scratchBytes: parsed.flags.scratchGib * GiB,
    walltimeSeconds: parsed.flags.walltimeSeconds,
  });
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
  const result = await executeJob(manifest, command, { cwd: project });
  process.exitCode = result.exitCode;
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof UsageError ? "USAGE" : "ERROR"}: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = error instanceof UsageError ? 2 : 70;
  });
}
