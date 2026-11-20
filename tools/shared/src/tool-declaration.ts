// Loader for `tools/<name>/tool.toml`, the one declaration of a tool that opted in. The contract
// (fields, who reads each, what is derived and what is only checked) is tools/README.md.
//
// Readers of this module: scripts/lint-tool-declarations.ts (the check), scripts/lint-zsh.ts (the
// shell fragments to parse), scripts/tool-probe.ts (finds a probe by name) and scripts/doctor.ts
// (the PATH check names the bins and probe tasks the declaration lists).
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { errorMessage, Result } from "./result.ts";
import { z } from "./zod.ts";

const RelativeFile = z
  .string()
  .min(1)
  .refine((path) => !path.startsWith("/") && !path.split("/").includes(".."), {
    message: "must stay inside the tool directory (relative, no ..)",
  });

export const ToolDeclaration = z.strictObject({
  /** The directory name under tools/; also the key of the tool's README table row. */
  name: z.string().regex(/^[a-z][a-z0-9-]*$/u),
  /** README "Kind" column: A (machine-wide operator tool) or B (copied into consumers). */
  kind: z.enum(["A", "B"]),
  /** One line; the README row's Reason column must equal it. */
  purpose: z
    .string()
    .min(1)
    .regex(/^[^\n]+$/u, "one line"),
  /** Optional zsh fragment, relative to the tool directory. */
  shell: RelativeFile.optional(),
  /** Repo-relative files that call the tool. */
  consumers: z.array(z.string().min(1)).min(1),
  /** PATH command → entry file relative to the tool directory. */
  bins: z.record(z.string().min(1), RelativeFile),
  /** Probe name → its file (relative) and the mise task that runs it. */
  probes: z
    .record(
      z.string().min(1),
      z.strictObject({ file: RelativeFile, task: z.string().min(1) }),
    )
    .default({}),
});
export type ToolDeclaration = z.output<typeof ToolDeclaration>;

export type LoadedTool = { dir: string; declaration: ToolDeclaration };
export type LoadProblem = { dir: string; problem: string };

/** The tool directories under `<root>/tools`, sorted; `shared` is a library, not a tool. */
export async function toolDirs(root: string): Promise<string[]> {
  const entries = await readdir(join(root, "tools"), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== "shared")
    .map((entry) => entry.name)
    .toSorted();
}

/** Parse one `tool.toml`'s text; a syntax or shape error comes back as a message, never a throw. */
export function parseToolDeclaration(
  text: string,
): { ok: true; declaration: ToolDeclaration } | { ok: false; problem: string } {
  const toml = Result.try({
    try: (): unknown => Bun.TOML.parse(text),
    catch: errorMessage,
  });
  if (toml.isErr())
    return { ok: false, problem: `not valid TOML: ${toml.error}` };
  const raw = toml.value;
  const parsed = ToolDeclaration.safeParse(raw);
  if (parsed.success) return { ok: true, declaration: parsed.data };
  return {
    ok: false,
    problem: parsed.error.issues
      .map(
        (issue) =>
          `${issue.path.length === 0 ? "(root)" : issue.path.join(".")}: ${issue.message}`,
      )
      .join("; "),
  };
}

/** Every tools/<dir>/tool.toml: the declared tools, the unreadable ones, and the dirs without one. */
export async function loadToolDeclarations(root: string): Promise<{
  declared: LoadedTool[];
  broken: LoadProblem[];
  undeclared: string[];
}> {
  const declared: LoadedTool[] = [];
  const broken: LoadProblem[] = [];
  const undeclared: string[] = [];
  for (const dir of await toolDirs(root)) {
    const file = Bun.file(join(root, "tools", dir, "tool.toml"));
    if (!(await file.exists())) {
      undeclared.push(dir);
      continue;
    }
    const read = await Result.tryPromise({
      try: () => file.text(),
      catch: (e: unknown) => e,
    });
    if (read.isErr()) {
      broken.push({
        dir,
        problem: `cannot read tool.toml: ${errorMessage(read.error)}`,
      });
      continue;
    }
    const parsed = parseToolDeclaration(read.value);
    if (parsed.ok) declared.push({ dir, declaration: parsed.declaration });
    else broken.push({ dir, problem: parsed.problem });
  }
  return { declared, broken, undeclared };
}
