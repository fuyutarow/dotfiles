import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { decodedJson } from "../../shared/src/decode.ts";
import { z } from "../../shared/src/zod.ts";

const entry = resolve(import.meta.dir, "../src/index.ts");

function hook(
  body: string,
  input = "{}",
  event = "onPrompt",
  openStdin = false,
) {
  const dir = mkdtempSync(join(tmpdir(), "agx-usehooks-runtime-"));
  const root = join(dir, "repo");
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(join(root, "nested"));
  const path = join(dir, "hook.ts");
  writeFileSync(
    path,
    `import { ${event} } from ${JSON.stringify(entry)}; await ${event}(async (ctx) => { ${body} });`,
  );
  return { dir, root, path, input, openStdin };
}

async function invoke(body: string, input = "{}", event = "onPrompt") {
  const fixture = hook(body, input, event);
  const child = Bun.spawn([process.execPath, fixture.path], {
    stdin: new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  rmSync(fixture.dir, { recursive: true, force: true });
  return { stdout, stderr, exit };
}

test("prompt joins only strings in one matching output block", async () => {
  const result = await invoke(
    'return ["one", false, null, undefined, "", "two"];',
  );
  expect(result).toMatchObject({ exit: 0, stderr: "" });
  expect(decodedJson(z.unknown(), result.stdout)).toEqual({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: "one\ntwo",
    },
  });
});

test("stop blocks once and never blocks an active Stop", async () => {
  const first = await invoke(
    'return ["one", "two"];',
    '{"stop_hook_active":false}',
    "onStop",
  );
  expect(decodedJson(z.unknown(), first.stdout)).toEqual({
    decision: "block",
    reason: "one\ntwo",
  });
  const active = await invoke(
    'return "one";',
    '{"stop_hook_active":true}',
    "onStop",
  );
  expect(active).toEqual({ exit: 0, stdout: "", stderr: "" });
});

test("scalar strings and empty results share the same output contract", async () => {
  expect((await invoke('return "scalar";')).stdout).toContain(
    '"additionalContext":"scalar"',
  );
  for (const value of [
    "false",
    "null",
    "undefined",
    "[]",
    '[false, null, undefined, ""]',
  ]) {
    expect(await invoke(`return ${value};`)).toEqual({
      exit: 0,
      stdout: "",
      stderr: "",
    });
  }
});

test("bad input, wrong event and callback errors fail open with one line", async () => {
  for (const input of [
    "{",
    "null",
    "[]",
    '{"cwd":1}',
    '{"stop_hook_active":"true"}',
    '{"hook_event_name":"Stop"}',
  ]) {
    const result = await invoke('return "must not emit";', input);
    expect(result.exit).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
  }
  const error = await invoke(
    'await Bun.file("/does-not-exist/agx-usehooks").text(); return "bad";',
  );
  expect(error.exit).toBe(0);
  expect(error.stdout).toBe("");
  expect(error.stderr.trim().split("\n")).toHaveLength(1);
});

test("callback timeout terminates before late output", async () => {
  const started = performance.now();
  const result = await invoke('await Bun.sleep(10_000); return "late";');
  expect(result.exit).toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("budget exceeded");
  expect(performance.now() - started).toBeLessThan(4_000);
}, 5_000);

test("stdin is included in the total timeout", async () => {
  const fixture = hook('return "bad";');
  const child = Bun.spawn([process.execPath, fixture.path], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  await child.stdin.end();
  rmSync(fixture.dir, { recursive: true, force: true });
  expect(exit).toBe(0);
  expect(stdout).toBe("");
  expect(stderr.trim().split("\n")).toHaveLength(1);
}, 5_000);

test("context discovers ancestor repo root and preserves payload", async () => {
  const fixture = hook("return JSON.stringify(ctx);");
  const cwd = join(fixture.root, "nested");
  const child = Bun.spawn([process.execPath, fixture.path], {
    stdin: new Blob([JSON.stringify({ cwd, prompt: "hi", custom: 42 })]),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5_000,
  });
  const [out, , exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const result = decodedJson(
    z.object({
      hookSpecificOutput: z.object({ additionalContext: z.string() }),
    }),
    out,
  );
  expect(
    decodedJson(z.unknown(), result.hookSpecificOutput.additionalContext),
  ).toEqual({
    cwd,
    repoRoot: fixture.root,
    payload: { cwd, prompt: "hi", custom: 42 },
  });
  expect(exit).toBe(0);
  rmSync(fixture.dir, { recursive: true, force: true });
});
