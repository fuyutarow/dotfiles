import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import type { Result } from "neverthrow";
import { MAPPING_ENV, parseMapping, resolveDbDir } from "../src/ccc-db-dir.ts";

const env = (value: string | undefined) => ({ [MAPPING_ENV]: value });
const valueOrError = (result: Result<string, Error>) =>
  result.match(
    (value) => value,
    (error) => `ERROR: ${error.message}`,
  );

describe("resolveDbDir mirrors ccc's settings.resolve_db_dir", () => {
  test("unset or blank mapping keeps the DB in <root>/.cocoindex_code", async () => {
    expect(valueOrError(await resolveDbDir("/p/proj", env(undefined)))).toBe(
      "/p/proj/.cocoindex_code",
    );
    expect(valueOrError(await resolveDbDir("/p/proj", env("  ")))).toBe(
      "/p/proj/.cocoindex_code",
    );
  });

  test("a root under the source maps to target/<relative path>", async () => {
    expect(
      valueOrError(
        await resolveDbDir("/h/Workspace/fd", env("/h=/h/.cache/db")),
      ),
    ).toBe("/h/.cache/db/Workspace/fd");
  });

  test("a root equal to the source maps to the target itself", async () => {
    expect(
      valueOrError(await resolveDbDir("/h/proj", env("/h/proj=/db"))),
    ).toBe("/db");
  });

  test("a sibling sharing a name prefix is not under the source", async () => {
    expect(valueOrError(await resolveDbDir("/h2/proj", env("/h=/db")))).toBe(
      "/h2/proj/.cocoindex_code",
    );
  });

  test("the first matching entry wins", async () => {
    expect(
      valueOrError(await resolveDbDir("/h/a/b", env("/h/a=/first,/h=/second"))),
    ).toBe("/first/b");
  });

  test("a nested project maps INSIDE its parent's DB dir (the hazard callers must respect)", async () => {
    const m = env("/h=/db");
    expect(
      valueOrError(
        await resolveDbDir("/h/fd/.claude/worktrees/x", m),
      ).startsWith(`${valueOrError(await resolveDbDir("/h/fd", m))}/`),
    ).toBe(true);
  });

  test("symlinks resolve on both sides, as Python's Path.resolve() does", async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "ccc-db-dir-")));
    mkdirSync(join(base, "real", "proj"), { recursive: true });
    symlinkSync(join(base, "real"), join(base, "link"));
    expect(
      valueOrError(
        await resolveDbDir(
          join(base, "link", "proj"),
          env(`${join(base, "real")}=/db`),
        ),
      ),
    ).toBe("/db/proj");
  });

  test("malformed entries return an error, as ccc does", async () => {
    const first = (await parseMapping("/a")).match(
      () => "unexpected success",
      (error) => error.message,
    );
    const second = (await parseMapping("rel=/db")).match(
      () => "unexpected success",
      (error) => error.message,
    );
    const third = (await parseMapping("/a=rel")).match(
      () => "unexpected success",
      (error) => error.message,
    );
    expect(first).toContain("expected 'source=target'");
    expect(second).toContain("must be absolute");
    expect(third).toContain("must be absolute");
  });
});
