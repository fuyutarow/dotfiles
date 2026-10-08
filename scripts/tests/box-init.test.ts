// bun test for scripts/box-init.ts — argv parsing end to end (spawned) and the step plan as a pure
// function. No ssh anywhere: the plan only NAMES the commands.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildPlan, logged, parseOpts, sq } from "../box-init.ts";

const SCRIPT = join(import.meta.dir, "..", "box-init.ts");

function spawn(args: string[]): { code: number; out: string; err: string } {
  const p = Bun.spawnSync(["bun", SCRIPT, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: p.exitCode,
    out: p.stdout.toString(),
    err: p.stderr.toString(),
  };
}

const names = (o: Parameters<typeof buildPlan>[0]): string[] =>
  buildPlan(o).map((s) => s.name);

describe("argv", () => {
  test("--help exits 0 and shows the usage", () => {
    const r = spawn(["--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("--root-host");
    expect(r.out).toContain("--repo");
  });

  test("missing alias exits 2", () => {
    const r = spawn([]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("alias");
  });

  test("prototype-sensitive flags exit 2", () => {
    for (const flag of ["--__proto__", "--constructor"]) {
      const r = spawn([flag]);
      expect(r.code).toBe(2);
      expect(r.err).toContain(`--${flag.slice(2)}`);
    }
  });

  test("--root-host without --root-port exits 2", () => {
    expect(spawn(["box", "--root-host", "h"]).code).toBe(2);
  });

  test("a malformed --repo exits 2", () => {
    expect(spawn(["box", "--repo", "not-owner-name"]).code).toBe(2);
  });

  test("parseOpts reads every flag and dedupes repos", () => {
    expect(
      parseOpts([
        "box",
        "--root-host",
        "ssh1.vast.ai",
        "--root-port",
        "2222",
        "--gh",
        "--repo",
        "a/x",
        "--repo",
        "a/x",
        "--repo",
        "b/y",
      ]),
    ).toEqual({
      alias: "box",
      rootHost: "ssh1.vast.ai",
      rootPort: "2222",
      gh: true,
      repos: ["a/x", "b/y"],
    });
  });

  test("an alias that could be a flag or carry shell is refused", () => {
    expect(Object.hasOwn(parseOpts(["a;b"]), "error")).toBe(true);
  });
});

describe("plan", () => {
  test("bare alias: reach, then doctor:remote", () => {
    expect(names({ alias: "box", gh: false, repos: [] })).toEqual([
      "reach",
      "codex host",
      "doctor:remote",
    ]);
  });

  test("--gh adds the gh step right after reach", () => {
    expect(names({ alias: "box", gh: true, repos: [] })).toEqual([
      "reach",
      "gh",
      "codex host",
      "doctor:remote",
    ]);
  });

  test("each repo runs clone, mise, jj, setup, doctor in order, before doctor:remote", () => {
    expect(names({ alias: "box", gh: true, repos: ["o/a", "o/b"] })).toEqual([
      "reach",
      "gh",
      "codex host",
      "clone a",
      "mise a",
      "jj a",
      "setup a",
      "doctor a",
      "clone b",
      "mise b",
      "jj b",
      "setup b",
      "doctor b",
      "doctor:remote",
    ]);
  });

  test("reach bootstraps as root only when root-host and root-port are given", () => {
    const without = buildPlan({ alias: "box", gh: false, repos: [] })[0];
    expect(without?.act).toBeUndefined();
    const withRoot = buildPlan({
      alias: "box",
      rootHost: "h",
      rootPort: "22",
      gh: false,
      repos: [],
    })[0];
    expect(withRoot?.probe?.argv.slice(-2)).toEqual(["box", "true"]);
    expect(withRoot?.act?.argv).toContain("root@h");
    expect(withRoot?.act?.argv).toContain("-p");
    expect(withRoot?.act?.argv.at(-1)).toContain("bootstrap-linux.sh | bash");
    expect(withRoot?.act?.argv.at(-1)).toContain("bash -s -- --rented");
  });

  test("the gh token travels on stdin only: no argv carries it", () => {
    const gh = buildPlan({ alias: "box", gh: true, repos: [] })[1];
    expect(gh?.act?.stdinFrom).toEqual(["gh", "auth", "token"]);
    expect(gh?.act?.argv.join(" ")).toContain("gh auth login --with-token");
    expect(gh?.probe?.argv.at(-1)).toContain("gh auth status");
  });

  test("repo steps: clone is guarded, jj prefers setup:jj else colocates, slow steps log", () => {
    const plan = buildPlan({ alias: "box", gh: false, repos: ["o/a"] });
    const by = (n: string): string =>
      plan.find((s) => s.name === n)?.act?.argv.at(-1) ?? "";
    expect(
      plan.find((s) => s.name === "clone a")?.probe?.argv.at(-1),
    ).toContain("test -d $HOME/Workspace/a/.git");
    expect(by("clone a")).toContain("gh repo clone o/a$HOME/Workspace/a");
    expect(by("mise a")).toContain("mise trust && mise install");
    const jj = by("jj a");
    expect(jj.indexOf("mise run setup:jj")).toBeGreaterThan(-1);
    expect(jj.indexOf("mise run setup:jj")).toBeLessThan(
      jj.indexOf("jj git init --colocate"),
    );
    expect(jj).toContain("jj bookmark track alpha@origin");
    expect(by("setup a")).toContain("mise run setup");
    expect(by("doctor a")).toContain("mise run doctor");
    for (const n of ["mise a", "jj a", "setup a", "doctor a"])
      expect(by(n)).toContain("~/.cache/box-init".replace("~", "$HOME"));
    expect(plan.find((s) => s.name === "mise a")?.timeoutMs).toBe(25 * 60_000);
  });

  test("doctor:remote runs doctor-remote.ts on the alias", () => {
    const last = buildPlan({ alias: "box", gh: false, repos: [] }).at(-1);
    expect(last?.act?.argv[0]).toBe("bun");
    expect(last?.act?.argv.at(-2)).toContain("doctor-remote.ts");
    expect(last?.act?.argv.at(-1)).toBe("box");
    expect(last?.humanOnly).toEqual(["agents"]);
  });

  test("codex host declaration validates first and runs the rented declaration step", () => {
    const step = buildPlan({ alias: "box", gh: false, repos: [] }).find(
      (item) => item.name === "codex host",
    );
    expect(step?.probe?.argv.at(-1)).toContain("--check");
    expect(step?.act?.argv.at(-1)).toContain(
      "codex-host-bootstrap.ts --rented",
    );
    expect(step?.log).toBe("codex-host");
  });
});

describe("quoting", () => {
  test("sq survives an embedded quote", () => {
    expect(sq("a'b")).toBe(`'a'\\''b'`);
  });

  test("logged wraps in a box-side timeout shorter than the local bound", () => {
    const s = logged("x", "echo hi", 60_000);
    expect(s).toContain("timeout -k 10 55 sh -c 'echo hi'");
    expect(s).toContain("exit $rc");
  });
});
