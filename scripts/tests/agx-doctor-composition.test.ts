import { expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../tools/shared/src/zod.ts";
import { DoctorRecord } from "../../tools/shared/src/doctor-record.ts";

const entry = join(import.meta.dir, "../agx-doctor.ts");
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "agx-doctor-compose-"));
  const bin = join(root, "bin");
  await mkdir(bin);
  for (const tool of ["agx-worker", "agx-ws", "agx-ticket"]) {
    const path = join(bin, tool);
    await writeFile(
      path,
      `#!${process.execPath}\nconst tool=${JSON.stringify(tool)};\nif(process.env.MODE==="malformed" && tool==="agx-ws") {process.stdout.write("not json\\n");}\nelse if(process.env.MODE!=="clean" && !(process.env.MODE==="empty-failure" && tool==="agx-ws")) process.stdout.write(JSON.stringify({tool,object:tool+"-object",finding:"fixture",remedy:"repair"})+"\\n");\nprocess.exitCode=process.env.MODE==="clean"?0:(tool==="agx-ws" && process.env.MODE==="failure"?3:1);\n`,
    );
    await chmod(path, 0o755);
  }
  return {
    root,
    bin,
    async [Symbol.asyncDispose]() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
async function invoke(f: { root: string; bin: string }, mode: string) {
  const child = Bun.spawn([process.execPath, entry], {
    env: {
      ...process.env,
      PATH: f.bin,
      AGX_NEXT_STATE_DIR: join(f.root, "state"),
      MODE: mode,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  const [out, err, exit] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  const snapshot = jsonOf(
    z.object({
      complete: z.boolean(),
      total: z.number(),
      findings: z.array(z.string()),
    }),
  ).safeParse(await readFile(join(f.root, "state/doctor.json"), "utf8"));
  expect(snapshot.success).toBe(true);
  return {
    out,
    err,
    exit,
    snapshot: snapshot.success
      ? snapshot.data
      : { complete: false, total: 0, findings: [] },
  };
}
test("diagnostic composition concatenates owner JSON Lines and preserves findings failure", async () => {
  await using f = await fixture();
  const result = await invoke(f, "findings");
  expect(result.exit).toBe(1);
  const lines = result.out.trim().split("\n");
  expect(lines).toEqual(result.snapshot.findings);
  expect(
    lines.map((line) => jsonOf(DoctorRecord).safeParse(line).success),
  ).toEqual([true, true, true]);
  expect(result.snapshot).toMatchObject({ complete: true, total: 3 });
});
test("clean doctors produce an empty successful concatenation", async () => {
  await using f = await fixture();
  const result = await invoke(f, "clean");
  expect(result.exit).toBe(0);
  expect(result.out).toBe("");
  expect(result.snapshot).toMatchObject({ complete: true, total: 0 });
});
test.each(["failure", "empty-failure", "malformed", "missing"])(
  "doctor %s invalidates the previous complete snapshot and fails visibly",
  async (mode) => {
    await using f = await fixture();
    expect((await invoke(f, "clean")).snapshot.complete).toBe(true);
    if (mode === "missing") await rm(join(f.bin, "agx-ws"));
    const result = await invoke(f, mode);
    expect(result.exit).toBe(2);
    expect(result.err).not.toBe("");
    expect(result.snapshot.complete).toBe(false);
  },
);
