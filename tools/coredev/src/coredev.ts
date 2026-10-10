#!/usr/bin/env bun
import { cli } from "cleye";
import { readApprovedHost } from "./hosts.ts";
import { buildPlan, renderDryRun } from "./planner.ts";
import { noOpAdapter } from "./adapters.ts";
import pkg from "../package.json" with { type: "json" };

const parsed = cli({
  name: "coredev",
  version: pkg.version,
  strictFlags: true,
  parameters: ["<command>", "[arguments...]"],
  help: { description: "Plan and inspect core development host deployment." },
  flags: {
    dryRun: {
      type: Boolean,
      description: "Print the validated deployment plan.",
    },
  },
});

const [command, ...args] = parsed._;
function fail(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

function doctor(doctorArgs: readonly string[]): void {
  if (doctorArgs.length > 1) fail("usage: coredev doctor [<target>]", 2);
  const target = doctorArgs[0];
  if (target === undefined) {
    console.log("coredev doctor: no checks implemented yet");
    process.exit(0);
  }
  const host = readApprovedHost(target);
  if (host.isErr()) fail(host.error.message);
  console.log("coredev doctor: no checks implemented yet");
  process.exit(0);
}

if (command === "wsl" && args[0] === "wake")
  fail("coredev wsl wake: not yet implemented", 2);
if (command === "wsl" && args[0] === "distro" && args[1] === "new")
  fail("coredev wsl distro new: not yet implemented", 2);
if (command === "doctor") doctor(args);
if (command !== "deploy" || args.length === 0)
  fail("usage: coredev deploy <target> [+wsl] [+mac] [--dry-run]", 2);

const target = args[0];
if (target === undefined) fail("deploy target is required", 2);
const overlayArgs = args.slice(1);
if (overlayArgs.some((arg) => arg !== "+wsl" && arg !== "+mac"))
  fail(
    `unknown deploy argument: ${overlayArgs.find((arg) => arg !== "+wsl" && arg !== "+mac") ?? ""}`,
    2,
  );
const approved = readApprovedHost(target);
if (approved.isErr()) fail(approved.error.message);
const overlays: ("wsl" | "mac")[] = [];
for (const arg of overlayArgs) {
  if (arg === "+wsl") overlays.push("wsl");
  else if (arg === "+mac") overlays.push("mac");
}
const result = buildPlan(target, approved.value.kind, overlays);
if (result.isErr()) fail(result.error.message);
if (parsed.flags.dryRun === true) console.log(renderDryRun(result.value));
else {
  for (const step of result.value.steps) {
    console.log(
      `${step.id} | ${noOpAdapter.probe(step)} | ${noOpAdapter.action(step)} | verify:${step.verifier}`,
    );
  }
}
