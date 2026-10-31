import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { decideSearchRoute } from "../src/search-route.ts";

const commands = [
  "cd /home/fuyu/Workspace/firedancer && export PATH=/home/linuxbrew/.linuxbrew/bin:$PATH && mise run leaderboard:view -- --all 2>&1 | grep -F -e '25fc5cf3' | head -14 | cut -c1-300",
  "cat /tmp/claude-1000/-home-fuyu-Workspace-firedancer/kps9-local_fold-1-memory_read-test.log | grep -e TIMING; sed -n '30,50p' /home/fuyu/Workspace/firedancer.ws/ws_kps3-integrate-1029/packages-2611/FireOps.jl/modules/local_fold/1/test/memory_read.jl",
  "f=/home/fuyu/.local/state/agx/runs/69161943-e0ca-43c0-8508-32c77cf5b2d4/design.md; wc -c $f; cat $f | grep -E -e '^#{1,3} '",
  "ls /tmp/claude-1000/-home-fuyu-Workspace-firedancer/ | grep -F -e trial | head",
];

test("recorded filters and project file producers", async () => {
  const root = mkdtempSync(join(tmpdir(), "route-classifier-"));
  const project = join(root, "project");
  const other = join(root, "other");
  for (const path of [project, other]) {
    mkdirSync(join(path, ".cocoindex_code"), { recursive: true });
    writeFileSync(join(path, ".cocoindex_code", "settings.yml"), "x: 1\n");
  }
  const decide = (command: string) =>
    decideSearchRoute({
      payload: { tool_name: "Bash", tool_input: { command }, cwd: project },
    });
  for (const command of commands)
    expect({ command, decision: await decide(command) }).toEqual({
      command,
      decision: undefined,
    });
  for (const path of [join(project, "source.ts"), join(other, "source.ts")]) {
    for (const command of [
      `cat ${path} | grep needle`,
      `f=${path}; wc -c $f; cat $f | grep needle`,
      `printf ok | grep ok; cat ${path} | grep needle`,
    ])
      expect({
        command,
        denied: (await decide(command)) !== undefined,
      }).toEqual({
        command,
        denied: true,
      });
  }
  const prefixed = `cd ${project} && export PATH=/some/bin:$PATH && mise run view 2>&1 | grep -F -e x | head -14 | cut -c1-300`;
  expect(await decide(prefixed)).toBeUndefined();
});
