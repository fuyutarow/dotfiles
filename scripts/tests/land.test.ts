import { afterEach, describe, expect, test as bunTest } from "bun:test";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import { LAND_HOSTS } from "../config-registry.ts";
import { packageBinProblems } from "../land.ts";

const script = join(import.meta.dir, "../land.ts");
const REPO = join(import.meta.dir, "../..");
const temporary: string[] = [];
// These JJ integration fixtures exceed Bun's default 5s under suite load; retain a finite 12s bound.
const LAND_FORMATTER_TEST_TIMEOUT_MS = 12_000;
// All cases construct real JJ repositories and spawn the landing command; keep their
// suite-load allowance consistent rather than letting a different case hit 5s each run.
function test(
  name: string,
  body: () => void | Promise<void>,
  timeout = LAND_FORMATTER_TEST_TIMEOUT_MS,
): void {
  bunTest(name, body, timeout);
}
const eventsSchema = jsonOf(z.array(z.string()));
function writeToolPackage(root: string, version: string): void {
  mkdirSync(join(root, "tools", "agx"), { recursive: true });
  writeFileSync(
    join(root, "tools", "agx", "package.json"),
    `${JSON.stringify({ name: "agx", version }, null, 2)}\n`,
  );
}
function writeToolChangelog(root: string, entry: string): void {
  writeFileSync(
    join(root, "tools", "agx", "CHANGELOG.md"),
    `# Changelog\n\n## ${entry}\n\n- entry\n\n## 1.0.0 — 2026-10-01\n\n- initial\n`,
  );
}
afterEach(() => {
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true });
});

test("package bin targets must be executable and start with a shebang", async () => {
  const root = mkdtempSync(join(tmpdir(), "land-bin-test-"));
  temporary.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ bin: { sample: "src/main.ts" } }),
  );
  const target = join(root, "src/main.ts");
  writeFileSync(target, "#!/usr/bin/env bun\nprocess.exit(0);\n");
  chmodSync(target, 0o755);
  expect(await packageBinProblems(root)).toEqual([]);
  chmodSync(target, 0o644);
  expect(await packageBinProblems(root)).toContain(
    "src/main.ts: target is not executable",
  );
  writeFileSync(target, "process.exit(0);\n");
  chmodSync(target, 0o755);
  expect(await packageBinProblems(root)).toContain(
    "src/main.ts: target has no shebang",
  );
});

test("every repository package bin target is executable and has a shebang", async () => {
  expect(await packageBinProblems(REPO)).toEqual([]);
});

