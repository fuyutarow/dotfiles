#!/usr/bin/env bun
// Fixture for install-mcp.test.ts — emulates the subset of `claude mcp <verb>` that
// scripts/install-mcp.ts drives. Never touches real Claude Code state.
//
// Every invocation first prints `CALL claude <args...>` to stdout so tests can assert on the
// exact argv the script under test constructed (add-command shape, remove-before-add ordering).
//
// Env controls:
//   FAKE_CLAUDE_LIST            - literal text printed for `mcp list` (default: "")
//   FAKE_CLAUDE_FAIL_ADD        - comma-separated server names for which `mcp add` fails
//   FAKE_CLAUDE_FAIL_ADD_EXITCODE - exit code used for a FAIL_ADD name (default: "1") — set to
//                             a distinctive value (e.g. "42") to prove the caller propagates the
//                             REAL exit code rather than a hardcoded 1.
//   FAKE_CLAUDE_FAIL_REMOVE - comma-separated server names for which `mcp remove` exits 1
//                             (used to prove the caller ignores remove failures)

const args = Bun.argv.slice(2);
process.stdout.write(`CALL claude ${args.join(" ")}\n`);

const verb = args[1]; // args[0] === "mcp"

function csv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function nameArg(): string {
  if (verb === "remove") {
    // ["mcp","remove","-s","user",NAME]
    return args[args.length - 1] ?? "";
  }
  if (verb === "add") {
    if (args.includes("--transport")) {
      // ["mcp","add","-s","user","--transport",TYPE,NAME,URL]
      const i = args.indexOf("--transport");
      return args[i + 2] ?? "";
    }
    // ["mcp","add","-s","user",NAME,"--",...tokens]
    const i = args.indexOf("user");
    return args[i + 1] ?? "";
  }
  return "";
}

if (verb === "list") {
  process.stdout.write(process.env.FAKE_CLAUDE_LIST ?? "");
  process.exit(0);
}

const name = nameArg();

if (verb === "remove") {
  if (csv("FAKE_CLAUDE_FAIL_REMOVE").includes(name)) {
    process.stderr.write(`fake claude: remove failed: ${name}\n`);
    process.exit(1);
  }
  process.stdout.write(`removed: ${name}\n`);
  process.exit(0);
}

if (verb === "add") {
  if (csv("FAKE_CLAUDE_FAIL_ADD").includes(name)) {
    const code = Number(process.env.FAKE_CLAUDE_FAIL_ADD_EXITCODE ?? "1");
    process.stderr.write(`fake claude: add failed: ${name}\n`);
    process.exit(code);
  }
  process.stdout.write(`added: ${name}\n`);
  process.exit(0);
}

process.stderr.write(`fake claude: unsupported verb: ${verb}\n`);
process.exit(1);
