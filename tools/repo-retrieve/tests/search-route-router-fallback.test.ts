import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { decisionOf, tempDir } from "../../../agents/hooks/tests/helpers.ts";

test("router degradation allows lexical search with context and keeps other gates closed", () => {
  const root = resolve(import.meta.dir, "../../..");
  const fixture = tempDir("search-route-router-");
  const hooks = join(fixture, "agents/hooks");
  const src = join(fixture, "tools/repo-retrieve/src");
  const project = join(fixture, "project");
  const bin = join(fixture, "bin");
  for (const dir of [hooks, src, join(project, ".cocoindex_code"), bin])
    mkdirSync(dir, { recursive: true });
  for (const file of [
    "enforce-search-route.ts",
    "lib.ts",
    "narrow.ts",
    "slugs.ts",
    "zod.ts",
    "hooks.toml",
  ])
    copyFileSync(join(root, "agents/hooks", file), join(hooks, file));
  copyFileSync(
    join(root, "tools/repo-retrieve/src/search-route.ts"),
    join(src, "search-route.ts"),
  );
  symlinkSync(join(root, "tools/shared"), join(fixture, "tools/shared"));
  symlinkSync(join(root, "node_modules"), join(fixture, "node_modules"));
  symlinkSync(join(root, "tsconfig.json"), join(fixture, "tsconfig.json"));
  writeFileSync(
    join(project, ".cocoindex_code/settings.yml"),
    "include_patterns: []\n",
  );
  writeFileSync(join(bin, "ccc"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const router = join(src, "repo-retrieve.ts");
  const run = (command: string) =>
    spawnSync(process.execPath, [join(hooks, "enforce-search-route.ts")], {
      input: JSON.stringify({
        tool_name: "Bash",
        tool_input: { command },
        cwd: project,
      }),
      env: { ...process.env, PATH: `${bin}:${process.env["PATH"] ?? ""}` },
      encoding: "utf8",
    });
  for (const mode of ["missing", "unexecutable", "healthy"]) {
    if (mode !== "missing") {
      writeFileSync(router, "#!/usr/bin/env bun\n");
      chmodSync(router, mode === "healthy" ? 0o755 : 0o644);
    }
    const result = run("rg foo");
    expect(result.status).toBe(0);
    const decision = decisionOf(result.stdout);
    if (mode === "healthy") {
      expect(decision?.permissionDecision).toBe("deny");
      expect(decision?.permissionDecisionReason).toContain("Rewrite:");
      continue;
    }
    expect(decision?.permissionDecision).toBeUndefined();
    expect(decision?.additionalContext).toContain(router);
    expect(decision?.additionalContext).toContain("degraded");
    for (const command of [
      "ccc search foo",
      "ccc grep foo",
      "ccc index",
      "rr index --accept-plan",
      'node -e \'require("fs").readdirSync(".")\'',
    ])
      expect({
        command,
        decision: decisionOf(run(command).stdout)?.permissionDecision,
      }).toEqual({ command, decision: "deny" });
  }
});
