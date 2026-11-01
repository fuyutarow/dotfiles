import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
  decisionOf,
  runHook,
  tempDir,
} from "../../../agents/hooks/tests/helpers.ts";

test("external literal operands and globs retain project boundaries", () => {
  const root = tempDir("external-operands-");
  const project = join(root, "project");
  const outside = join(root, "outside");
  const bin = join(root, "bin");
  mkdirSync(join(project, ".cocoindex_code"), { recursive: true });
  mkdirSync(outside);
  mkdirSync(bin);
  writeFileSync(join(project, ".cocoindex_code", "settings.yml"), "x: 1\n");
  writeFileSync(join(bin, "ccc"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(bin, "ccc"), 0o755);
  const env = { PATH: `${bin}:${process.env["PATH"] ?? ""}` };
  const decide = (command: string) =>
    decisionOf(
      runHook(
        "enforce-search-route.ts",
        {
          tool_name: "Bash",
          tool_input: { command },
          cwd: project,
        },
        env,
      ).stdout,
    );
  for (const dir of [outside, project]) {
    const expected = dir === outside ? undefined : "deny";
    for (const assignment of [`d=${dir}`, `d='${dir}'`]) {
      const command = `cd ${project} && export PATH=/some/bin:$PATH && agx worker judge id accept --note 'verify' 2>&1 | tail -1 | cut -c1-100; ${assignment}; ls $d | tr '\\n' ' '; echo; for k in batch K 'Target GPU'; do printf '%s: ' "$k"; cat $d/*.md 2>/dev/null | grep -c -F -e "$k"; done`;
      expect({
        command,
        decision: decide(command)?.permissionDecision,
      }).toEqual({ command, decision: expected });
    }
    const command = `f=${dir}/instrument.md; wc -c $f; grep -n -e '^ANSWER' -e '^#' $f | cut -c1-200 | head -20; sed -n "$(grep -n -m1 -e 'ANSWER mixed' $f | cut -d: -f1),+14p" $f | cut -c1-400`;
    expect({ command, decision: decide(command)?.permissionDecision }).toEqual({
      command,
      decision: expected,
    });
  }
  for (const operand of ["$missing", "$(printf file)"]) {
    const decision = decide(`grep -e needle ${operand}`);
    expect(decision?.permissionDecision).toBe("deny");
    expect(decision?.permissionDecisionReason).toContain(operand);
  }
  writeFileSync(join(project, "inside.md"), "x\n");
  symlinkSync(join(project, "inside.md"), join(outside, "linked.md"));
  for (const command of [
    `d=${outside}; cat $d/*.md | grep -e needle`,
    `d=${outside}; grep -e needle $d/*.md`,
    `d=${outside}; d=$(printf %s ${project}); grep -e needle $d/file`,
  ]) {
    expect({ command, decision: decide(command)?.permissionDecision }).toEqual({
      command,
      decision: "deny",
    });
  }
});
