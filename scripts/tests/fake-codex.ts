#!/usr/bin/env bun
// Fixture for install-mcp.test.ts — emulates the subset of `codex mcp <verb>` that
// scripts/install-mcp.ts drives. Never touches real Codex state.
//
// Every invocation first prints `CALL codex <args...>` to stdout (same convention as
// fake-claude.ts) so tests can assert on the exact argv constructed.
//
// Env controls:
//   FAKE_CODEX_FAIL_ADD    - comma-separated server names for which `mcp add` exits 1
//   FAKE_CODEX_FAIL_REMOVE - comma-separated server names for which `mcp remove` exits 1

const args = Bun.argv.slice(2);
process.stdout.write(`CALL codex ${args.join(" ")}\n`);

const verb = args[1]; // args[0] === "mcp"

function csv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function nameArg(): string {
  // remove: ["mcp","remove",NAME]; add: ["mcp","add",NAME, ...]
  return args[2] ?? "";
}

const name = nameArg();

if (verb === "remove") {
  if (csv("FAKE_CODEX_FAIL_REMOVE").includes(name)) {
    process.stderr.write(`fake codex: remove failed: ${name}\n`);
    process.exit(1);
  }
  process.stdout.write(`removed: ${name}\n`);
  process.exit(0);
}

if (verb === "add") {
  if (csv("FAKE_CODEX_FAIL_ADD").includes(name)) {
    process.stderr.write(`fake codex: add failed: ${name}\n`);
    process.exit(1);
  }
  process.stdout.write(`added: ${name}\n`);
  process.exit(0);
}

process.stderr.write(`fake codex: unsupported verb: ${verb}\n`);
process.exit(1);
