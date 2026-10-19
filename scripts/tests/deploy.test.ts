import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const script = join(root, "scripts/deploy.ts");
const scratch: string[] = [];

afterEach(() => {
  for (const path of scratch.splice(0))
    rmSync(path, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "deploy-test-"));
  scratch.push(dir);
  const mise = join(dir, "mise");
  const ssh = join(dir, "ssh");
  writeFileSync(
    mise,
    `#!${process.execPath}\nconst args=process.argv.slice(2); process.stdout.write(process.env.DEPLOY_TIMER_OUTPUT ?? ""); if(args.at(-1)==="doctor") process.stdout.write(process.env.DEPLOY_DOCTOR_OUTPUT ?? "PASS healthy\\nRESULT: PASS · FAIL 0 · WARN 0 · PASS 1 · SKIP 0\\n");\n`,
  );
  writeFileSync(
    ssh,
    `#!${process.execPath}\nimport { appendFileSync } from "node:fs"; const args=process.argv.slice(2); process.stdout.write(process.env.DEPLOY_TIMER_OUTPUT ?? ""); const host=args[2]??"?"; const command=args.at(-1)??""; appendFileSync(process.env.DEPLOY_EVENTS,host+"\\t"+command+"\\n"); if(host===process.env.DEPLOY_FAIL_HOST){process.stderr.write("fixture remote failure\\n");process.exit(7)} if(host===process.env.DEPLOY_MISSING_HOST){process.stderr.write("ssh: Could not resolve hostname "+host+": Name or service not known\\n");process.exit(255)} const begin=command.match(/__DEPLOY_DOCTOR_BEGIN_[0-9]+__/u)?.[0]; const end=command.match(/__DEPLOY_DOCTOR_END_[0-9]+__/u)?.[0]; if(begin&&end)process.stdout.write("\\n"+begin+"_DOCTOR\\nPASS healthy\\nRESULT: PASS · FAIL 0 · WARN 0 · PASS 1 · SKIP 0\\n__LAND_DOCTOR_EXIT_0__\\n"+end+"_DOCTOR\\n");\n`,
  );
  chmodSync(mise, 0o755);
  chmodSync(ssh, 0o755);
  return { dir, mise, ssh };
}

test("deploy reports host failures independently and continues later hosts", () => {
  const f = fixture();
  const events = join(f.dir, "events");
  const result = Bun.spawnSync(
    [process.execPath, script, "--since", "deadbeef"],
    {
      cwd: root,
      env: {
        ...process.env,
        DEPLOY_MISE: f.mise,
        DEPLOY_SSH: f.ssh,
        DEPLOY_EVENTS: events,
        DEPLOY_FAIL_HOST: "sol",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 20_000,
    },
  );
  const out = result.stdout.toString();
  expect(result.exitCode).toBe(1);
  expect(out).toContain("[deploy] sol: FAIL remote command exited 7");
  expect(out).toContain("[deploy] r99-u26: ok; doctor PASS 1 / FAIL 0");
  expect(out).toContain('"r99-u24":"skipped (damaged)"');
  const rows = readFileSync(events, "utf8").trim().split("\n");
  expect(rows.map((row) => row.split("\t")[0])).toEqual(["sol", "r99-u26"]);
  expect(rows[0]).toContain("DOTFILES_RENDER_REV=");
  expect(rows[0]).toContain("deadbeef");
});

test("unresolvable deploy host is skipped without hiding later host results", () => {
  const f = fixture();
  const result = Bun.spawnSync([process.execPath, script], {
    cwd: root,
    env: {
      ...process.env,
      DEPLOY_MISE: f.mise,
      DEPLOY_SSH: f.ssh,
      DEPLOY_EVENTS: join(f.dir, "events"),
      DEPLOY_MISSING_HOST: "sol",
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 20_000,
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain(
    "[deploy] sol: skipped: unresolvable",
  );
  expect(result.stdout.toString()).toContain(
    "[deploy] r99-u26: ok; doctor PASS 1 / FAIL 0",
  );
});

test("deploy uses the final doctor RESULT counts rather than earlier summaries", () => {
  const f = fixture();
  const result = Bun.spawnSync([process.execPath, script], {
    cwd: root,
    env: {
      ...process.env,
      DEPLOY_MISE: f.mise,
      DEPLOY_SSH: f.ssh,
      DEPLOY_EVENTS: join(f.dir, "events"),
      DEPLOY_DOCTOR_OUTPUT:
        "RESULT: PASS · FAIL 0 · WARN 0 · PASS 1 · SKIP 0\n" +
        "RESULT: FAIL 7 · WARN 2 · PASS 14 · SKIP 3\n",
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 20_000,
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain(
    "local: ok (doctor FAIL 7); doctor PASS 14 / FAIL 7",
  );
});

test("deploy relays started and preserved timer reports for local and remote hosts", () => {
  const f = fixture();
  const started = "started: herdr-projector.timer (first installation)";
  const preserved =
    "left inactive: prompt-archive.timer (already installed before deploy; user stop preserved)";
  const result = Bun.spawnSync([process.execPath, script], {
    cwd: root,
    env: {
      ...process.env,
      DEPLOY_MISE: f.mise,
      DEPLOY_SSH: f.ssh,
      DEPLOY_EVENTS: join(f.dir, "events"),
      DEPLOY_TIMER_OUTPUT: `${started}\n${preserved}\n`,
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 20_000,
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  for (const host of ["local", "sol", "r99-u26"])
    for (const line of [started, preserved])
      expect(result.stdout.toString()).toContain(`[deploy] ${host}: ${line}`);
});
