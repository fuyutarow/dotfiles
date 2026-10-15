import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cli } from "cleye";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { errorMessage } from "../agents/hooks/attempt.ts";
import { z } from "../agents/hooks/zod.ts";

const BumpSchema = z.enum(["patch", "minor", "major"]);

export const ChangesetSchema = z.strictObject({
  bump: BumpSchema,
  entry: z
    .string()
    .trim()
    .min(1, "entry must not be empty")
    .refine((entry) => !/[\r\n]/u.test(entry), "entry must be one line")
    .refine(
      (entry) => !entry.startsWith("-") && !entry.startsWith("#"),
      "entry must be plain text, not a Markdown bullet or heading",
    ),
});

export type Changeset = z.infer<typeof ChangesetSchema>;

export function parseChangeset(text: string): Result<Changeset, Error> {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();

  const hasOpeningDelimiter = lines[0] === "---";
  if (hasOpeningDelimiter) lines.shift();

  const bumpLine = lines.shift();
  if (bumpLine === undefined || !bumpLine.startsWith("bump: "))
    return err(new Error("expected bump: patch|minor|major"));
  const bump = BumpSchema.safeParse(bumpLine.slice("bump: ".length));
  if (!bump.success)
    return err(new Error("bump must be patch, minor, or major"));

  if (hasOpeningDelimiter && lines.shift() !== "---")
    return err(new Error("expected closing --- delimiter after bump"));
  if (lines[0] === "") lines.shift();

  const checked = ChangesetSchema.safeParse({
    bump: bump.data,
    entry: lines.join("\n"),
  });
  if (!checked.success) {
    const issue = checked.error.issues[0];
    return err(new Error(issue?.message ?? "invalid changeset"));
  }
  return ok(checked.data);
}

/** The canonical Markdown form retained by the repository formatter. */
export function formatChangeset(changeset: Changeset): string {
  return `---\nbump: ${changeset.bump}\n---\n\n${changeset.entry}\n`;
}

export function changesetDiagnostic(path: string, reason: string): string {
  return `${path}: ${reason}; create a correct changeset with mise run changeset -- <tool> <patch|minor|major> "<entry>"`;
}

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("FATAL: unknown option --__proto__\n");
    process.exit(2);
  }
};

function slugOf(entry: string): string {
  const slug = entry
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036F]/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "")
    .slice(0, 64)
    .replace(/-$/u, "");
  return slug.length === 0 ? "change" : slug;
}

function uniqueSlug(changesDir: string, base: string): string {
  let slug = base;
  let suffix = 2;
  while (existsSync(join(changesDir, `${slug}.md`))) {
    slug = `${base}-${suffix}`;
    suffix++;
  }
  return slug;
}

export function writeChangeset(
  root: string,
  tool: string,
  bump: string,
  entry: string,
): Result<string, Error> {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(tool))
    return err(new Error(`invalid tool name: ${tool}`));
  const checked = ChangesetSchema.safeParse({ bump, entry });
  if (!checked.success) {
    const issue = checked.error.issues[0];
    return err(new Error(issue?.message ?? "invalid changeset"));
  }

  const toolsRoot = join(root, "tools");
  const toolPath = join(toolsRoot, tool);
  if (!existsSync(toolPath))
    return err(new Error(`unknown tool directory: tools/${tool}`));
  const toolInfo = fromThrowable(
    () => statSync(toolPath),
    (error) => new Error(errorMessage(error)),
  )();
  if (toolInfo.isErr()) return err(toolInfo.error);
  if (!toolInfo.value.isDirectory())
    return err(new Error(`unknown tool directory: tools/${tool}`));

  const changesDir = join(toolPath, ".changes");
  const written = fromThrowable(
    () => {
      mkdirSync(changesDir, { recursive: true });
      const slug = uniqueSlug(changesDir, slugOf(checked.data.entry));
      const path = join(changesDir, `${slug}.md`);
      writeFileSync(path, formatChangeset(checked.data), { flag: "wx" });
      return `tools/${tool}/.changes/${slug}.md`;
    },
    (error) => new Error(errorMessage(error)),
  )();
  if (written.isErr()) return err(written.error);
  return ok(written.value);
}

if (import.meta.main) {
  const parsed = cli({
    name: "changeset",
    parameters: ["<tool>", "<bump>", "<entry>"],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  });
  if (parsed._.length !== 3) {
    process.stderr.write(
      'FATAL: usage: mise run changeset -- <tool> <patch|minor|major> "<entry>"\n',
    );
    process.exitCode = 2;
  } else
    writeResult(
      writeChangeset(
        resolve(import.meta.dir, ".."),
        String(parsed._[0]),
        String(parsed._[1]),
        String(parsed._[2]),
      ),
    );
}

function writeResult(result: Result<string, Error>): void {
  if (result.isErr()) {
    process.stderr.write(`FATAL: ${result.error.message}\n`);
    process.exitCode = 2;
  } else process.stdout.write(`WROTE ${result.value}\n`);
}
