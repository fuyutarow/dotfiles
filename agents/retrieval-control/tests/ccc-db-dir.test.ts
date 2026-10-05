import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import type { Result } from "neverthrow";
import { MAPPING_ENV, parseMapping, resolveDbDir } from "../ccc-db-dir.ts";

const env = (value: string | undefined) => ({ [MAPPING_ENV]: value });
const valueOrError = (result: Result<string, Error>) =>
  result.match(
    (value) => value,
    (error) => `ERROR: ${error.message}`,
  );

describe("resolveDbDir mirrors ccc's settings.resolve_db_dir", () => {
  test("unset or blank mapping keeps the DB in <root>/.cocoindex_code", () => {
    expect(valueOrError(resolveDbDir("/p/proj", env(undefined)))).toBe(
      "/p/proj/.cocoindex_code",
    );
    expect(valueOrError(resolveDbDir("/p/proj", env("  ")))).toBe(
      "/p/proj/.cocoindex_code",
    );
  });

  test("a root under the source maps to target/<relative path>", () => {
    expect(
      valueOrError(resolveDbDir("/h/Workspace/fd", env("/h=/h/.cache/db"))),
    ).toBe("/h/.cache/db/Workspace/fd");
  });

  test("a root equal to the source maps to the target itself", () => {
    expect(valueOrError(resolveDbDir("/h/proj", env("/h/proj=/db")))).toBe(
      "/db",
    );
  });

  test("a sibling sharing a name prefix is not under the source", () => {
    expect(valueOrError(resolveDbDir("/h2/proj", env("/h=/db")))).toBe(
      "/h2/proj/.cocoindex_code",
    );
  });

  test("the first matching entry wins", () => {
    expect(
      valueOrError(resolveDbDir("/h/a/b", env("/h/a=/first,/h=/second"))),
    ).toBe("/first/b");
  });

  test("a nested project maps INSIDE its parent's DB dir (the hazard callers must respect)", () => {
    const m = env("/h=/db");
    expect(
      valueOrError(resolveDbDir("/h/fd/.claude/worktrees/x", m)).startsWith(
        `${valueOrError(resolveDbDir("/h/fd", m))}/`,
      ),
    ).toBe(true);
  });

  test("symlinks resolve on both sides, as Python's Path.resolve() does", () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "ccc-db-dir-")));
    mkdirSync(join(base, "real", "proj"), { recursive: true });
    symlinkSync(join(base, "real"), join(base, "link"));
    expect(
      valueOrError(
        resolveDbDir(
          join(base, "link", "proj"),
          env(`${join(base, "real")}=/db`),
        ),
      ),
    ).toBe("/db/proj");
  });

  test("malformed entries return an error, as ccc does", () => {
    const first = parseMapping("/a").match(
      () => "unexpected success",
      (error) => error.message,
    );
    const second = parseMapping("rel=/db").match(
      () => "unexpected success",
      (error) => error.message,
    );
    const third = parseMapping("/a=rel").match(
      () => "unexpected success",
      (error) => error.message,
    );
    expect(first).toContain("expected 'source=target'");
    expect(second).toContain("must be absolute");
    expect(third).toContain("must be absolute");
  });
});
