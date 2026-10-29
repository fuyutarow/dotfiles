import { homedir } from "node:os";
import { join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { z } from "../tools/shared/src/zod.ts";

function fatal(error: unknown): number {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  return 2;
}

// Operator-facing check; private vocabulary is never declared in this repository.
async function main(): Promise<number> {
  const configHome =
    process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
  const listPath = join(configHome, "dotfiles", "private-names.txt");
  const loaded = await fromAsyncThrowable(() => Bun.file(listPath).text())();
  if (loaded.isErr()) {
    if (
      z.object({ code: z.literal("ENOENT") }).safeParse(loaded.error).success
    ) {
      process.stdout.write(
        "lint:no-project-names: unconfigured (private list absent)\n",
      );
      return 0;
    }
    return fatal(loaded.error);
  }
  const source = loaded.value;
  const words = [
    ...new Set(
      source
        .split(/\r?\n/u)
        .map((line) => line.split("#")[0]?.trim().toLowerCase() ?? "")
        .filter(Boolean),
    ),
  ];
  const patterns = words.map((word) => ({
    word,
    pattern: new RegExp(
      `(?<![\\p{L}\\p{M}\\p{N}_])${RegExp.escape(word)}(?![\\p{L}\\p{M}\\p{N}_])`,
      "giu",
    ),
  }));
  const listing = Bun.spawn(
    ["jj", "file", "list", "-r", "@", "-T", 'path ++ "\\0"'],
    {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    },
  );
  const [code, stdout, stderr] = await Promise.all([
    listing.exited,
    new Response(listing.stdout).text(),
    new Response(listing.stderr).text(),
  ]);
  if (code !== 0) return fatal(`jj file list failed: ${stderr.trim()}`);
  let findings = 0;
  function scan(path: string, line: number, text: string): void {
    for (const { word, pattern } of patterns) {
      for (const _match of text.matchAll(pattern)) {
        process.stdout.write(`${path}:${line}: ${word}\n`);
        findings++;
      }
    }
  }
  for (const path of stdout.split("\0").filter(Boolean)) {
    // Line zero identifies a path finding; content lines are one-based.
    scan(path, 0, path);
    const content = await Bun.file(join(process.cwd(), path)).text();
    for (const [index, line] of content.split(/\r?\n/u).entries())
      scan(path, index + 1, line);
  }
  return findings === 0 ? 0 : 1;
}

const attempted = await fromAsyncThrowable(main)();
process.exitCode = attempted.isErr() ? fatal(attempted.error) : attempted.value;
