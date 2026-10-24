import { afterAll, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "agx-doctor-caller-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const entry = join(import.meta.dir, "../agx-doctor.ts");
const fixture = await Bun.file(
  join(import.meta.dir, "fixtures/agx-doctor-schema1.json"),
).text();

test.each([0, 1, 2])(
  "compatibility caller preserves released output and exit %s without writing state",
  async (exit) => {
    const cwd = join(root, String(exit));
    const bin = join(cwd, "bin");
    const state = join(cwd, "state");
    await mkdir(bin, { recursive: true });
    await mkdir(state);
    const mise = join(bin, "mise");
    await writeFile(
      mise,
      `#!${process.execPath}
const expected = ${JSON.stringify(["-C", join(import.meta.dir, "../.."), "exec", "--", "agx", "doctor", "--json", "--timeout-ms", "60000"])};
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(expected)) process.exit(99);
process.stdout.write(${JSON.stringify(fixture)});
process.stderr.write("fixture owner diagnostic\\n");
process.exitCode = ${exit};
`,
    );
    await chmod(mise, 0o755);
    const child = Bun.spawn([process.execPath, entry, "--json"], {
      cwd,
      env: {
        ...process.env,
        PATH: bin,
        AGX_STATE_DIR: state,
        XDG_STATE_HOME: state,
        HOME: cwd,
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    const [out, err, code] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    expect(code).toBe(exit);
    expect(out).toBe(fixture);
    expect(err).toBe("fixture owner diagnostic\n");
    expect(await readdir(state)).toEqual([]);
  },
);

test("service directly invokes the released doctor and retains debounce and findings exit", async () => {
  const unit = await Bun.file(
    join(import.meta.dir, "../../systemd/agx-doctor.service"),
  ).text();
  expect(unit).toContain(
    "ExecStart=/usr/bin/env mise -C %h/dotfiles exec -- agx doctor --json --timeout-ms 60000\n",
  );
  expect(unit).toContain("ExecStartPre=/usr/bin/sleep 60\n");
  expect(unit).toContain("SuccessExitStatus=1\n");
  expect(unit).toContain("TimeoutStartSec=300s\n");
});
