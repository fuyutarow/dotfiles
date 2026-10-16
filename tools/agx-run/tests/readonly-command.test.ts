import { afterAll, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readonlyCommand } from "../../shared/src/readonly-command.ts";

const root = await mkdtemp(join(tmpdir(), "agx-readonly-"));
afterAll(() => rm(root, { recursive: true, force: true }));

async function capture(command: ReturnType<typeof readonlyCommand>) {
  const child = Bun.spawn(command.cmd, {
    env: command.env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  const [code, out, err] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, out, err };
}

test("kernel boundary permits reads and denies writes, including symlink aliases and descendants", async () => {
  const store = join(root, "shared-store");
  await mkdir(store);
  const ref = join(store, "packed-refs");
  await writeFile(ref, "original");
  const alias = join(root, "alias");
  await symlink(store, alias);
  const script = join(root, "probe.ts");
  await writeFile(
    script,
    `import { readFile, writeFile, unlink, rename, mkdir } from "node:fs/promises";
const ref = ${JSON.stringify(ref)};
const before = await readFile(ref, "utf8");
let denied = 0;
const attempts = [
  () => writeFile(ref, "corruption"),
  () => writeFile(${JSON.stringify(join(alias, "packed-refs"))}, "corruption"),
  () => writeFile(${JSON.stringify(join(store, "packed-refs.lock"))}, "corruption"),
  () => unlink(ref),
  () => rename(ref, ref + ".moved"),
  () => mkdir(ref + ".dir"),
];
for (const attempt of attempts) if (await attempt().then(() => false, () => true)) denied++;
const descendant = Bun.spawn([process.execPath, "-e", 'await Bun.write(' + JSON.stringify(ref) + ', "descendant")'], { stdout: "pipe", stderr: "pipe" });
const [exit] = await Promise.all([descendant.exited, new Response(descendant.stdout).text(), new Response(descendant.stderr).text()]);
process.stdout.write(JSON.stringify({ before, denied, descendantDenied: exit !== 0 }));
`,
  );
  const result = await capture(
    readonlyCommand([process.execPath, script], root),
  );
  expect(result.code, result.err).toBe(0);
  expect(result.out).toBe(
    '{"before":"original","denied":6,"descendantDenied":true}',
  );
  expect(await readFile(ref, "utf8")).toBe("original");
  expect(await Bun.file(join(store, "packed-refs.lock")).exists()).toBe(false);
});

test("a killable jj read leaves no early or delayed shared ref mutation", async () => {
  const target = join(root, "late-ref");
  const bin = join(root, "bin");
  await mkdir(bin);
  const jj = join(bin, "jj");
  await writeFile(
    jj,
    `#!${process.execPath}
await Bun.write(${JSON.stringify(target)}, "early").catch(() => {});
process.stdout.write("ready\\n");
await Bun.sleep(5000);
await Bun.write(${JSON.stringify(target)}, "late").catch(() => {});
`,
  );
  await chmod(jj, 0o755);
  const command = readonlyCommand(["jj", "read-fixture"], root, {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
  });
  const child = Bun.spawn(command.cmd, {
    env: command.env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  const reader = child.stdout.getReader();
  let out = "";
  while (!out.includes("ready")) {
    const chunk = await reader.read();
    if (chunk.done) break;
    out += new TextDecoder().decode(chunk.value);
  }
  child.kill("SIGKILL");
  const [exit, err] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  expect(exit, err).not.toBe(0);
  expect(out).toContain("ready");
  expect(await Bun.file(target).exists()).toBe(false);
});

test("invalid isolation job fails closed before its target can start", async () => {
  const target = join(root, "invalid-started");
  const command = readonlyCommand(
    [
      process.execPath,
      "-e",
      `await Bun.write(${JSON.stringify(target)}, "started")`,
    ],
    root,
  );
  const result = await capture({
    ...command,
    env: { ...command.env, AGX_READONLY_COMMAND_JOB: "invalid" },
  });
  expect(result.code).toBe(2);
  expect(result.err).toContain("target was not started");
  expect(await Bun.file(target).exists()).toBe(false);
});
