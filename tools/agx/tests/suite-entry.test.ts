import { jsonOf, z } from "../../shared/src/zod.ts";
import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };

const entry = join(import.meta.dir, "../src/agx.ts");
async function fixture() {
  const bin = await mkdtemp(join(tmpdir(), "agx-path-"));
  for (const tool of ["worker", "ws", "ticket"]) {
    const path = join(bin, `agx-${tool}`);
    await writeFile(
      path,
      `#!${process.execPath}\nif(process.argv[2]==="--help") { process.stdout.write("agx-${tool} v99.0.0\\n\\n${tool} description from owner\\n"); process.exitCode=Number(process.env.FAKE_EXIT ?? 0); } else { process.stdout.write(JSON.stringify({tool:${JSON.stringify(tool)},args:process.argv.slice(2)})+"\\n"); process.exitCode=Number(process.env.FAKE_EXIT ?? 0); }\n`,
    );
    await chmod(path, 0o755);
  }
  return {
    bin,
    async [Symbol.asyncDispose]() {
      await rm(bin, { recursive: true, force: true });
    },
  };
}
async function run(bin: string, args: string[], exit = 0) {
  const child = Bun.spawn([process.execPath, entry, ...args], {
    env: { ...process.env, PATH: bin, FAKE_EXIT: String(exit) },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  const [stdout, stderr, code] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}
test("suite forwards exact argv through PATH and preserves exit status", async () => {
  await using f = await fixture();
  for (const [tool, args] of [
    ["worker", ["ls"]],
    ["ws", ["ls"]],
    ["ticket", ["--help"]],
  ] as const) {
    // Only --help used by suite discovery is special in these fake bins.
    const result = await run(f.bin, [tool, ...args], 37);
    expect(result.stderr).toBe("");
    if (tool === "ticket") {
      expect(result.stdout).toContain("ticket description from owner");
    } else {
      expect(decode(result.stdout)).toEqual({ tool, args: [...args] });
      expect(result.code).toBe(37);
    }
    expect(result.code).toBe(37);
  }
  const raw = ["run", "a b.md", "--", "-Z", "雪"];
  const result = await run(f.bin, ["worker", ...raw], 23);
  expect(decode(result.stdout)).toEqual({ tool: "worker", args: raw });
  expect(result.code).toBe(23);
});
test("static legacy transition emits exactly one hint", async () => {
  await using f = await fixture();
  for (const verb of [
    "run",
    "dispatch",
    "check",
    "ls",
    "judge",
    "stats",
    "roster",
    "doctor",
    "jev",
  ]) {
    const result = await run(f.bin, [verb, "ticket.md"], 19);
    expect(result.code).toBe(19);
    expect(decode(result.stdout)).toEqual({
      tool: "worker",
      args: [verb, "ticket.md"],
    });
    expect(result.stderr).toBe(
      `agx: '${verb}' is deprecated; use 'agx worker ${verb}'\n`,
    );
  }
});
test("suite owns its version and takes descriptions from PATH tools", async () => {
  await using f = await fixture();
  for (const flag of ["-V", "--version"]) {
    const result = await run(f.bin, [flag]);
    expect(result.stdout).toBe(`agx ${pkg.version}\n`);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
  }
  const help = await run(f.bin, ["-h"]);
  expect(help.code).toBe(0);
  expect(help.stdout).not.toContain("99.0.0");
  for (const tool of ["worker", "ticket", "ws"])
    expect(help.stdout).toContain(`  ${tool}  ${tool} description from owner`);
});
test("suite source contains only dispatch and discovery, with no owner modules", async () => {
  const source = await Bun.file(entry).text();
  expect(source).not.toMatch(
    /records\.jsonl|XDG_STATE|AGX_STATE|writeFile|mkdir|fileURLToPath/u,
  );
  expect(source).not.toMatch(/from\s+["'][^"']*agx-(?:worker|ws|ticket)/u);
});

function decode(text: string) {
  const parsed = jsonOf(
    z.object({ tool: z.string(), args: z.array(z.string()) }),
  ).safeParse(text);
  expect(parsed.success).toBe(true);
  return parsed.success ? parsed.data : undefined;
}

test("deprecated agx-next forwards through PATH with one hint and preserves status", async () => {
  await using f = await fixture();
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, "../../agx-worker/src/agx-next.ts"),
      "ls",
      "--json",
    ],
    {
      env: { ...process.env, PATH: f.bin, FAKE_EXIT: "29" },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    },
  );
  const [out, err, exit] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  expect(decode(out)).toEqual({ tool: "worker", args: ["ls", "--json"] });
  expect(exit).toBe(29);
  expect(err).toBe(
    "agx-next is deprecated; use agx-worker (agx worker) instead\n",
  );
});
