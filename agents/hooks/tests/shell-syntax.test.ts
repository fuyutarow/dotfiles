import { describe, expect, test } from "bun:test";
import { effective, parseShell, redirectWritePaths } from "../shell-syntax.ts";

const names = (command: string): string[] => {
  const parsed = parseShell(command, "/w");
  expect(parsed).toBeDefined();
  return (parsed?.commands ?? []).flatMap((c) => {
    const e = effective(c);
    return e === undefined ? [] : [e.name];
  });
};

const e = (command: string): ReturnType<typeof effective> => {
  const c = parseShell(command)?.commands[0];
  return c === undefined ? undefined : effective(c);
};

describe("parseShell", () => {
  test("splits at every command boundary", () => {
    expect(names("a && b || c; d | e & f\ng")).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
    ]);
  });

  test("resolves quotes and escapes into words", () => {
    const c = parseShell(`echo 'a b' "c \\"d\\"" e\\ f $'g'`)?.commands[0];
    expect(c?.words).toEqual(["echo", "a b", 'c "d"', "e f", "g"]);
    expect(c?.dynamic).toBe(false);
  });

  test("a quoted `at` is a word, not a command", () => {
    expect(names(`echo "meet at noon" 'at now' | cat`)).toEqual([
      "echo",
      "cat",
    ]);
  });

  test("heredoc bodies are data, quoted or not, <<- strips tabs", () => {
    for (const marker of ["EOF", "'EOF'", '"EOF"']) {
      const parsed = parseShell(
        `cat <<${marker}\nat now\ntimeout 110 mise run x\nEOF\nls`,
      );
      expect(parsed?.commands.map((c) => c.words[0])).toEqual(["cat", "ls"]);
      expect(parsed?.commands[0]?.heredocs).toEqual([
        "at now\ntimeout 110 mise run x",
      ]);
    }
    const dash = parseShell("cat <<-EOF\n\tat now\n\tEOF\n");
    expect(dash?.commands[0]?.heredocs).toEqual(["at now"]);
  });

  test("an unquoted heredoc still RUNS its $(…) and backticks", () => {
    expect(names("cat <<EOF\nx $(rm -rf y) `nohup z`\nEOF")).toEqual([
      "cat",
      "rm",
      "nohup",
    ]);
    expect(names("cat <<'EOF'\n$(rm -rf y)\nEOF")).toEqual(["cat"]);
  });

  test("a heredoc into a shell, sh -c and eval are scripts", () => {
    expect(names("bash <<EOF\nnohup x &\nEOF")).toContain("nohup");
    expect(names(`sh -c 'setsid y'`)).toContain("setsid");
    expect(names(`eval "disown"`)).toContain("disown");
    expect(names(`sh -c 'echo nohup'`)).not.toContain("nohup");
  });

  test("substitutions and process substitutions are commands", () => {
    expect(names("echo $(a; b) `c` <(d)").toSorted()).toEqual([
      "a",
      "b",
      "c",
      "d",
      "echo",
    ]);
  });

  test("cd moves the cwd of what follows, only for what follows", () => {
    const parsed = parseShell("cd /x && ls; (cd y; pwd); cd ~/z\nwhoami", "/w");
    const cwdOf = (name: string) =>
      parsed?.commands.find((c) => c.words[0] === name)?.cwd;
    expect(cwdOf("ls")).toBe("/x");
    expect(cwdOf("pwd")).toBe("/x/y");
    expect(cwdOf("whoami")).toMatch(/\/z$/u);
    expect(parseShell("cd /x | ls", "/w")?.commands[1]?.cwd).toBe("/w");
    expect(parseShell("echo 'cd /x' <<EOF\ncd /y\nEOF", "/w")?.endCwd).toBe(
      "/w",
    );
  });

  test("redirect targets resolve against the cwd of their command", () => {
    const parsed = parseShell(
      "cd /x && echo a > rel.txt 2>&1 && cat b >> /abs",
      "/w",
    );
    expect(
      parsed === undefined ? undefined : redirectWritePaths(parsed),
    ).toEqual(["/x/rel.txt", "/abs"]);
  });

  test("effective strips wrappers and reduces the name to a basename", () => {
    expect(e("sudo -u x /usr/bin/setsid --wait y")).toEqual({
      name: "setsid",
      args: ["--wait", "y"],
    });
    expect(e("A=1 env B=2 timeout -k 5 110 mise run test")).toEqual({
      name: "mise",
      args: ["run", "test"],
    });
    expect(e("uv run --quiet python3 -c x")?.name).toBe("python3");
  });

  test("while/until are leading words; for headers are data", () => {
    const c = parseShell("while pgrep -f x; do sleep 1; done")?.commands;
    expect(c?.[0]?.leading).toEqual(["while"]);
    expect(
      parseShell("for at in a b; do echo; done")?.commands[0]?.header,
    ).toBe(true);
  });

  test("anything unsure is undefined, never a guess", () => {
    for (const bad of [
      `echo 'x`,
      `echo "x`,
      "echo $(x",
      "cat <<EOF\nno end",
      "echo `x",
      "case x in a) b;; esac",
      "f() { x; }",
      "a=(1 2)",
      "echo )",
      "echo x\\",
      "echo ${x",
    ])
      expect(parseShell(bad)).toBeUndefined();
  });
});
