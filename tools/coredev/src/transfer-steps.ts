import { spawnSync } from "node:child_process";
import type { ApprovedHost } from "./hosts.ts";
import type { HostKind } from "./profiles.ts";
import type { Probe } from "./login-shell.ts";

export type TransferName = "fnox" | "codex" | "claude" | "gh";
export type StepCommand = { command: string; args: readonly string[] };
export type StepResult = { status: number; output: string };
export type TransferDependencies = {
  hasCommand(name: string): boolean;
  run(command: StepCommand): StepResult;
};

const cCommands = ["cc", "make", "pkg-config"] as const;
const cliTransfers: ReadonlySet<TransferName> = new Set([
  "codex",
  "claude",
  "gh",
]);

export function probeCToolchain(
  dependencies: Pick<TransferDependencies, "hasCommand">,
): Probe {
  const missing = cCommands.filter(
    (command) => !dependencies.hasCommand(command),
  );
  return missing.length === 0
    ? { status: "satisfied", reason: "cc, make and pkg-config are on PATH" }
    : {
        status: "not-satisfied",
        reason: `missing from PATH: ${missing.join(", ")}`,
      };
}

export function ensureCToolchain(
  dependencies: Pick<TransferDependencies, "run">,
): StepResult {
  const result = dependencies.run({
    command: "sudo",
    args: [
      "DEBIAN_FRONTEND=noninteractive",
      "apt-get",
      "install",
      "-y",
      "build-essential",
      "pkg-config",
    ],
  });
  return result;
}

export function probeCToolchainForHost(
  kind: HostKind,
  dependencies: Pick<TransferDependencies, "hasCommand">,
): Probe {
  if (kind === "mac")
    return {
      status: "skipped",
      reason: "C toolchain apt install is Linux-only",
    };
  return probeCToolchain(dependencies);
}

export function transferCredentials(
  host: ApprovedHost,
  dependencies: Pick<TransferDependencies, "run">,
): StepResult {
  const selected = host.transfers.filter((transfer) =>
    cliTransfers.has(transfer),
  );
  let status = 0;
  const output: string[] = [];
  if (selected.length > 0) {
    const auth = dependencies.run({
      command: "mise",
      args: [
        "run",
        "auth:push",
        "--",
        host.alias,
        "--only",
        selected.join(","),
      ],
    });
    status = auth.status;
    if (auth.output.length > 0) output.push(auth.output);
  }
  if (host.transfers.includes("fnox")) {
    const secrets = dependencies.run({
      command: "mise",
      args: ["run", "secrets:push", "--", host.alias],
    });
    if (status === 0) status = secrets.status;
    if (secrets.output.length > 0) output.push(secrets.output);
  }
  return { status, output: output.join("\n") };
}

export function credentialStepResult(
  host: ApprovedHost,
  dependencies: Pick<TransferDependencies, "run">,
): { status: "satisfied" | "not-satisfied"; reason: string } {
  const result = transferCredentials(host, dependencies);
  let reason = result.output;
  if (reason.length === 0 && result.status === 0)
    reason = "credentials transferred";
  if (reason.length === 0)
    reason = `credential transfer failed (exit ${result.status})`;
  return {
    status: result.status === 0 ? "satisfied" : "not-satisfied",
    reason,
  };
}

export function createSystemTransferDependencies(): TransferDependencies {
  return {
    hasCommand(name) {
      return (
        spawnSync("sh", ["-c", 'command -v "$1" >/dev/null 2>&1', "sh", name])
          .status === 0
      );
    },
    run(command) {
      const result = spawnSync(command.command, [...command.args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return {
        status: result.status ?? 1,
        output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
      };
    },
  };
}
