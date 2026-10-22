import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctorFindings, type DoctorWorkspaceRow } from "../src/workspace.ts";

const scratch = await mkdtemp(join(tmpdir(), "ws-doctor-root-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));
const cli = join(import.meta.dir, "../src/ws.ts");

test("unset repository override retains registry discovery; an override bypasses the registry", async () => {
  await mkdir(join(scratch, "presets"));
  await writeFile(join(scratch, "presets/consumers.toml"), "consumers = 42\n");
  const source = `import { doctorInventory } from ${JSON.stringify(join(import.meta.dir, "../src/workspace.ts"))}; console.log(JSON.stringify(await doctorInventory(process.argv[1])));`;
  for (const root of [undefined, join(scratch, "empty")]) {
    const child = Bun.spawn([process.execPath, "-e", source, scratch], {
      env: { ...process.env, AGX_REPOS_ROOT: root },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, err).toBe(0);
    if (root === undefined) {
      expect(out).toContain('"ok":false');
      expect(out).toContain("consumer registry");
    } else expect(out.trim()).toBe('{"ok":true,"value":[]}');
  }
});

test("retired repository overrides fail with exit 2 even when empty or paired with the replacement", async () => {
  for (const name of ["AGX_DOCTOR_HOME", "AGX_DOCTOR_WORKSPACE"]) {
    for (const [value, replacement] of [
      ["", undefined],
      ["", scratch],
      [scratch, undefined],
      [scratch, scratch],
    ]) {
      const child = Bun.spawn([process.execPath, cli, "doctor"], {
        env: { ...process.env, [name]: value, AGX_REPOS_ROOT: replacement },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [out, err, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code).toBe(2);
      expect(out).toBe("");
      expect(err.trim().split("\n")).toHaveLength(1);
      expect(err).toContain(name);
      expect(err).toContain("AGX_REPOS_ROOT");
    }
  }
});

function row(
  verdict: string,
  kind: "ws" | "legacy",
  recorded: boolean,
): DoctorWorkspaceRow {
  return {
    repo: "/fixture/repo",
    dir: "/fixture/repo.ws/ws_work",
    name: "ws_work",
    kind,
    recorded,
    ageMs: 73 * 60 * 60 * 1000,
    classification: {
      verdict,
      collect: ["empty", "landed", "abandoned", "land-temp"].includes(verdict),
      change: "abc",
      age: "4 days",
      reason: "fixture",
    },
  };
}

test("workspace findings omit only timer-eligible classes and retain owner actions", () => {
  for (const verdict of ["empty", "landed"]) {
    expect(doctorFindings([row(verdict, "legacy", false)])).toEqual([]);
    expect(doctorFindings([row(verdict, "ws", true)])).toEqual([]);
    expect(doctorFindings([row(verdict, "ws", false)])).toHaveLength(1);
  }
  for (const kind of ["ws", "legacy"] as const) {
    expect(doctorFindings([row("abandoned", kind, true)]).join("\n")).toContain(
      "\tabandoned\t",
    );
    expect(doctorFindings([row("unlanded", kind, true)]).join("\n")).toContain(
      "\tunlanded-72h\t",
    );
    expect(doctorFindings([row("stale", kind, true)]).join("\n")).toContain(
      "\tstale\t",
    );
    for (const verdict of ["kept", "keep", "land-temp"])
      expect(doctorFindings([row(verdict, kind, true)])).toEqual([]);
  }
});

test("recent recorded workspaces cannot emit landing findings, but retain stale and abandoned actions", () => {
  const recent = (
    verdict: string,
    kind: "ws" | "legacy" = "ws",
    recorded = true,
  ) => ({
    ...row(verdict, kind, recorded),
    ageMs: 72 * 60 * 60 * 1000,
  });
  for (const verdict of [
    "empty",
    "landed",
    "unlanded",
    "no trunk",
    "keep",
    "kept",
    "land-temp",
  ])
    expect(doctorFindings([recent(verdict)])).toEqual([]);
  for (const verdict of ["stale", "abandoned"])
    expect(doctorFindings([recent(verdict)])).toHaveLength(1);
  expect(doctorFindings([recent("empty", "ws", false)])).toHaveLength(1);
  expect(doctorFindings([recent("unlanded", "legacy")])).toHaveLength(1);
});
