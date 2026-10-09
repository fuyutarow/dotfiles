import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPremises } from "../src/premises.ts";

const scratch = mkdtempSync(join(tmpdir(), "agx-premises-"));
const source = join(scratch, "src");
const docs = join(scratch, "docs");
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
mkdirSync(source);
mkdirSync(docs);
writeFileSync(join(source, "main.ts"), "export function routeWorker() {}\n");
writeFileSync(join(docs, "design.md"), "routeWorker is the entry point\n");

const fakeRg = (argv: string[], cwd: string) => {
  const patternAt = argv.indexOf("--glob");
  const glob = patternAt < 0 ? undefined : argv[patternAt + 1];
  const separator = argv.indexOf("--");
  const needle = argv[separator + 1] ?? "";
  const paths = ["src/main.ts", "docs/design.md"].filter(
    (path) => glob === undefined || new Bun.Glob(glob).match(path),
  );
  const matches = paths.filter((path) =>
    readFileSync(join(cwd, path), "utf8").includes(needle),
  );
  return { exitCode: matches.length === 0 ? 1 : 0, stdout: matches.join("\n") };
};

describe("premise checks", () => {
  test("present file and symbol premises pass", () => {
    expect(
      checkPremises(["file:src/main.ts", "symbol:routeWorker"], scratch, {
        runner: fakeRg,
      }),
    ).toEqual({ status: "ok" });
  });

  test("an absent file premise is reported", () => {
    expect(checkPremises(["file:src/missing.ts"], scratch)).toEqual({
      status: "missing",
      premises: ["file:src/missing.ts"],
    });
  });

  test("an absent symbol premise is reported", () => {
    expect(
      checkPremises(["symbol:missingFunction"], scratch, { runner: fakeRg }),
    ).toEqual({ status: "missing", premises: ["symbol:missingFunction"] });
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
    });
  });

  test("a timeout skips the check without refusing", () => {
    expect(
      checkPremises(["symbol:routeWorker"], scratch, {
        runner: () => ({ exitCode: null, stdout: "" }),
      }),
    ).toEqual({ status: "timeout" });
  });
});
