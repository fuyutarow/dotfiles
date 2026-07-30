// bun test characterizing CURRENT behavior of mise-contract.ts (small-trio family:
// skill-check.ts / mise-contract.ts / lint-floor.ts). This file pins the exact
// stdout lines and exit codes as the bracket for the upcoming refactor. Every
// fixture spawns the REAL `mise` binary (no fake) — the contract under test is
// this repo's `mise tasks ls --json` integration, not a mock of it.
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// mise ships a `bun` SHIM (a symlink to the mise binary itself, dispatched by argv[0])
// ahead of the real bun on PATH. Bun.spawnSync's `env` option REPLACES rather than
// merges the child's environment, so a restricted-PATH test needs an absolute path
// to the real bun executable — resolving via the shim would just re-invoke mise,
// which then needs HOME/mise-data-dir env this test deliberately does not pass.
function resolveRealBun(): string {
  for (const dir of (process.env.PATH ?? "").split(":").filter(Boolean)) {
    const candidate = join(dir, "bun");
    if (!existsSync(candidate)) continue;
    if (!realpathSync(candidate).includes("mise")) return candidate;
  }
  throw new Error("no non-mise-shim `bun` found on PATH for the test harness");
}

const CONTRACT = new URL("../scripts/mise-contract.ts", import.meta.url)
  .pathname;
// tests/ -> forging-skills/ -> skills/ -> agents/ -> repo root
const REPO_ROOT = new URL("../../../../", import.meta.url).pathname.replace(
  /\/$/,
  "",
);

function run(...args: string[]): { out: string; code: number } {
  // bounded: mise reads only the fixture's own mise.toml, no network, one-shot
  const proc = Bun.spawnSync(["bun", CONTRACT, ...args], {
    maxBuffer: 1024 * 1024,
  });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

function makeRoot(miseToml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "mise-contract-"));
  writeFileSync(join(dir, "mise.toml"), miseToml);
  return dir;
}

