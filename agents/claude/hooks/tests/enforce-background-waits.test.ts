import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backgroundReason,
  FOREGROUND_MAX_MS,
  isSmallFileViewer,
  unwaitedJobs,
} from "../enforce-background-waits.ts";
import {
  commandKey,
  recordEnd,
  recordStart,
  stepKeys,
} from "../bash-durations.ts";
import { AGX_WORKER_ENV } from "../../../../tools/shared/src/worker-env.ts";
import { parseJson, strAt } from "../../../hooks/narrow.ts";

// enforce-background-waits: a long or waiting foreground Bash call is denied with the resend to make.

const HOOK = join(import.meta.dir, "..", "enforce-background-waits.ts");
const decide = (tool_input: Record<string, unknown>): string => {
  const env = { ...process.env };
  delete env[AGX_WORKER_ENV];
  const p = Bun.spawnSync(["bun", HOOK], {
    stdin: new Blob([JSON.stringify({ tool_name: "Bash", tool_input })]),
    env,
    timeout: 30_000,
  });
  return p.stdout.toString();
};

describe("backgroundReason", () => {
  test("the default foreground bound and a short call stay in front", () => {
    expect(
      backgroundReason({ command: "ls", timeout: FOREGROUND_MAX_MS }),
    ).toBeUndefined();
    expect(backgroundReason({ command: "bun test x.test.ts" })).toBeUndefined();
  });

  test("a timeout above the bound must go to the background", () => {
    expect(
      backgroundReason({ command: "mise run commit", timeout: 600_000 }),
    ).toContain("600 s timeout");
  });

  test("a wait loop must go to the background, whatever its timeout", () => {
    expect(
      backgroundReason({ command: "until [ -e done ]; do sleep 10; done" }),
    ).toContain("wait loop");
    expect(
      backgroundReason({
        command: "while pgrep x >/dev/null\ndo sleep 5\ndone",
      }),
    ).toContain("wait loop");
  });

  test("run_in_background: true is always allowed", () => {
    expect(
      backgroundReason({
        command: "until x; do sleep 1; done",
        timeout: 600_000,
        run_in_background: true,
      }),
    ).toBeUndefined();
  });

  test("words that merely contain the keywords are not loops", () => {
    expect(
      backgroundReason({ command: "echo untilsleep; cat sleepy.txt" }),
    ).toBeUndefined();
  });
});

describe("as a hook", () => {
  test("denies with the resend to make", () => {
    const out = decide({ command: "until [ -e f ]; do sleep 5; done" });
    expect(out).toContain('"permissionDecision":"deny"');
    expect(out).toContain("run_in_background: true");
  });

  test("says nothing about a short foreground call", () => {
    expect(decide({ command: "ls" })).toBe("");
  });
});

