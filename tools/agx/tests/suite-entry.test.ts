import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../src/agx.ts", import.meta.url));

async function invoke(...args: string[]) {
  const child = Bun.spawn([process.execPath, ENTRY, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("suite entry runs run, ws, and ticket help through their CLIs", async () => {
  const cases = [
    { args: ["--version"], output: /^\d+\.\d+\.\d+\n$/u },
    { args: ["--help"], output: /USAGE:/u },
    { args: ["run", "--help"], output: /run/u },
    { args: ["check", "--help"], output: /agx check/u },
    { args: ["ls", "--help"], output: /agx ls/u },
    { args: ["judge", "--help"], output: /agx judge/u },
    { args: ["stats", "--help"], output: /agx stats/u },
    { args: ["ws", "--help"], output: /ws/u },
    { args: ["ticket", "--help"], output: /tkt/u },
  ];

  for (const { args, output } of cases) {
    const result = await invoke(...args);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(output);
    expect(result.stderr).toBe("");
  }
});

test("suite entry only starts part processes and holds no state", async () => {
  const source = await Bun.file(ENTRY).text();
  expect(source).toContain("Bun.spawn(");
  expect(source).not.toMatch(/from\s+["'][^"']*agx-(?:run|ws|ticket)/u);
  expect(source).not.toMatch(
    /records\.jsonl|XDG_STATE|AGX_STATE|writeFile|mkdir/u,
  );
});
