#!/usr/bin/env bun
// Executable MCP fixture for install-mcp.test.ts. Never touches real Claude state.
// FAKE_CLAUDE_LIST supplies raw `mcp list` output; FAIL_ADD/FAIL_REMOVE are
// comma-separated server names. FAIL_ADD_EXITCODE defaults to 1.
export {};

const args = Bun.argv.slice(2);
process.stdout.write(`CALL claude ${args.join(" ")}\n`);

function selected(variable: string, name: string): boolean {
  return (process.env[variable] ?? "")
    .split(",")
    .map((value) => value.trim())
    .includes(name);
}

if (args[0] === "mcp" && args[1] === "list") {
  process.stdout.write(process.env.FAKE_CLAUDE_LIST ?? "");
  process.exit(0);
}

// remove: mcp remove -s user NAME
// add: mcp add -s user [--transport TYPE] NAME ...
const name = args[4] === "--transport" ? args[6] : args[4];
if (args[0] === "mcp" && name !== undefined && args[1] === "remove") {
  if (selected("FAKE_CLAUDE_FAIL_REMOVE", name)) {
    process.stderr.write(`fake claude: remove failed: ${name}\n`);
    process.exit(1);
  }
  process.stdout.write(`removed: ${name}\n`);
  process.exit(0);
}
if (args[0] === "mcp" && name !== undefined && args[1] === "add") {
  if (selected("FAKE_CLAUDE_FAIL_ADD", name)) {
    process.stderr.write(`fake claude: add failed: ${name}\n`);
    process.exit(Number(process.env.FAKE_CLAUDE_FAIL_ADD_EXITCODE ?? "1"));
  }
  process.stdout.write(`added: ${name}\n`);
  process.exit(0);
}

process.stderr.write(
  `unsupported fake Claude MCP command: ${args.join(" ")}\n`,
);
process.exit(2);
