import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { decisionOf, runHook, tempDir } from "./helpers.ts";

const HOOK = "enforce-search-route.ts";

function registerProject(): string {
  const dir = tempDir("search-route-project-");
  mkdirSync(join(dir, ".cocoindex_code"), { recursive: true });
  writeFileSync(
    join(dir, ".cocoindex_code", "settings.yml"),
    "include_patterns: []\n",
  );
  return dir;
}

function cccPath(): string {
  const dir = tempDir("search-route-bin-");
  const path = join(dir, "ccc");
  writeFileSync(path, "#!/bin/sh\nexit 0\n");
  chmodSync(path, 0o755);
  return dir;
}

const grepPayload = (cwd: string) => ({
  tool_name: "Grep",
  tool_input: { pattern: "needle", path: cwd },
  cwd,
});

const bashPayload = (cwd: string, command: string) => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd,
});

const withCcc = () => ({
  PATH: `${cccPath()}:${process.env["PATH"] ?? ""}`,
});

test("stdin filters accept command output and external logs while protecting project files", () => {
  const project = registerProject();
  const outside = tempDir("search-route-external-log-");
  const log = join(outside, "x.log");
  writeFileSync(log, "TIMING\n");
  const cases: ReadonlyArray<readonly [string, string | undefined]> = [
    ["mise run leaderboard:view -- --all | grep -F -e X | head", undefined],
    ["ssh host 'cmd' | grep -e A -e B", undefined],
    [`cat ${log} | grep -F -e TIMING`, undefined],
    ["jj workspace list | grep -ivcnE -e A -e B", undefined],
    ["grep -r X packages-2611", "deny"],
    ["rg X", "deny"],
    ["cat src/file.ts | grep X", "deny"],
    ["printf x | grep -e X src/file.ts", "deny"],
    ["cat src/file.ts | grep -F -e X", "deny"],
  ];
  for (const [command, expected] of cases) {
    expect({
      command,
      decision: decisionOf(
        runHook(HOOK, bashPayload(project, command), withCcc()).stdout,
      )?.permissionDecision,
    }).toEqual({ command, decision: expected });
  }
});

test("recorded coordinator search commands retain their allow/deny envelopes", () => {
  const project = registerProject();
  const scratch = tempDir("search-route-coordinator-");
  const log = join(scratch, "coordinator.log");
  writeFileSync(log, "WARN route check\nERROR route check\n");
  const commands: ReadonlyArray<readonly [string, string | undefined]> = [
    [`grep -E 'WARN|ERROR' ${log}`, undefined],
    [`awk '/WARN|ERROR/ { print $0 }' ${log}`, undefined],
    ["find . -type f -name '*.ts'", "deny"],
    ["rr regex 'needle' | awk '{ print $1 }'", undefined],
    ['rg -n "needle" src/', "deny"],
    ["git grep -n 'needle'", "deny"],
    ["fd needle .", "deny"],
    ["tree .", "deny"],
    ["ccc grep 'needle'", "deny"],
    ["grep -rn foo .", "deny"],
  ];
  for (const [command, expected] of commands) {
    const result = runHook(HOOK, bashPayload(project, command), withCcc());
    expect({
      command,
      code: result.code,
      decision: decisionOf(result.stdout)?.permissionDecision,
    }).toEqual({ command, code: 0, decision: expected });
  }
});

/** 統治宣言(`rnd.config.json`)を持ち、かつ ccc 登録もされた repo。 */
function governedAndRegistered(): string {
  const dir = registerProject();
  writeFileSync(join(dir, "rnd.config.json"), "{}\n");
  return dir;
}