describe("mise-contract floor", () => {
  test("rejects --__proto__ before resolving or launching mise", () => {
    const { out, code } = run("--__proto__");
    expect(out).toContain("unknown option '--__proto__'");
    expect(code).toBe(2);
  });

  test("this repo's mise.toml satisfies verbs, runtime declaration, and body size", () => {
    const { out, code } = run(REPO_ROOT);
    expect(code).toBe(0);
    expect(out).not.toContain("FAIL");
    expect(out).not.toContain("invoke 'uv' but [tools] does not declare it");
    expect(out).toContain("OK    tools: bun declared");
    expect(out).toContain("OK    fmt\n");
    expect(out).toContain("OK    check\n");
  });

  test("current clean aggregate remains at zero hard findings", () => {
    const { out, code } = run(REPO_ROOT);
    expect(out).toContain(
      `—     mise-contract: 0 hard, 1 warn (${REPO_ROOT})\n`,
    );
    expect(code).toBe(0);
  });

  test("no local tasks resolve any hard/soft token: every FAIL/WARN + exit 1", () => {
    const dir = makeRoot('[tasks.hello]\nrun = "echo hi"\n');
    const { out, code } = run(dir);
    expect(out).toBe(
      "FAIL  fmt — unresolved: mise run fmt would die with 'no task fmt found'\n" +
        "FAIL  f — unresolved: mise run f would die with 'no task f found'\n" +
        "FAIL  fmt:check — unresolved: mise run fmt:check would die with 'no task fmt:check found'\n" +
        "FAIL  lint — unresolved: mise run lint would die with 'no task lint found'\n" +
        "FAIL  test — unresolved: mise run test would die with 'no task test found'\n" +
        "FAIL  up — unresolved: mise run up would die with 'no task up found'\n" +
        "FAIL  check — unresolved: mise run check would die with 'no task check found'\n" +
        "WARN  setup — unresolved (soft token)\n" +
        "WARN  i — unresolved (soft token)\n" +
        "WARN  l — unresolved (soft token)\n" +
        "WARN  t — unresolved (soft token)\n" +
        "WARN  u — unresolved (soft token)\n" +
        "WARN  c — unresolved (soft token)\n" +
        `—     mise-contract: 7 hard, 6 warn (${dir})\n`,
    );
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("mise.toml has no [tasks] at all: FAIL 'no local mise tasks', exit 1", () => {
    const dir = makeRoot("[tools]\n");
    const { out, code } = run(dir);
    expect(out).toBe(
      `FAIL  ${dir}: no local mise tasks (contract not adopted)\n`,
    );
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("root does not exist: ENV cannot cd, exit 2", () => {
    const dir = join(tmpdir(), "mise-contract-does-not-exist-xyz");
    const { out, code } = run(dir);
    expect(out).toBe(`ENV cannot cd to ${dir}\n`);
    expect(code).toBe(2);
  });

  test("[env] block in an untrusted mise.toml: ENV + trust hint, exit 2", () => {
    const dir = makeRoot('[env]\nFOO = "bar"\n');
    const { out, code } = run(dir);
    expect(out).toContain(`ENV mise tasks ls failed in ${dir}:`);
    expect(out).toContain("not trusted");
    expect(out).toContain(
      `ENV   hint: run \`mise trust ${dir}/mise.toml\` ([env] blocks need trust before mise lists tasks)\n`,
    );
    expect(code).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });

  test("mise binary absent from PATH: ENV mise not installed, exit 2", () => {
    const bunBin = resolveRealBun();
    // bounded: PATH scoped to this single child process only; the parent shell is untouched
    const proc = Bun.spawnSync([bunBin, CONTRACT, REPO_ROOT], {
      env: { PATH: "/usr/bin:/bin" },
      maxBuffer: 1024 * 1024,
    });
    expect(proc.stdout.toString()).toBe("ENV mise not installed\n");
    expect(proc.exitCode).toBe(2);
  });

  test("reasonless waiver is inert (no reason ⇒ warning, token still unresolved)", () => {
    const dir = makeRoot(
      "# mise-contract: waive bogus-token\n\n" + '[tasks.fmt]\nrun = "true"\n',
    );
    const { out, code } = run(dir);
    expect(out).toContain(
      "WARN  waiver for 'bogus-token' has no ' -- <reason>' — inert (reason is required)\n",
    );
    expect(out).toContain(
      "FAIL  f — unresolved: mise run f would die with 'no task f found'\n",
    );
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("waiver naming a token outside the contract: WARN unknown token", () => {
    const dir = makeRoot(
      "# mise-contract: waive totally-unknown-token -- some reason here\n\n" +
        '[tasks.fmt]\nrun = "true"\n' +
        '[tasks.f]\nrun = "true"\n' +
        '[tasks."fmt:check"]\nrun = "true"\n' +
        '[tasks.lint]\nrun = "true"\n' +
        '[tasks.l]\nrun = "true"\n' +
        '[tasks.test]\nrun = "true"\n' +
        '[tasks.t]\nrun = "true"\n' +
        '[tasks.up]\nrun = "true"\n' +
        '[tasks.u]\nrun = "true"\n' +
        '[tasks.check]\nrun = "true"\ndepends = ["fmt", "lint"]\n' +
        '[tasks.c]\nrun = "true"\n' +
        '[tasks.setup]\nrun = "true"\n' +
        '[tasks.i]\nrun = "true"\n',
    );
    const { out, code } = run(dir);
    expect(out).toBe(
      "WARN  waiver names unknown token 'totally-unknown-token' — inert (not in the contract)\n" +
        "OK    fmt\nOK    f\nOK    fmt:check\nOK    lint\nOK    test\nOK    up\nOK    check\n" +
        "OK    setup\nOK    i\nOK    l\nOK    t\nOK    u\nOK    c\n" +
        `—     mise-contract: 0 hard, 1 warn (${dir})\n`,
    );
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("waiving a verb also waives its alias (e.g. lint ⇒ l)", () => {
    const dir = makeRoot(
      "# mise-contract: waive lint -- fixture: alias propagation\n\n" +
        '[tasks.fmt]\nrun = "true"\n',
    );
    const { out, code } = run(dir);
    expect(out).toContain("WAIVE lint (mise.toml waiver)\n");
    expect(out).toContain("WAIVE l\n");
    expect(code).toBe(1); // fmt:check/test/up/check are still unresolved hard tokens
    rmSync(dir, { recursive: true, force: true });
  });

  test("hyphenated task name, empty check-depends, and a dangling dependency all WARN", () => {
    const dir = makeRoot(
      '[tasks.check]\ndepends = []\nrun = "true"\n' +
        '[tasks."weird-name"]\ndepends = ["nonexistent-dep"]\nrun = "true"\n',
    );
    const { out } = run(dir);
    expect(out).toContain(
      "WARN  grammar: hyphen in task name (colon-only rule): weird-name\n",
    );
    expect(out).toContain(
      "WARN  grammar: check has empty depends (check = all-gates aggregate)\n",
    );
    expect(out).toContain(
      "WARN  grammar: depends reference unresolved task(s): nonexistent-dep\n",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("no arguments: defaults to root '.'", () => {
    const dir = makeRoot('[tasks.hello]\nrun = "echo hi"\n');
    const proc = Bun.spawnSync(["bun", CONTRACT], {
      cwd: dir,
      maxBuffer: 1024 * 1024,
    });
    const out = proc.stdout.toString() + proc.stderr.toString();
    expect(out).toContain("FAIL  fmt — unresolved");
    expect(out).toContain(`—     mise-contract: 7 hard, 6 warn (${dir})\n`);
    expect(proc.exitCode).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});
