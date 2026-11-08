import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { gitHead } from "./ccc-index.ts";

const prefix = "AUTO_REINDEX_RECEIPT-";
export const ReceiptSchema = z.object({
  startedAt: z.string(),
  pid: z.number(),
  requestedHead: z.string().nullable(),
  endedAt: z.string(),
  exitCode: z.number(),
  stderrTail: z.string(),
});

export async function latestAutoReindexReceipt(directory: string) {
  const names = await readdir(directory).catch(() => []);
  const receipts = await Promise.all(
    names
      .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
      .map(async (name) => {
        const raw = await readFile(join(directory, name), "utf8").catch(
          () => "",
        );
        const parsed = jsonOf(ReceiptSchema).safeParse(raw);
        return parsed.success ? parsed.data : null;
      }),
  );
  return receipts
    .filter((receipt) => receipt !== null)
    .toSorted((a, b) => {
      const order = b.endedAt.localeCompare(a.endedAt);
      return order === 0 ? b.pid - a.pid : order;
    })[0];
}

// This detached supervisor owns its receipt; the query never waits for it.
export async function superviseAutoReindex(
  directory: string,
  command: string[],
) {
  const startedAt = Temporal.Now.instant().toString();
  const head = await gitHead(process.cwd());
  let stderrTail = head.isErr() ? `${head.error.message}\n` : "";
  const exitCode = await Promise.try(async () => {
    // bounded: the index command enforces its own progress and admission limits.
    const child = Bun.spawn(command, {
      cwd: process.cwd(),
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    });
    const drain = (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of child.stderr)
        stderrTail = (
          stderrTail + decoder.decode(chunk, { stream: true })
        ).slice(-16_384);
      stderrTail = (stderrTail + decoder.decode()).slice(-16_384);
    })();
    const [code] = await Promise.all([child.exited, drain]);
    return code;
  }).catch((error: unknown) => {
    stderrTail = (stderrTail + String(error)).slice(-16_384);
    return 1;
  });
  const receipt = {
    startedAt,
    pid: process.pid,
    requestedHead: head.isOk() ? head.value : null,
    endedAt: Temporal.Now.instant().toString(),
    exitCode,
    stderrTail,
  };
  const path = join(directory, `${prefix}${crypto.randomUUID()}.json`);
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(receipt)}\n`);
  await rename(temporary, path);
  return exitCode;
}

if (import.meta.main) {
  const directory = process.env["REPO_RETRIEVE_AUTO_RECEIPT_DIR"];
  if (directory === undefined) {
    process.stderr.write("missing DB directory\n");
    process.exitCode = 1;
  } else {
    process.exitCode = await superviseAutoReindex(directory, [
      process.execPath,
      fileURLToPath(new URL("./repo-retrieve.ts", import.meta.url)),
      "index",
      "--detach",
    ]);
  }
}
