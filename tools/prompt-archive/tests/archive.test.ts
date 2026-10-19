import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { archiveHistories } from "../src/archive.ts";

const archivedRowsSchema = jsonOf(z.array(z.record(z.string(), z.unknown())));

const roots: string[] = [];

async function fixture(): Promise<{
  root: string;
  claude: string;
  codex: string;
  data: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "prompt-archive-test-"));
  roots.push(root);
  return {
    root,
    claude: join(root, "claude-history.jsonl"),
    codex: join(root, "codex-history.jsonl"),
    data: join(root, "data"),
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function runArchive(options: Parameters<typeof archiveHistories>[0]) {
  const result = await archiveHistories(options);
  expect(result.ok).toBe(true);
  return result.ok ? result.value : { archived: -1, skipped: -1 };
}

describe("prompt archive", () => {
  test("appends Claude and Codex records to their UTC month files with vendor labels", async () => {
    const paths = await fixture();
    await writeFile(
      paths.claude,
      `${JSON.stringify({ display: "synthetic Claude input", pastedContents: null, timestamp: 1792368000000, project: "/synthetic", sessionId: "claude-session" })}\n`,
    );
    await writeFile(
      paths.codex,
      `${JSON.stringify({ session_id: "codex-session", ts: 1792368000, text: "synthetic Codex input" })}\n`,
    );

    const result = await runArchive({
      claudeHistory: paths.claude,
      codexHistory: paths.codex,
      dataHome: paths.data,
    });
    const rowsText = (
      await readFile(join(paths.data, "prompts", "2026-10.jsonl"), "utf8")
    )
      .trim()
      .split("\n");
    const decodedRows = archivedRowsSchema.safeParse(`[${rowsText.join(",")}]`);
    expect(decodedRows.success).toBe(true);
    const rows = decodedRows.success ? decodedRows.data : [];

    expect(result).toEqual({ archived: 2, skipped: 0 });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.vendor)).toEqual(["claude", "codex"]);
    expect(rows[0]).toMatchObject({
      display: "synthetic Claude input",
      sessionId: "claude-session",
    });
    expect(rows[1]).toMatchObject({
      text: "synthetic Codex input",
      session_id: "codex-session",
    });
  });

  test("is idempotent across reruns and collapses duplicate source entries", async () => {
    const paths = await fixture();
    const record = {
      session_id: "session",
      ts: 1792368000,
      text: "synthetic repeated input",
    };
    await writeFile(paths.claude, "");
    await writeFile(
      paths.codex,
      `${JSON.stringify(record)}\n${JSON.stringify(record)}\n`,
    );

    expect(
      await runArchive({
        claudeHistory: paths.claude,
        codexHistory: paths.codex,
        dataHome: paths.data,
      }),
    ).toEqual({ archived: 1, skipped: 0 });
    expect(
      await runArchive({
        claudeHistory: paths.claude,
        codexHistory: paths.codex,
        dataHome: paths.data,
      }),
    ).toEqual({ archived: 0, skipped: 0 });
    const archive = await readFile(
      join(paths.data, "prompts", "2026-10.jsonl"),
      "utf8",
    );
    expect(archive.trim().split("\n")).toHaveLength(1);
    expect(archive).toContain("synthetic repeated input");
  });

  test("skips invalid records without exposing their text in result fields", async () => {
    const paths = await fixture();
    await writeFile(
      paths.claude,
      `${JSON.stringify({ display: "synthetic malformed input" })}\nnot-json\n`,
    );
    await writeFile(paths.codex, "");

    expect(
      await runArchive({
        claudeHistory: paths.claude,
        codexHistory: paths.codex,
        dataHome: paths.data,
      }),
    ).toEqual({ archived: 0, skipped: 2 });
  });
});