describe("**統治下では黙って抜ける**(2026-09-01、発注者の裁定)", () => {
  // WHY: この hook は Grep/Bash を deny し、腕を `repo-retrieve.ts`(886 行)へ誘導していた。
  //   その 886 行は統治宣言を持たない repo に在り、統治下の repo の関門からは見えず、
  //   protocol の動詞としても登録されていない。**repo は見えないものを統治できない。**
  //   腕は二つの判定に挟まれて詰まった——統治側はこの deny を解けず、deny が案内する経路は
  //   NO_INDEX を返し続けた。
  //
  //   **一つの行為に、権威ある判定は一つ。**統治を宣言した repo では、その repo の関門が
  //   何を許すかを決める。統治外では従来どおり——この試験の他の 11 件がそれを守る。

  test("統治宣言のある repo では Grep を deny しない", () => {
    const dir = governedAndRegistered();
    expect(
      decisionOf(runHook(HOOK, grepPayload(dir), withCcc()).stdout),
    ).toBeNull();
  });

  test("統治宣言のある repo では生の rg も deny しない", () => {
    const dir = governedAndRegistered();
    expect(
      decisionOf(
        runHook(HOOK, bashPayload(dir, "rg needle"), withCcc()).stdout,
      ),
    ).toBeNull();
  });

  test("**統治宣言が無ければ従来どおり deny**——免除は宣言に紐づく", () => {
    const dir = registerProject(); // rnd.config.json を置かない
    expect(
      decisionOf(runHook(HOOK, bashPayload(dir, "rg needle"), withCcc()).stdout)
        ?.permissionDecision,
    ).toBe("deny");
  });
});

