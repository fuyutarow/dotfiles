import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import type { Config } from "../../src/model.ts";
import type { Context } from "../../src/targets/index.ts";

/** A throwaway world: bare git remote + one jj store (`repo`, pushed `main`) + secondary workspaces beside it. */
export class World {
  readonly root = realpathSync(mkdtempSync(join(tmpdir(), "reclaim-ws-")));
  readonly repo = join(this.root, "repo");
  readonly remote = join(this.root, "remote.git");
  private readonly previousConfig = process.env.JJ_CONFIG;
  readonly env = {
    ...process.env,
    HOME: join(this.root, "home"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(this.root, "gitconfig"),
    JJ_CONFIG: join(this.root, "jj-config.toml"),
  };

  constructor(files: Record<string, string> = {}) {
    mkdirSync(this.env.HOME);
    // Every jj run in this process, including the target's, reads only this config.
    writeFileSync(
      this.env.JJ_CONFIG,
      'user.name = "t"\nuser.email = "t@example.com"\n',
    );
    process.env.JJ_CONFIG = this.env.JJ_CONFIG;
    this.sh(this.root, "git", "init", "-q", "--bare", this.remote);
    this.sh(this.root, "jj", "git", "init", this.repo);
    for (const [name, text] of Object.entries({ a: "a\n", ...files }))
      writeFileSync(join(this.repo, name), text);
    this.sh(this.repo, "jj", "commit", "-m", "base");
    this.sh(this.repo, "jj", "bookmark", "create", "main", "-r", "@-");
    this.sh(this.repo, "jj", "git", "remote", "add", "origin", this.remote);
    this.sh(this.repo, "jj", "git", "push", "-b", "main");
  }

  sh(cwd: string, ...argv: string[]): string {
    const run = Bun.spawnSync(argv, {
      cwd,
      env: this.env,
      stdin: "ignore",
      timeout: 10_000,
    });
    assert.equal(
      run.exitCode,
      0,
      `${argv.join(" ")} (cwd ${cwd}) failed: ${run.stderr.toString()}`,
    );
    return run.stdout.toString();
  }
  jj(cwd: string, ...args: string[]): string {
    return this.sh(cwd, "jj", "--color=never", ...args);
  }
  /** A secondary workspace on the pushed base, as an agent session would hold it. */
  add(name: string, path = join(this.root, name)): string {
    this.jj(this.repo, "workspace", "add", "--name", name, path);
    return path;
  }
  write(dir: string, file: string, text: string) {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  commitId(rev: string, dir = this.repo): string {
    return this.jj(
      dir,
      "log",
      "--no-graph",
      "--ignore-working-copy",
      "-r",
      rev,
      "-T",
      "commit_id",
    ).trim();
  }
  workspaceNames(): string[] {
    return this.jj(this.repo, "workspace", "list", "-T", 'name ++ "\\n"')
      .split("\n")
      .filter((l) => l !== "");
  }
  config(extra: Partial<Config> = {}): Config {
    return {
      repo_roots: [this.root],
      repos: [],
      scratch_roots: [],
      delete_roots: [],
      regenerable_ignored: ["target", "node_modules"],
      session_grace_hours: 24,
      ignore_unreadable_procs: ["sshd"],
      ...extra,
    };
  }
  context(
    mode: "plan" | "run",
    extra: Partial<Config> = {},
    recovery: unknown[] = [],
  ): Context {
    const procDir = join(this.root, "protected-proc");
    mkdirSync(procDir, { recursive: true });
    return {
      mode,
      procDir,
      config: this.config(extra),
      log: () => {},
      recordRecovery: (_candidate, r) => {
        recovery.push(r);
      },
    };
  }
  dispose() {
    if (this.previousConfig === undefined) delete process.env.JJ_CONFIG;
    else process.env.JJ_CONFIG = this.previousConfig;
    rmSync(this.root, { recursive: true, force: true });
  }
}
