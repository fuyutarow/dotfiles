#!/usr/bin/env bun
// Fixture for install-mcp.test.ts — emulates `uv tool install --upgrade 'cocoindex-code[full]'`.
// FAKE_UV_FAIL=1 -> exit 1, simulating a failed ccc bootstrap so tests can prove the caller
// aborts before touching any MCP server (the original shell body has no guard on this call).

process.stdout.write(`CALL uv ${Bun.argv.slice(2).join(" ")}\n`);

if (process.env.FAKE_UV_FAIL === "1") {
  process.stderr.write("fake uv: install failed\n");
  process.exit(1);
}
process.stdout.write("fake uv: installed cocoindex-code[full]\n");
process.exit(0);