describe("enforce-search-route", () => {
  test("allows coordinator variables and compounds, retaining repository protection and concrete repairs", () => {
    const project = registerProject();
    const scratch = tempDir("coordinator-scratch-");
    const home = tempDir("coordinator-home-");
    const env = { ...withCcc(), S: scratch, HOME: home };
    for (const command of [
      "tail -n 3 $S/router-x.err",
      "grep foo $S/router-x.err",
      'rg foo "${S}/router-x.err"',
      "cat /private/tmp/coordinator/tasks/x.output; tail -c 600 /private/tmp/coordinator/y.output",
      "jq -r .x ~/.local/state/agx/worker-receipts/r.json",
      "grep foo $S/x; rg foo ${S}/y",
      "grep foo $S/x && rg foo ${S}/y || echo missing",
      "rr files; grep foo $S/x",
      "grep foo /tmp/coordinator/$UNKNOWN/x | head",
      "grep foo ~/.claude/projects/$UNKNOWN/x",
      "grep foo ~/.local/state/agx/$UNKNOWN/x",
    ]) {
      expect({
        command,
        decision: decisionOf(
          runHook(HOOK, bashPayload(project, command), env).stdout,
        ),
      }).toEqual({ command, decision: null });
    }
    symlinkSync(project, join(scratch, "repo"));
    for (const command of [
      "grep -r foo .",
      "rg foo",
      "find . -name x",
      "fd foo .",
      "tree .",
      "grep foo $UNKNOWN/x",
      "rg foo $S/x; rg foo .",
      "grep -r foo $S/repo",
      "grep foo '$S/x'",
      "rg foo /tmp/$UNKNOWN/../../repo",
      "grep -r foo ${REPO}",
      `S=${project}; grep -r foo $S`,
    ]) {
      const result = runHook(HOOK, bashPayload(project, command), {
        ...env,
        REPO: project,
      });
      const decision = decisionOf(result.stdout);
      expect({ command, decision: decision?.permissionDecision }).toEqual({
        command,
        decision: "deny",
      });
      expect(decision?.permissionDecisionReason).toContain("Rewrite:");
      expect(decision?.permissionDecisionReason).toMatch(
        /(?:rr|repo-retrieve|bun \S*repo-retrieve\.ts) (?:regex|files) '(?:foo|\*)'/u,
      );
    }
  }, 15_000);

  test("allows one project output file but denies project source-file searches", () => {
    const project = registerProject();
    writeFileSync(join(project, "one.log"), "foo\n");
    writeFileSync(join(project, "a.txt"), "foo a\n");
    writeFileSync(join(project, "b.txt"), "foo b\n");
    for (const command of ["grep -e foo one.log"]) {
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      expect({
        command,
        decision: decisionOf(result.stdout)?.permissionDecision,
      }).toEqual({
        command,
        decision: undefined,
      });
    }
    const sourceSearch = runHook(
      HOOK,
      bashPayload(project, "rg foo a.txt b.txt"),
      withCcc(),
    );
    expect(decisionOf(sourceSearch.stdout)?.permissionDecision).toBe("deny");
  });

  test("denies built-in Grep in an operational ccc project", () => {
    const result = runHook(HOOK, grepPayload(registerProject()), withCcc());
    const decision = decisionOf(result.stdout);

    expect(result.code).toBe(0);
    expect(decision?.permissionDecision).toBe("deny");
    // The shortest installed name of this router (rr, repo-retrieve), else the long path; routes by
    // intent name.
    expect(decision?.permissionDecisionReason).toMatch(
      /(?:^|[\s:;])(?:rr|repo-retrieve|bun \S*repo-retrieve\.ts) about '/u,
    );
    expect(decision?.permissionDecisionReason).toContain(" text '");
    expect(decision?.permissionDecisionReason).toContain(" exists '");
    expect(decision?.permissionDecisionReason).toContain("do not bypass");
  });

  test("denies direct rg, grep, git grep, and filtered find", () => {
    for (const command of [
      'rg -n "needle" src/',
      '/usr/bin/rg -n "needle" src/',
      'env LC_ALL=C rg -n "needle" src/',
      '/usr/bin/env LC_ALL=C rg -n "needle" src/',
      'timeout 10s rg -n "needle" src/',
      'echo ready && grep -n "needle" src/a.ts',
      'git grep -n "needle"',
      'git -C . grep -n "needle"',
      "repo-retrieve files --path src | xargs rg needle",
      "sh -c 'rg -n needle src'",
      'find src -iname "*needle*"',
      "fd needle",
      "tree",
      "find .",
      "/usr/bin/find -name x",
    ]) {
      const project = registerProject();
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      expect({
        command,
        decision: decisionOf(result.stdout)?.permissionDecision,
      }).toEqual({ command, decision: "deny" });
    }
  }, 20_000);

  test("detects a simple cd into a registered project", () => {
    const project = registerProject();
    const outside = tempDir("search-route-outside-");
    const result = runHook(
      HOOK,
      bashPayload(outside, `cd "${project}" && rg -n "needle" .`),
      withCcc(),
    );

    expect(decisionOf(result.stdout)?.permissionDecision).toBe("deny");
  });

  test("allows only the classified router and non-search ccc operations", () => {
    const project = registerProject();
    for (const command of [
      "repo-retrieve literal --query needle",
      "bun ~/.claude/hooks/repo-retrieve.ts exhaustive --query needle",
      "ccc status",
      "ccc daemon status",
      "ccc doctor",
      "rr index",
      "rr index --plan",
    ]) {
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe("");
    }
  });

  test("allows one stream-only grep after a classified route", () => {
    const project = registerProject();
    for (const command of [
      "repo-retrieve literal --query needle | grep -F -- 'wanted line'",
      "repo-retrieve concept --project /tmp/corpus --query needle | rg -- 'wanted'",
      "bun ~/.claude/hooks/repo-retrieve.ts files --glob '*.md' | grep -- 'README'",
    ]) {
      expect(
        decisionOf(
          runHook(HOOK, bashPayload(project, command), withCcc()).stdout,
        ),
      ).toBeNull();
    }
  });

  test("ignores search words in ticket text and heredoc bodies", () => {
    const project = registerProject();
    for (const command of [
      `agx worker run /tmp/ticket.md --sandbox read-only`,
      `agx-worker run /tmp/ticket-with-grep.md`,
      `cat <<'TICKET'\nThe ticket asks to use grep and rg.\nTICKET`,
      `printf '%s' 'grep is mentioned in this ticket'`,
    ]) {
      expect(
        decisionOf(
          runHook(HOOK, bashPayload(project, command), withCcc()).stdout,
        ),
      ).toBeNull();
    }
  });

  test("allows grep and rg stdin filters after non-search producers", () => {
    const project = registerProject();
    for (const command of [
      "rr text 'needle' | grep -F -e X",
      "jj workspace list | awk '{print $1}'",
      "agx worker dispatch /tmp/ticket.md | grep run-123",
      "agx-worker dispatch /tmp/ticket.md 2>&1 | grep -E 'a|b'",
      "agx worker run /tmp/ticket.md --json | jq -r .x | rg -i y | head",
      "journalctl -u service | rg -v x | head",
      "bun test agents/hooks/tests | rg -v 'pass' | head -n 20",
      "jj log --limit 10 | rg -E -v -i 'foo|bar'",
      "printf '%s\\n' a b | grep -e a -e b",
    ]) {
      expect(
        decisionOf(
          runHook(HOOK, bashPayload(project, command), withCcc()).stdout,
        ),
      ).toBeNull();
    }
  });

  test("allows the live PreToolUse reproduction through downstream text stages", () => {
    const project = registerProject();
    for (const command of [
      "agx worker run /tmp/ticket.md --json 2>&1 | grep -e '^VERIFY' -e 'result='",
      "cd /home/fuyu/dotfiles && agx worker dispatch /tmp/ticket.md 2>&1 | grep -e A -e B",
      "agx-worker dispatch /tmp/ticket.md 2>&1 | grep -e A -e B | cut -c1-150",
      "cd /home/fuyu/dotfiles && agx worker run /tmp/ticket.md --json 2>&1 | grep -e '^VERIFY' -e 'result=' | cut -c1-150",
      "rr text x 2>&1 | grep -F -e y | head",
      "agx worker dispatch /tmp/ticket.md | grep x | tail -n 5",
      "agx-worker dispatch /tmp/ticket.md | grep x | sort -r | uniq -c | wc -l",
      "agx worker run /tmp/ticket.md | grep x | tr a-z A-Z",
      "agx worker run /tmp/ticket.md --json | jq -r '.name'",
      "agx worker run /tmp/ticket.md --json | jq --arg key value '.name + $key'",
      "agx worker dispatch /tmp/ticket.md | awk '{print $1}'",
      "agx worker run /tmp/ticket.md | sed -n '1p'",
      "agx worker run /tmp/ticket.md | sed -e '1p' -e '2p'",
    ]) {
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      expect({ command, decision: decisionOf(result.stdout) }).toEqual({
        command,
        decision: null,
      });
    }
  });

  test("keeps file readers, recursive search, and xargs outside stream-filter exemptions", () => {
    const project = registerProject();
    for (const command of [
      "cat agents/hooks/enforce-search-route.ts | grep foo",
      "bat agents/hooks/enforce-search-route.ts | rg foo",
      "sed -n '1,5p' agents/hooks/enforce-search-route.ts | grep foo",
      "awk '{print}' agents/hooks/enforce-search-route.ts | rg foo",
      "find . -type f | grep foo",
      "ls -laR . | rg foo",
      "agx worker run /tmp/ticket.md | grep -f agents/hooks/patterns.txt",
      "grep -r foo .",
      "agx worker run /tmp/ticket.md | grep foo | xargs cat",
    ]) {
      expect({
        command,
        decision: decisionOf(
          runHook(HOOK, bashPayload(project, command), withCcc()).stdout,
        )?.permissionDecision,
      }).toEqual({ command, decision: "deny" });
    }
  });

  test("the concrete rewrite from a denial is accepted by this hook", () => {
    const project = registerProject();
    const denied = runHook(HOOK, bashPayload(project, "rg needle"), withCcc());
    const reason = decisionOf(denied.stdout)?.permissionDecisionReason ?? "";
    const rewrite = /Rewrite: ([^.]*(?:'[^']*'|\S+)[^.]*)\./u.exec(reason)?.[1];
    expect(rewrite).toBeDefined();
    if (rewrite === undefined) return;
    expect(
      decisionOf(
        runHook(HOOK, bashPayload(project, rewrite), withCcc()).stdout,
      ),
    ).toBeNull();
  });

  test("a stream filter cannot search a file or hide a second raw search", () => {
    const project = registerProject();
    for (const command of [
      "repo-retrieve literal --query needle | grep -F -- wanted file.txt",
      "repo-retrieve files | grep -- wanted | rg raw",
      "repo-retrieve literal --query needle ; grep -- wanted file.txt",
      "repo-retrieve literal --query needle | grep -- wanted < file.txt",
      "agx worker run /tmp/ticket.md | grep foo | cut -c1-150 file.txt",
    ]) {
      expect(
        decisionOf(
          runHook(HOOK, bashPayload(project, command), withCcc()).stdout,
        )?.permissionDecision,
      ).toBe("deny");
    }
  });

  test("denies direct ccc search and grep because they bypass router guards", () => {
    const project = registerProject();
    for (const command of [
      "ccc search 'semantic query' --limit 8 --refresh",
      "ccc grep 'foo(\\(ARGS*\\))'",
      "/usr/local/bin/ccc search 'semantic query'",
      "env CCC_LOG=warn ccc search 'semantic query'",
      "timeout 20s ccc grep 'foo(\\(ARGS*\\))'",
    ]) {
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      const decision = decisionOf(result.stdout);

      expect(decision?.permissionDecision).toBe("deny");
      expect(decision?.permissionDecisionReason).toMatch(
        /(?:rr|repo-retrieve|bun \S*repo-retrieve\.ts) about '/u,
      );
    }
  });

  test("denies ccc index entry points through the live Bash hook and directs to rr index", () => {
    const project = registerProject();
    for (const command of [
      "ccc index",
      "ccc init",
      "ccc mcp",
      "ccc init && ccc index",
      "COCOINDEX_CODE_LOG=warn ccc index",
      "env COCOINDEX_CODE_LOG=warn ccc index",
      "/usr/bin/env COCOINDEX_CODE_LOG=warn ccc init",
      "timeout 20s ccc index",
      "uvx ccc index",
      "uvx --from cocoindex-code ccc index",
      "uv run uvx --from cocoindex-code ccc index",
      "python -m cocoindex_code.cli index",
      "python3 -m cocoindex_code",
      "sh -c 'ccc index'",
      'bash -c "uvx ccc index"',
    ]) {
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      const decision = decisionOf(result.stdout);
      expect({
        command,
        code: result.code,
        decision: decision?.permissionDecision,
        reason: decision?.permissionDecisionReason,
      }).toMatchObject({
        command,
        code: 0,
        decision: "deny",
      });
      expect(decision?.permissionDecisionReason).toContain("rr index");
    }
  });

  test("denies the human-only rr admission override at the agent hook entry point", () => {
    const project = registerProject();
    for (const command of [
      "rr index --accept-plan",
      "rr index --accept-plan=true",
      "repo-retrieve index --accept-plan",
      "env RR_LOG=debug rr index --accept-plan",
      "timeout 20s repo-retrieve index --accept-plan",
      "uv run rr index --accept-plan",
      "bunx rr index --accept-plan",
      "bun ~/.claude/hooks/repo-retrieve.ts index --accept-plan",
      "sh -c 'rr index --accept-plan'",
      'bash -c "env RR_LOG=debug rr index --accept-plan"',
    ]) {
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      const decision = decisionOf(result.stdout);
      expect({
        command,
        code: result.code,
        decision: decision?.permissionDecision,
      }).toEqual({ command, code: 0, decision: "deny" });
      expect(decision?.permissionDecisionReason).toContain("rr index");
      expect(decision?.permissionDecisionReason).toContain("--accept-plan");
    }
  });

  test("denies raw ccc index even before ccc registration or outside a governed project", () => {
    const cwd = tempDir("search-route-unregistered-index-");
    const result = runHook(HOOK, bashPayload(cwd, "ccc index"), withCcc());
    const decision = decisionOf(result.stdout);
    expect({
      code: result.code,
      decision: decision?.permissionDecision,
    }).toEqual({ code: 0, decision: "deny" });
    expect(decision?.permissionDecisionReason).toContain("rr index");
  });

  test("denies obvious inline-runtime reimplementations of repository search", () => {
    for (const command of [
      "python3 - <<'PY'\nimport os\nfor root, dirs, files in os.walk('.'):\n  pass\nPY",
      'python -c "from pathlib import Path; print(list(Path(\\".\\").rglob(\\"*.md\\")))"',
      'node -e "import(\\"node:fs\\").then(({ readdirSync }) => readdirSync(\\".\\", { recursive: true }))"',
      'bun -e "for await (const path of new Bun.Glob(\\"**/*.ts\\").scan(\\".\\")) console.log(path)"',
    ]) {
      const project = registerProject();
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      const decision = decisionOf(result.stdout);

      expect(decision?.permissionDecision).toBe("deny");
      expect(decision?.permissionDecisionReason).toContain("do not bypass");
    }
  });

  test("allows normal runtime and test commands", () => {
    const project = registerProject();
    for (const command of [
      "uv run pytest tests/unit",
      "bun test agents/claude/hooks",
      "node scripts/build.mjs",
      "python scripts/migrate.py",
      'python -c "print(2 + 2)"',
      'python -c "from pathlib import Path; print(Path(\\"package.json\\").read_text())"',
    ]) {
      const result = runHook(HOOK, bashPayload(project, command), withCcc());
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe("");
    }
  });

  test("allows non-search commands that merely mention grep", () => {
    const project = registerProject();
    const result = runHook(
      HOOK,
      bashPayload(project, 'echo "use rg or grep in the documentation"'),
      withCcc(),
    );

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("allows raw search outside a registered project", () => {
    const outside = tempDir("search-route-unregistered-");
    const result = runHook(
      HOOK,
      bashPayload(outside, 'rg -n "needle" .'),
      withCcc(),
    );

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("allows searches whose file targets are outside a registered project", () => {
    // Keep every path used by this test under one throwaway root. In particular, do not use
    // /tmp vs /private/tmp: those have different layouts across macOS and Linux, and a host
    // project above one of those paths could change the ancestor walk's answer.
    const fixture = tempDir("search-route-targets-");
    const home = join(fixture, "home");
    const bin = join(fixture, "bin");
    const project = join(fixture, "project");
    const outside = join(fixture, "outside");
    const processCwd = join(fixture, "cwd");
    mkdirSync(home, { recursive: true });
    mkdirSync(bin, { recursive: true });
    mkdirSync(project, { recursive: true });
    mkdirSync(outside, { recursive: true });
    mkdirSync(processCwd, { recursive: true });
    mkdirSync(join(project, ".cocoindex_code"), { recursive: true });
    writeFileSync(
      join(project, ".cocoindex_code", "settings.yml"),
      "include_patterns: []\n",
    );
    writeFileSync(join(bin, "ccc"), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, "ccc"), 0o755);
    const env = { HOME: home, PATH: bin };
    const output = join(outside, "out.txt");
    const cases: ReadonlyArray<readonly [string, string]> = [
      [project, `grep needle ${output}`],
      [project, "grep needle ~/.local/state/agx/worker-receipts/receipt.json"],
      [project, `find ${outside} -name out.txt`],
      [project, "ls | grep foo"],
      [project, "grep -r foo ."],
      [project, "grep foo agents/"],
      [outside, `rg foo ${join(project, "scripts")}`],
    ];

    for (const [searchCwd, command] of cases) {
      const result = runHook(
        HOOK,
        bashPayload(searchCwd, command),
        env,
        processCwd,
      );
      const expected =
        command === "grep -r foo ." ||
        command === "grep foo agents/" ||
        command.startsWith("rg foo ")
          ? "deny"
          : undefined;
      expect({
        command,
        decision: decisionOf(result.stdout)?.permissionDecision,
      }).toEqual({ command, decision: expected });
    }
  }, 20_000);

  test("allows external logs and single output files but denies project source searches", () => {
    const fixture = tempDir("search-route-log-scope-");
    const project = join(fixture, "project");
    const outside = join(fixture, "scratch");
    const home = join(fixture, "home");
    mkdirSync(join(project, ".cocoindex_code"), { recursive: true });
    mkdirSync(outside, { recursive: true });
    mkdirSync(join(home, ".codex", "sessions"), { recursive: true });
    writeFileSync(
      join(project, ".cocoindex_code", "settings.yml"),
      "include_patterns: []\n",
    );
    const landLog = join(outside, "land.log");
    const sessionLog = join(home, ".codex", "sessions", "rollout.jsonl");
    const projectOutput = join(project, "result.jsonl");
    const source = join(project, "scripts", "land.ts");
    mkdirSync(join(project, "scripts"), { recursive: true });
    for (const path of [landLog, sessionLog, projectOutput, source])
      writeFileSync(path, "statusline\n");
    const env = { ...withCcc(), HOME: home };
    const cases: ReadonlyArray<readonly [string, string, string | undefined]> =
      [
        [project, `grep -E '^[[]land[]]' ${landLog}`, undefined],
        [project, `awk '/x/' ${sessionLog}`, undefined],
        [project, `grep statusline ${projectOutput}`, undefined],
        [project, `grep foo ${source}`, "deny"],
        [project, "grep -rn foo .", "deny"],
      ];
    for (const [cwd, command, expected] of cases) {
      const result = runHook(HOOK, bashPayload(cwd, command), env);
      expect({
        command,
        decision: decisionOf(result.stdout)?.permissionDecision,
      }).toEqual({ command, decision: expected });
    }
  });

  test("allows raw search when ccc is unavailable", () => {
    const project = registerProject();
    const emptyHome = tempDir("search-route-home-");
    const result = runHook(HOOK, grepPayload(project), {
      HOME: emptyHome,
      PATH: "",
    });

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("Bash cwd pointing at a nonexistent directory still climbs to a registered project", () => {
    // statSync(start) throws (ENOENT) inside registeredProject/governedRepo; the `catch`
    // fallback (`current = start`) must let the ancestor walk still find the real project,
    // not spuriously trip the outer try/main "failing closed" catch in this file.
    const project = registerProject();
    const missing = join(project, "does-not-exist", "deeper");
    const result = runHook(HOOK, bashPayload(missing, "rg needle"), withCcc());
    const decision = decisionOf(result.stdout);

    expect(result.code).toBe(0);
    expect(decision?.permissionDecision).toBe("deny");
    expect(decision?.permissionDecisionReason).not.toContain("failing closed");
  });

  test("Grep tool_input.path pointing at a nonexistent directory still climbs to a registered project", () => {
    const project = registerProject();
    const missing = join(project, "does-not-exist");
    const result = runHook(HOOK, grepPayload(missing), withCcc());
    const decision = decisionOf(result.stdout);

    expect(result.code).toBe(0);
    expect(decision?.permissionDecision).toBe("deny");
    expect(decision?.permissionDecisionReason).not.toContain("failing closed");
  });

  test("Grep tool_input.path resolves relative to cwd into a registered project", () => {
    const project = registerProject();
    const result = runHook(
      HOOK,
      {
        tool_name: "Grep",
        tool_input: { pattern: "needle", path: "src" },
        cwd: project,
      },
      withCcc(),
    );

    expect(decisionOf(result.stdout)?.permissionDecision).toBe("deny");
  });

  test("malformed input fails closed", () => {
    const result = runHook(HOOK, "{not json", withCcc());
    const decision = decisionOf(result.stdout);

    expect(result.code).toBe(0);
    expect(decision?.permissionDecision).toBe("deny");
    expect(decision?.permissionDecisionReason).toContain("failing closed");
  });
});

describe("display filter over the router's stream (widened 2026-10-01)", () => {
  // The deny message recommended these; the gate used to reject 2>&1, -e, and a trailing head.
  const allowed = [
    "bun ~/.claude/hooks/repo-retrieve.ts battery -q a -q b -q c -p pkg --limit 8 2>&1 | grep -F -- 'File:' | head",
    "bun ~/.claude/hooks/repo-retrieve.ts battery -q a -q b -q c --limit 8 2>&1 | grep -F -e 'File:' | head -n 20",
    "repo-retrieve literal --query 'x' 2>&1 | rg -F -- 'File:'",
    "repo-retrieve definition --query 'x' | grep -F -- 'Ops'",
  ];
  const denied = [
    "repo-retrieve literal --query 'x' | grep -F -- 'y' pkg/file.jl",
    "repo-retrieve literal --query 'x' | grep -F -e 'y' | xargs cat",
    "repo-retrieve literal --query 'x' | grep -F -- 'y' > out.txt",
    "repo-retrieve literal --query 'x' | grep -F -- 'y' | head | grep z",
  ];
  for (const command of allowed) {
    test(`allows: ${command}`, () => {
      const r = runHook(
        HOOK,
        bashPayload(registerProject(), command),
        withCcc(),
      );
      expect(r.stdout.trim()).toBe("");
    });
  }
  for (const command of denied) {
    test(`denies: ${command}`, () => {
      const r = runHook(
        HOOK,
        bashPayload(registerProject(), command),
        withCcc(),
      );
      expect(decisionOf(r.stdout)?.permissionDecision).toBe("deny");
    });
  }
});