describe("small-file viewer history exemption", () => {
  test("compound reads inside a temporary repo remain subject to history from subdirectories", () => {
    const root = realpathSync(mkdtempSync("/tmp/coordinator-repo-"));
    const sub = join(root, "src");
    mkdirSync(sub);
    mkdirSync(join(root, ".cocoindex_code"));
    writeFileSync(
      join(root, ".cocoindex_code/settings.yml"),
      "include_patterns: []\n",
    );
    const file = join(root, "output");
    writeFileSync(file, "small\n");
    expect(isSmallFileViewer(`cat ${file}; head ${file}`, sub)).toBe(false);
    expect(isSmallFileViewer(`cat ${file}`, sub)).toBe(true); // Preserve the original single-file exemption.
  });

  test("coordinator variables, home paths and compound reads ignore slow history; other commands retain it", () => {
    const root = realpathSync(mkdtempSync("/tmp/coordinator-reads-"));
    const home = join(root, "home");
    const scratch = join(root, "scratchpad");
    const receipts = join(home, ".local/state/agx/worker-receipts");
    const projectFiles = join(home, ".claude/projects/session");
    const dir = join(root, "history");
    for (const path of [scratch, receipts, projectFiles, dir])
      mkdirSync(path, { recursive: true });
    for (const file of [
      join(scratch, "router-x.err"),
      join(scratch, "x.output"),
      join(scratch, "y.output"),
      join(receipts, "r.json"),
      join(projectFiles, "x.json"),
    ])
      writeFileSync(file, '{"x":1}\n');
    writeFileSync(join(scratch, "large"), "x".repeat(1024 * 1024));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: home,
      S: scratch,
      CLAUDE_BASH_DURATIONS_DIR: dir,
    };
    delete env[AGX_WORKER_ENV];
    const allowed = [
      "tail -n 3 $S/router-x.err",
      'head -c 600 "${S}/router-x.err"',
      `cat ${scratch}/x.output; tail -c 600 ${scratch}/y.output`,
      "jq -r .x ~/.local/state/agx/worker-receipts/r.json",
      "cat ~/.claude/projects/session/x.json && echo done && tail -n 3 $S/router-x.err",
      'echo "$S"; cat $S/x.output',
      "wc $S/x.output || head $S/y.output",
      "sed -n 1p $S/x.output | cat $S/y.output",
    ];
    const denied = [
      "sleep 200; cat x",
      "grep -r foo .",
      "rg foo",
      "find . -name x",
      "cat $S/large",
      "tail -f $S/x.output",
      "tail -F $S/x.output",
      "tail -nf 3 $S/x.output",
      "cat $UNKNOWN/x",
      "cat $S/x.output; bun test",
      "cat $S/x.output &",
      "sed -n -i 1p $S/x.output",
    ];
    const keys = new Set(
      [...allowed, ...denied].flatMap((command) =>
        [commandKey(command)].concat(stepKeys(command)),
      ),
    );
    for (const key of keys) {
      if (key === undefined) continue;
      recordStart(dir, key, key, 0);
      recordEnd(dir, key, 7000);
    }
    for (const command of allowed)
      expect({ command, output: decideWithEnv(command, env) }).toEqual({
        command,
        output: "",
      });
    for (const command of denied) {
      const output = decideWithEnv(command, env);
      expect(output).toContain('"permissionDecision":"deny"');
      expect(output).toContain("Rewrite command:");
      expect(output).toContain("run_in_background: true");
    }
  });

  test("allows small read-only viewers regardless of a slow command history", () => {
    const root = mkdtempSync(join(tmpdir(), "background-viewers-"));
    const dir = join(root, "history");
    const file = join(root, "small.json");
    writeFileSync(file, '{"ok":true}\n');
    mkdirSync(dir, { recursive: true });
    for (const [i, ms] of [7000, 7000].entries()) {
      recordStart(dir, `cat-${i}`, "cat", 0);
      recordEnd(dir, `cat-${i}`, ms);
    }
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CLAUDE_BASH_DURATIONS_DIR: dir,
    };
    delete env[AGX_WORKER_ENV];
    for (const key of ["cat", "tail -n", "wc", "jq", "sed -n"]) {
      recordStart(dir, `${key}-slow`, key, 0);
      recordEnd(dir, `${key}-slow`, 7000);
    }
    for (const command of [
      `cat ${file}`,
      `tail -n 5 ${file}`,
      `wc ${file}`,
      `jq . ${file}`,
      `sed -n 1,5p ${file}`,
    ]) {
      expect(isSmallFileViewer(command)).toBe(true);
      expect(decideWithEnv(command, env)).toBe("");
    }
  });

  test("does not exempt a 5 MiB file, tail -f, or a pipeline from slow history", () => {
    const root = mkdtempSync(join(tmpdir(), "background-viewers-slow-"));
    const dir = join(root, "history");
    const large = join(root, "large.txt");
    const small = join(root, "small.txt");
    writeFileSync(large, "x".repeat(5 * 1024 * 1024));
    writeFileSync(small, "small\n");
    mkdirSync(dir, { recursive: true });
    for (const [key, ms] of [
      ["cat", 7000],
      ["tail -f", 7000],
      ["cat -c", 7000],
    ] as const) {
      recordStart(dir, key, key, 0);
      recordEnd(dir, key, ms);
    }
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CLAUDE_BASH_DURATIONS_DIR: dir,
    };
    delete env[AGX_WORKER_ENV];
    expect(decideWithEnv(`cat ${large}`, env)).toContain(
      '"permissionDecision":"deny"',
    );
    expect(decideWithEnv(`tail -f ${small}`, env)).toContain(
      '"permissionDecision":"deny"',
    );
    expect(decideWithEnv(`cat ${small} | wc -c`, env)).toContain(
      '"permissionDecision":"deny"',
    );
  });
});

function decideWithEnv(command: string, env: NodeJS.ProcessEnv): string {
  const p = Bun.spawnSync(["bun", HOOK], {
    stdin: new Blob([
      JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    ]),
    env,
    timeout: 30_000,
  });
  return p.stdout.toString();
}

