import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

const script = join(import.meta.dir, "../land.ts");
const temporary: string[] = [];
const eventsSchema = jsonOf(z.array(z.string()));
afterEach(() => {
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true });
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
appendFileSync(process.env.LAND_EVENTS, JSON.stringify(['ssh', ...process.argv.slice(2)]) + '\\n');
process.exit(process.env.LAND_FAIL_SSH === '1' ? 7 : 0);\n`,
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
  ) {
    return Bun.spawnSync(
      [
        process.execPath,
        script,
        "dotfiles-arm-worker",
        "-m",
        "Land test",
        "--hosts",
        "sol,r99-u26",
        ...args,
      ],
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
  test("invocation in a worker checkout discovers the main checkout", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land([], {}, f.worker);
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "worker version\n",
    );
  });

  test("formatters get only existing changed paths and run before commit", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "added.ts"), "const added=1;\n");
    writeFileSync(join(f.worker, "added.md"), "# Added\n");
    writeFileSync(join(f.worker, "added.sh"), "echo added\n");
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
  });

  test("rename reports and commits both paths as exact argv; deploy follows push", () => {
    const f = fixture();
    renameSync(join(f.worker, "old name.txt"), join(f.worker, "new name.txt"));
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
    expect(f.log()[2]).toEqual([
      "ssh",
      "-o",
      "BatchMode=yes",
      "sol",
      "cd ~/dotfiles && mise run pull && mise run deps && ( printf '%s' smoke\n)",
    ]);
    expect(f.log()[3]?.[3]).toBe("r99-u26");
    expect(result.stdout.toString()).toMatch(/summary: ok commit=[0-9a-f]+/u);
  });

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

  test("host failure reports its host and skips subsequent hosts", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land([], { LAND_FAIL_SSH: "1" });
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain("[land] deploy: FAIL sol:");
    expect(result.stdout.toString()).toContain(
      'hosts={"sol":"FAIL","r99-u26":"pending"}',
    );
    expect(f.log()).toHaveLength(3);
  });
});