function fixture() {
  const temp = mkdtempSync(join(tmpdir(), "land-test-"));
  temporary.push(temp);
  const main = join(temp, "main");
  const worker = join(temp, "dotfiles-arm-worker");
  const events = join(temp, "events");
  const env = {
    ...process.env,
    HOME: temp,
    JJ_CONFIG: join(temp, "config.toml"),
    JJ_USER: "Landing Test",
    JJ_EMAIL: "land@example.test",
    JJ_EDITOR: "true",
    LAND_EVENTS: events,
    AGX_STATE_DIR: join(temp, "agx-state"),
  };
  writeFileSync(
    env.JJ_CONFIG,
    '[user]\nname = "Landing Test"\nemail = "land@example.test"\n',
  );
  function jj(cwd: string, argv: string[]) {
    const result = Bun.spawnSync(
      ["jj", "--no-pager", "--color", "never", ...argv],
      { cwd, env, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
    );
    expect(`${result.exitCode}: ${result.stderr.toString()}`).toStartWith("0:");
    return result.stdout.toString().trim();
  }
  jj(temp, ["git", "init", "--colocate", main]);
  writeFileSync(join(main, "old name.txt"), "rename content\n");
  writeFileSync(join(main, "delete.txt"), "delete content\n");
  writeFileSync(join(main, "keep.txt"), "keep content\n");
  writeFileSync(join(main, "untouched.ts"), "const untouched = true;\n");
  writeFileSync(join(main, "remove.md"), "# Remove\n");
  jj(main, ["commit", "-m", "base"]);
  jj(main, ["bookmark", "set", "alpha", "-r", "@-"]);
  jj(main, [
    "workspace",
    "add",
    "--name",
    "dotfiles-arm-worker",
    "-r",
    "alpha",
    worker,
  ]);
  const mise = join(temp, "mise-stub");
  const ssh = join(temp, "ssh-stub");
  writeFileSync(
    mise,
    `#!${process.execPath}\nimport { appendFileSync } from 'node:fs';
appendFileSync(process.env.LAND_EVENTS, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.env.LAND_FAIL_COMMIT === '1') { process.stderr.write('hook:pre-commit refused: fixture refusal\\n'); process.exit(9); }
const argv = process.argv.slice(2);
if (argv[1] === 'deps') process.exit(0);
const paths = argv.slice(argv.lastIndexOf('--') + 1).map(p => 'root:' + JSON.stringify(p));
for (const args of [['commit', '-m', argv[argv.indexOf('-m') + 1], '--', ...paths], ['bookmark', 'set', 'alpha', '-r', '@-']]) {
 const r = Bun.spawnSync(['jj', ...args], { stdout: 'pipe', stderr: 'pipe', timeout: 30000 });
 if (r.exitCode !== 0) { process.stderr.write(r.stderr); process.exit(r.exitCode); }
}
appendFileSync(process.env.LAND_EVENTS, JSON.stringify(['pushed']) + '\\n');\n`,
  );
  writeFileSync(
    ssh,
    `#!${process.execPath}\nimport { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.LAND_EVENTS, JSON.stringify(['ssh', ...args]) + '\\n');
const host = args[2] ?? 'unknown';
const command = args.at(-1) ?? '';
const begin = command.match(/__LAND_SMOKE_BEGIN_[0-9]+__/u)?.[0];
const end = command.match(/__LAND_SMOKE_END_[0-9]+__/u)?.[0];
if (begin !== undefined && end !== undefined) process.stdout.write('\\n' + begin + '\\n  smoke output for ' + host + '  \\n' + end + '\\n');
if (process.env.LAND_UNREACHABLE_SSH === host) { process.stderr.write('ssh: connect to host ' + host + ' failed\\n'); process.exit(255); }
process.exit(process.env.LAND_FAIL_SSH === host ? 7 : 0);\n`,
  );
  chmodSync(mise, 0o755);
  chmodSync(ssh, 0o755);
  for (const formatter of ["bunx", "rumdl", "shfmt"]) {
    const path = join(temp, formatter);
    writeFileSync(
      path,
      `#!${process.execPath}\nimport { appendFileSync } from 'node:fs';
appendFileSync(process.env.LAND_EVENTS, JSON.stringify(['format', '${formatter}', ...process.argv.slice(2)]) + '\\n');\n`,
    );
    chmodSync(path, 0o755);
  }
  function land(
    args: string[] = [],
    extraEnv: Record<string, string> = {},
    cwd = main,
    workspace = "dotfiles-arm-worker",
  ) {
    return Bun.spawnSync(
      [process.execPath, script, workspace, "-m", "Land test", ...args],
      {
        cwd,
        env: {
          ...env,
          PATH: `${temp}:${process.env.PATH ?? ""}`,
          LAND_MISE: mise,
          LAND_SSH: ssh,
          ...extraEnv,
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 60_000,
      },
    );
  }
  function log(): string[][] {
    if (!existsSync(events)) return [];
    return readFileSync(events, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const result = eventsSchema.safeParse(line);
        expect(result.success).toBe(true);
        return result.success ? result.data : [];
      });
  }
  return { main, worker, jj, land, log };
}

function digest(root: string): string {
  const hash = new Bun.CryptoHasher("sha256");
  function visit(path: string): void {
    for (const entry of readdirSync(path).toSorted()) {
      const child = join(path, entry);
      hash.update(child.slice(root.length));
      if (statSync(child).isDirectory()) visit(child);
      else hash.update(readFileSync(child));
    }
  }
  visit(root);
  return hash.digest("hex");
}

describe("land workspace", () => {
  test("resolves package version and CHANGELOG only conflicts with the workspace bump level", () => {
    const f = fixture();
    writeToolPackage(f.main, "1.0.0");
    writeToolChangelog(f.main, "1.0.0 — 2026-10-01");
    const baseChangelog = readFileSync(
      join(f.main, "tools", "agx", "CHANGELOG.md"),
      "utf8",
    );
    const prependChangelog = (root: string, entry: string): void => {
      writeFileSync(
        join(root, "tools", "agx", "CHANGELOG.md"),
        `# Changelog\n\n## ${entry}\n\n- new entry\n\n${baseChangelog.slice(baseChangelog.indexOf("## "))}`,
      );
    };
    f.jj(f.main, ["commit", "-m", "add agx package"]);
    f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    f.jj(f.main, ["workspace", "forget", "dotfiles-arm-worker"]);
    rmSync(f.worker, { recursive: true, force: true });
    f.jj(f.main, [
      "workspace",
      "add",
      "--name",
      "dotfiles-arm-worker",
      "-r",
      "alpha",
      f.worker,
    ]);
    writeToolPackage(f.worker, "1.1.0");
    prependChangelog(f.worker, "1.1.0 — 2026-10-10");
    f.jj(f.worker, ["status"]);
    writeToolPackage(f.main, "1.0.1");
    prependChangelog(f.main, "1.0.1 — 2026-10-10");
    f.jj(f.main, ["commit", "-m", "alpha version bump"]);
    f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    const result = f.land();
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(
      readFileSync(join(f.main, "tools", "agx", "package.json"), "utf8"),
    ).toContain('"version": "1.1.0"');
    expect(
      readFileSync(join(f.main, "tools", "agx", "CHANGELOG.md"), "utf8"),
    ).toMatch(/^## 1\.1\.0 — 2026-10-10/mu);
    expect(result.stdout.toString()).toContain(
      "resolved version-only conflict",
    );
  });

  test("accepts the workspace directory basename when its jj name differs", () => {
    const f = fixture();
    f.jj(f.main, ["workspace", "forget", "dotfiles-arm-worker"]);
    rmSync(f.worker, { recursive: true, force: true });
    const aliasPath = join(dirname(f.worker), "dotfiles-arm-bunexec-1010");
    f.jj(f.main, [
      "workspace",
      "add",
      "--name",
      "bunexec-1010",
      "-r",
      "alpha",
      aliasPath,
    ]);
    writeFileSync(join(aliasPath, "keep.txt"), "worker version\n");
    const result = f.land([], {}, f.main, basename(aliasPath));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(
      "[land] workspace: removed bunexec-1010",
    );
    expect(existsSync(aliasPath)).toBe(false);
  });

  test("landing records acceptance for every run from the workspace", () => {
    const f = fixture();
    const state = join(f.main, "..", "agx-state");
    mkdirSync(state, { recursive: true });
    appendFileSync(
      join(state, "runs.jsonl"),
      `${JSON.stringify({ kind: "run", run_id: "run-from-workspace", cwd: f.worker })}\n`,
    );
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land();
    expect(result.exitCode).toBe(0);
    const lines = readFileSync(join(state, "runs.jsonl"), "utf8")
      .trim()
      .split("\n");
    const acceptance = jsonOf(
      z.looseObject({
        kind: z.string(),
        run_id: z.string(),
        accept: z.boolean(),
      }),
    ).safeParse(lines.at(-1) ?? "");
    expect(acceptance.success ? acceptance.data : undefined).toMatchObject({
      kind: "acceptance",
      run_id: "run-from-workspace",
      accept: true,
    });
  });

  test("dry-run preserves tracked relative symlinks instead of inventing overlap", () => {
    const f = fixture();
    symlinkSync("keep.txt", join(f.main, "relative-link"));
    f.jj(f.main, ["commit", "-m", "Fixture relative link"]);
    f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    f.jj(f.worker, ["rebase", "-r", "@", "-o", "alpha"]);
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land(["--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).not.toContain(
      "dirty main checkout overlaps",
    );
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "keep content\n",
    );
  });

  test("--keep-workspace preserves an accepted workspace for live migration checks", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land(["--keep-workspace"]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(f.worker)).toBe(true);
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "worker version\n",
    );
    expect(result.stdout.toString()).not.toContain("workspace: removed");
  });

  test("invocation in a worker checkout discovers the main checkout", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land([], {}, f.worker);
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "worker version\n",
    );
    expect(existsSync(f.worker)).toBe(false);
  });

  test(
    "formatters get only existing changed paths and run before commit",
    () => {
      const f = fixture();
      writeFileSync(join(f.worker, "added.ts"), "const added=1;\n");
      writeFileSync(join(f.worker, "added.md"), "# Added\n");
      writeFileSync(join(f.worker, "added.sh"), "echo added\n");
      writeFileSync(join(f.worker, "added.zsh"), 'print -r -- "${(q)HOME}"\n');
      rmSync(join(f.worker, "remove.md"));
      const result = f.land();
      expect(result.exitCode).toBe(0);
      expect(f.log().slice(0, 3)).toEqual([
        ["format", "bunx", "--bun", "oxfmt", "./added.ts"],
        ["format", "rumdl", "fmt", "./added.md"],
        [
          "format",
          "shfmt",
          "-w",
          "-ln",
          "bash",
          "-i",
          "2",
          "-ci",
          "-sr",
          "-bn",
          "-s",
          "./added.sh",
        ],
      ]);
      expect(f.log()[3]?.slice(0, 2)).toEqual(["run", "commit"]);
      expect(
        f
          .log()
          .filter((event) => event[0] === "format")
          .flat(),
      ).not.toContain("./added.zsh");
    },
    LAND_FORMATTER_TEST_TIMEOUT_MS,
  );

  test(
    "rename reports and commits both paths as exact argv; deploy follows push",
    () => {
      const f = fixture();
      renameSync(
        join(f.worker, "old name.txt"),
        join(f.worker, "new name.txt"),
      );
      writeFileSync(join(f.main, "keep.txt"), "unrelated dirty main\n");
      const result = f.land(["--smoke", "printf '%s' smoke"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain(
        '[land] paths: ok ["new name.txt","old name.txt"]',
      );
      expect(existsSync(join(f.main, "old name.txt"))).toBe(false);
      expect(readFileSync(join(f.main, "new name.txt"), "utf8")).toBe(
        "rename content\n",
      );
      expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
        "unrelated dirty main\n",
      );
      expect(f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"])).toBe(
        "keep content",
      );
      expect(f.log()[0]).toEqual([
        "run",
        "commit",
        "--",
        "-m",
        "Land test",
        "--push",
        "--",
        "new name.txt",
        "old name.txt",
      ]);
      expect(f.log()[1]).toEqual(["pushed"]);
      expect(f.log()[3]?.slice(0, 4)).toEqual([
        "ssh",
        "-o",
        "BatchMode=yes",
        "sol",
      ]);
      expect(f.log()[3]?.[4]).toContain(
        "cd ~/dotfiles && mise run pull && mise run deps",
      );
      expect(f.log()[3]?.[4]).toContain("smoke");
      expect(f.log()[3]?.[4]).toContain(
        "flock -w 600 ~/.cache/dotfiles-land.lock",
      );
      expect(f.log()[3]?.[4]).toContain("setsid sh -c");
      expect(f.log()[3]?.[4]).toContain("trap 'kill -TERM");
      expect(f.log()[4]?.[3]).toBe("r99-u26");
      expect(result.stdout.toString()).toContain(
        "[land] smoke: sol\nsmoke output for sol",
      );
      expect(result.stdout.toString()).toContain(
        "[land] smoke: r99-u26\nsmoke output for r99-u26",
      );
      expect(result.stdout.toString()).toContain(
        "[land] deploy: skipped r99-u24 (damaged)",
      );
      expect(
        f
          .log()
          .filter((event) => event[0] === "ssh")
          .map((event) => event[3]),
      ).toEqual(
        LAND_HOSTS.filter((host) => host.deploy).map((host) => host.alias),
      );
      expect(LAND_HOSTS.find((host) => host.alias === "r99-u24")?.deploy).toBe(
        false,
      );
      expect(result.stdout.toString()).toMatch(/summary: ok commit=[0-9a-f]+/u);
    },
    LAND_FORMATTER_TEST_TIMEOUT_MS,
  );

  test("a deletion is landed and committed", () => {
    const f = fixture();
    rmSync(join(f.worker, "delete.txt"));
    const result = f.land();
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(f.main, "delete.txt"))).toBe(false);
    expect(f.jj(f.main, ["file", "list", "-r", "alpha"])).not.toContain(
      "delete.txt",
    );
  });

  test("dirty main overlap is refused with its path before rebase or restore", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    writeFileSync(join(f.main, "keep.txt"), "main version\n");
    const result = f.land();
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain(
      '[land] preflight: FAIL dirty main checkout overlaps: ["keep.txt"]',
    );
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "main version\n",
    );
    expect(f.log()).toEqual([]);
  });

  test("commit refusal preserves hook output and stops before deploy", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land([], { LAND_FAIL_COMMIT: "1" });
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain("[land] commit: FAIL");
    expect(result.stderr.toString()).toContain(
      "hook:pre-commit refused: fixture refusal",
    );
    expect(f.log()).toHaveLength(1);
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "keep content\n",
    );
    expect(f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"])).toBe(
      "keep content",
    );
  });

  test("dry-run includes unsnapshotted changes and changes neither files nor metadata", () => {
    const f = fixture();
    writeFileSync(
      join(f.main, ".jj", "repo", "store", "git_target"),
      join(f.main, ".git"),
    );
    renameSync(join(f.worker, "old name.txt"), join(f.worker, "new name.txt"));
    rmSync(join(f.worker, "delete.txt"));
    writeFileSync(join(f.main, "keep.txt"), "unrelated dirty main\n");
    const before = [digest(f.main), digest(f.worker)];
    const result = f.land(["--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(
      '[land] paths: ok ["delete.txt","new name.txt","old name.txt"]',
    );
    expect([digest(f.main), digest(f.worker)]).toEqual(before);
    expect(f.log()).toEqual([]);
  });

  test("rebase conflict refuses before restore and deploy", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    f.jj(f.worker, ["status"]);
    writeFileSync(join(f.main, "keep.txt"), "alpha version\n");
    f.jj(f.main, ["commit", "-m", "advance alpha"]);
    f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    const result = f.land();
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain(
      "[land] rebase: FAIL rebase introduced conflicts",
    );
    expect(f.log()).toEqual([]);
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "alpha version\n",
    );
  });

  test("one failing host is reported while later hosts still deploy", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land(["--smoke", "printf smoke"], {
      LAND_FAIL_SSH: "sol",
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain(
      "[land] deploy: FAIL sol: remote command exited 7",
    );
    expect(result.stdout.toString()).toContain("[land] deploy: ok r99-u26");
    expect(result.stdout.toString()).toContain(
      "[land] smoke: sol\nsmoke output for sol",
    );
    expect(result.stdout.toString()).toContain(
      "[land] smoke: r99-u26\nsmoke output for r99-u26",
    );
    expect(result.stdout.toString()).toContain(
      'hosts={"sol":"FAIL remote command exited 7","r99-u26":"ok","r99-u24":"skipped (damaged)"}',
    );
    expect(f.log().filter((event) => event[0] === "ssh")).toHaveLength(2);
  });

  test(
    "an unreachable host is reported and later hosts still deploy",
    () => {
      const f = fixture();
      writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
      const result = f.land([], { LAND_UNREACHABLE_SSH: "sol" });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toContain(
        "[land] deploy: unreachable sol: ssh: connect to host sol failed",
      );
      expect(result.stdout.toString()).toContain("[land] deploy: ok r99-u26");
      expect(f.log().filter((event) => event[0] === "ssh")).toHaveLength(2);
    },
    LAND_FORMATTER_TEST_TIMEOUT_MS,
  );
});