// A shell-level `&` inside a call that already has run_in_background:true outlives the observed
// outer shell (firedancer coordinator, 2026-10-08): denied unless the script waits for the job.
describe("unwaitedJobs", () => {
  const INCIDENT =
    "agx dispatch --resume run-123 --prompt-file /tmp/brief.md > /tmp/out.log 2>&1 &";

  test.each([
    ["the incident command", INCIDENT],
    ["a bare trailing &", "sleep 30 &"],
    ["& then a newline, no wait", "sleep 30 &\necho started"],
    ["a job that is waited only BEFORE it starts", "wait\nsleep 30 &"],
    ["a job in a subshell, waited outside it", "(sleep 30 &); wait"],
    ["a job in a brace group, never waited", "{ sleep 30 & }"],
    ["the unwaited one of several", "a & wait\nb &"],
    ["a job in a nested shell string", "bash -c 'sleep 30 &'"],
    ["a job in a heredoc fed to a shell", "bash <<EOF\nsleep 30 &\nEOF"],
    ["a job in eval", `eval "sleep 30 &"`],
    ["a job after &&", "cd /tmp && sleep 30 &"],
  ])("denies %s", (_name, command) => {
    const why = unwaitedJobs(command);
    expect(why).toContain("run_in_background: true");
    expect(why).toContain("drop the `&`");
    expect(why).toContain("`a & b & wait`");
    expect(why).toContain("systemd-run --user --unit=<name>");
  });

  test.each([
    ["a & b & wait", "a & b & wait"],
    ["& followed by a matching wait", "sleep 3 &\nwait"],
    ["wait with a pid", "sleep 3 &\npid=$!\nwait $pid"],
    ["wait inside the subshell", "(sleep 3 & wait)"],
    ["wait after a brace group", "{ sleep 3 & }; wait"],
    ["wait inside then", "sleep 3 & if true; then wait; fi"],
    ["&&", "cd /tmp && ls && echo ok"],
    ["&> redirect", "make &>/tmp/log"],
    ["&>> redirect", "make &>>/tmp/log"],
    [">&2", "echo oops >&2"],
    ["2>&1", "make 2>&1 | tail -5"],
    ["<&3", "cat <&3"],
    ["|&", "make |& tail -5"],
    ["& in single quotes", "echo 'a & b'"],
    ["& in double quotes", `echo "a & b"`],
    ["an escaped &", "echo a \\& b"],
    ["& in a comment", "ls # run it & forget"],
    ["& in a heredoc body", "cat <<EOF\nsleep 30 &\nEOF"],
    ["& in a quoted-delimiter heredoc", "cat <<'EOF'\nsleep 30 &\nEOF"],
    ["& in a tab-stripped heredoc", "cat <<-EOF\n\tsleep 30 &\n\tEOF"],
    ["& in a parameter expansion", 'x=a; echo "${x//a/&}" ${x//a/&}'],
    ["& in arithmetic", "echo $((3 & 1))"],
    ["& in a string for another program", "ssh host 'sleep 30 &'"],
    ["& in a nested string that waits", "bash -c 'a & b & wait'"],
    ["no & at all", "ls -la"],
  ])("allows %s", (_name, command) => {
    expect(unwaitedJobs(command)).toBeUndefined();
  });
});

describe("shell-level & as a hook", () => {
  const INCIDENT =
    "agx dispatch --resume run-123 --prompt-file /tmp/brief.md > /tmp/out.log 2>&1 &";

  test.each([
    INCIDENT,
    "sleep 30 &\necho started",
    "(sleep 30 &); wait",
    "bash -c 'sleep 30 &'",
    "bash <<EOF\nsleep 30 &\nEOF",
    'eval "sleep 30 &"',
  ])("prints an executable repair that passes for %s", (command) => {
    const out = decide({ command, run_in_background: true });
    const reason =
      strAt(parseJson(out), "hookSpecificOutput", "permissionDecisionReason") ??
      "";
    const match = /Rewrite command: ("(?:\\.|[^"\\])*") with/u.exec(reason);
    const rewritten = parseJson(match?.[1] ?? "");
    expect(typeof rewritten).toBe("string");
    if (typeof rewritten !== "string") return;
    expect(unwaitedJobs(rewritten)).toBeUndefined();
    expect(decide({ command: rewritten, run_in_background: true })).toBe("");
  });

  test("denies the incident command in a backgrounded call, naming the rule and the fixes", () => {
    const out = decide({ command: INCIDENT, run_in_background: true });
    expect(out).toContain('"permissionDecision":"deny"');
    expect(out).toContain("background-waits:");
    expect(out).toContain("drop the `&`");
    expect(out).toContain("a & b & wait");
    expect(out).toContain("systemd-run --user --unit=<name>");
  });

  test("allows `a & b & wait` in a backgrounded call", () => {
    expect(decide({ command: "a & b & wait", run_in_background: true })).toBe(
      "",
    );
  });

  test("allows && and 2>&1 in a backgrounded call", () => {
    expect(
      decide({ command: "cd /tmp && ls 2>&1 | head", run_in_background: true }),
    ).toBe("");
  });

  test("the rule is for backgrounded calls: a foreground & is left to the other rules", () => {
    expect(decide({ command: "sleep 1 &" })).toBe("");
  });
});
