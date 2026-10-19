import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  chmodSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPremises } from "../src/premises.ts";
import { createTempTracker } from "./temp.ts";

const tempDirs = createTempTracker();
const registerTempDir = tempDirs.register;

const scratch = registerTempDir(
  mkdtempSync(join(tmpdir(), `agx-test-${process.pid}-premises-`)),
);
const source = join(scratch, "src");
const docs = join(scratch, "docs");
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
  tempDirs.assertRemoved();
});
mkdirSync(join(source, "next"), { recursive: true });
mkdirSync(docs);
writeFileSync(
  join(source, "next", "cli.ts"),
  "export function routeWorker() {}\n",
);
writeFileSync(join(docs, "design.md"), "routeWorker is the entry point\n");

const fakeRg = (argv: string[], cwd: string) => {
  const patternAt = argv.indexOf("--glob");
  const glob = patternAt < 0 ? undefined : argv[patternAt + 1];
  const separator = argv.indexOf("--");
  const needle = argv[separator + 1] ?? "";
  const paths = ["src/next/cli.ts", "docs/design.md"].filter(
    (path) => glob === undefined || new Bun.Glob(glob).match(path),
  );
  const matches = paths.filter((path) =>
    readFileSync(join(cwd, path), "utf8").includes(needle),
  );
  return { exitCode: matches.length === 0 ? 1 : 0, output: matches.join("\n") };
};

describe("premise checks", () => {
  test("every bounded jj premise read disables snapshots and operation reconciliation", () => {
    const calls: string[][] = [];
    const runner = (argv: string[]) => {
      calls.push(argv);
      return {
        exitCode: 0,
        output: argv.includes("bookmark") ? "main\n" : "root-or-revision",
      };
    };
    expect(
      checkPremises(["bookmark:main", "rev:@"], scratch, { runner }),
    ).toEqual({ status: "ok" });
    expect(calls).toHaveLength(3);
    for (const argv of calls) {
      expect(argv[0]).toBe("jj");
      expect(argv).toContain("--ignore-working-copy");
      expect(argv).toContain("--at-operation=@");
    }
  });
  test("present file and symbol premises pass", () => {
    expect(
      checkPremises(["file:src/next/cli.ts", "symbol:routeWorker"], scratch, {
        runner: fakeRg,
      }),
    ).toEqual({ status: "ok" });
  });

  test("an absent file premise is reported", () => {
    expect(checkPremises(["file:src/missing.ts"], scratch)).toEqual({
      status: "missing",
      premises: ["file:src/missing.ts"],
      details: ["file:src/missing.ts: file does not exist"],
    });
  });

  test("an absent symbol premise is reported", () => {
    expect(
      checkPremises(["symbol:missingFunction"], scratch, { runner: fakeRg }),
    ).toEqual({
      status: "missing",
      premises: ["symbol:missingFunction"],
      details: ["symbol:missingFunction: no matching text"],
    });
  });

  test("a symbol glob restricts the search", () => {
    expect(
      checkPremises(["symbol:routeWorker@src/**"], scratch, {
        runner: fakeRg,
      }),
    ).toEqual({ status: "ok" });
    expect(
      checkPremises(["symbol:routeWorker@tests/**"], scratch, {
        runner: fakeRg,
      }),
    ).toEqual({
      status: "missing",
      premises: ["symbol:routeWorker@tests/**"],
      details: ["symbol:routeWorker@tests/**: no matching text"],
    });
  });

  const withFakeTools = (
    tools: Record<string, string>,
    run: (
      runner: (
        argv: string[],
        cwd: string,
        timeoutMs: number,
      ) => { exitCode: number | null; output: string },
    ) => void,
  ): void => {
    const bin = join(scratch, "fake-bin");
    mkdirSync(bin, { recursive: true });
    for (const [name, script] of Object.entries(tools)) {
      const path = join(bin, name);
      writeFileSync(path, `#!/bin/sh\n${script}\n`);
      chmodSync(path, 0o755);
    }
    const oldPath = process.env.PATH;
    process.env.PATH = `${bin}:${oldPath ?? ""}`;
    using _restorePath = {
      [Symbol.dispose]: () => {
        if (oldPath === undefined) delete process.env.PATH;
        else process.env.PATH = oldPath;
      },
    };
    run((argv, cwd, timeoutMs) => {
      const command = argv.filter(
        (arg) => arg !== "--ignore-working-copy" && arg !== "--at-operation=@",
      );
      const result = Bun.spawnSync(
        ["sh", "-c", 'exec "$@"', "agx-test", ...command],
        {
          cwd,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env },
          timeout: Math.max(1, Math.floor(timeoutMs)),
        },
      );
      return {
        exitCode: result.exitCode,
        output: `${result.stdout.toString()}${result.stderr.toString()}`,
      };
    });
  };

  test("bookmark, task, and rev premises pass or refuse using fake PATH tools", () => {
    withFakeTools(
      {
        jj: 'if [ "$1" = root ]; then echo fake-root; exit 0; fi\nif [ "$1" = bookmark ]; then\n  if [ "$4" != "-T" ]; then echo "human bookmark output"; echo "  multiline description"; exit 0; fi\n  echo "main"; echo "release@origin"; echo "wip-u26-headroom: qzmvvrst 0a83339d wip(u26): ..."; echo "  description continuation"; echo "  final description line"; exit 0\nfi\nif [ "$1" = log ] && [ "$3" = @ ]; then echo abc123; exit 0; fi\necho "No revisions match" >&2\nexit 1',
        mise: `echo '[{"name":"land"},{"name":"check"}]'`,
      },
      (runner) => {
        expect(
          checkPremises(["bookmark:main", "bookmark:release@origin"], scratch, {
            runner,
          }),
        ).toEqual({ status: "ok" });
        expect(checkPremises(["task:land"], scratch, { runner })).toEqual({
          status: "ok",
        });
        expect(checkPremises(["rev:@"], scratch, { runner })).toEqual({
          status: "ok",
        });
        expect(
          checkPremises(["bookmark:unknown@origin"], scratch, { runner }),
        ).toEqual({
          status: "missing",
          premises: ["bookmark:unknown@origin"],
          details: [
            "bookmark:unknown@origin: wip-u26-headroom: qzmvvrst 0a83339d wip(u26): ...\ndescription continuation\nfinal description line",
          ],
        });
        expect(checkPremises(["task:missing"], scratch, { runner })).toEqual({
          status: "missing",
          premises: ["task:missing"],
          details: ['task:missing: [{"name":"land"},{"name":"check"}]'],
        });
        expect(checkPremises(["rev:missing()"], scratch, { runner })).toEqual({
          status: "missing",
          premises: ["rev:missing()"],
          details: ["rev:missing(): No revisions match"],
        });
      },
    );
  });

  test("a timeout skips the check without refusing", () => {
    expect(
      checkPremises(["symbol:routeWorker"], scratch, {
        runner: () => ({ exitCode: null, output: "" }),
      }),
    ).toEqual({ status: "timeout" });
  });
});
