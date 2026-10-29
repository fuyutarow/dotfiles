import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
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
  test("backfills every month and ignores transcript messages", async () => {
    const paths = await fixture();
    const claude = [
      {
        display: "older typed input",
        pastedContents: { "1": { content: "typed paste" } },
        timestamp: "2026-08-31T23:59:59Z",
        sessionId: "c",
      },
      {
        display: "newer typed input",
        timestamp: "2026-10-01T00:00:00Z",
        sessionId: "c",
      },
      { role: "assistant", content: "generated answer" },
      { type: "user", message: { role: "user", content: "injected context" } },
    ];
    const codex = [
      {
        text: "September typed input",
        ts: "2026-09-01T00:00:00Z",
        session_id: "x",
      },
      {
        text: "October typed input",
        ts: "2026-10-01T00:00:00Z",
        session_id: "x",
      },
      {
        type: "response_item",
        payload: { role: "assistant", content: "generated answer" },
      },
    ];
    await writeFile(
      paths.claude,
      claude.map((row) => JSON.stringify(row)).join("\n"),
    );
    await writeFile(
      paths.codex,
      codex.map((row) => JSON.stringify(row)).join("\n"),
    );
    const options = {
      claudeHistory: paths.claude,
      codexHistory: paths.codex,
      dataHome: paths.data,
    };
    expect(await runArchive(options)).toEqual({ archived: 4, skipped: 3 });
    for (const [month, count] of [
      ["2026-08", 1],
      ["2026-09", 1],
      ["2026-10", 2],
    ] satisfies Array<[string, number]>) {
      const text = await readFile(
        join(paths.data, "prompt-archive", `${month}.jsonl`),
        "utf8",
      );
      expect(text.trim().split("\n")).toHaveLength(count);
      expect(text).not.toContain("generated answer");
      expect(text).not.toContain("injected context");
      if (month === "2026-08") expect(text).toContain("typed paste");
    }
    expect(await runArchive(options)).toEqual({ archived: 0, skipped: 3 });
  });

  test("migrates legacy month files without losing expired history or duplicating current input", async () => {
    const paths = await fixture();
    const old = {
      vendor: "claude",
      display: "expired typed input",
      timestamp: "2026-09-01T00:00:00Z",
      sessionId: "c",
    };
    const current = {
      vendor: "codex",
      text: "current typed input",
      ts: "2026-10-01T00:00:00Z",
      session_id: "x",
    };
    await mkdir(join(paths.data, "prompts"), { recursive: true });
    await writeFile(
      join(paths.data, "prompts", "2026-09.jsonl"),
      `${JSON.stringify(old)}\n`,
    );
    await writeFile(
      join(paths.data, "prompts", "2026-10.jsonl"),
      `${JSON.stringify(current)}\n`,
    );
    await writeFile(paths.codex, `${JSON.stringify(current)}\n`);
    const options = {
      claudeHistory: paths.claude,
      codexHistory: paths.codex,
      dataHome: paths.data,
    };
    expect(await runArchive(options)).toEqual({ archived: 2, skipped: 0 });
    expect(await runArchive(options)).toEqual({ archived: 0, skipped: 0 });
    expect(
      await readFile(
        join(paths.data, "prompt-archive", "2026-09.jsonl"),
        "utf8",
      ),
    ).toBe(`${JSON.stringify(old)}\n`);
    expect(
      await readFile(
        join(paths.data, "prompt-archive", "2026-10.jsonl"),
        "utf8",
      ),
    ).toBe(`${JSON.stringify(current)}\n`);
    expect(
      await readFile(join(paths.data, "prompts", "2026-09.jsonl"), "utf8"),
    ).toBe(`${JSON.stringify(old)}\n`);
  });

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
      await readFile(
        join(paths.data, "prompt-archive", "2026-10.jsonl"),
        "utf8",
      )
    )
      .trim()
      .split("\n");
    const decodedRows = archivedRowsSchema.safeParse(`[${rowsText.join(",")}]`);
    expect(decodedRows.success).toBe(true);
    const rows = decodedRows.success ? decodedRows.data : [];

    expect(result).toEqual({ archived: 2, skipped: 0 });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row["vendor"])).toEqual(["claude", "codex"]);
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
      join(paths.data, "prompt-archive", "2026-10.jsonl"),
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
