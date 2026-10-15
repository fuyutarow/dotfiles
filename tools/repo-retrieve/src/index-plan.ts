// A read-only admission gate. The Python bridge owns enumeration; all policy is here.
import { join, posix } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { z, jsonOf } from "../../shared/src/zod.ts";
import { attempt, errorMessage } from "../../shared/src/attempt.ts";
import { cccPython } from "./ccc-scope.ts";

const BudgetSchema = z
  .object({
    max_est_chunks: z.number().int().positive().default(50_000),
    max_data_share: z.number().min(0).max(1).default(0.2),
    max_seconds: z.number().positive().default(600),
    est_chunks_per_second: z.number().positive().default(50),
  })
  .strict();
const FileSchema = z.object({
  path: z.string(),
  bytes: z.number().nonnegative(),
  est_chunks: z.number().int().nonnegative(),
  kind: z.enum(["data", "text"]),
});
export type PlanFile = z.infer<typeof FileSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
type Totals = {
  files: number;
  bytes: number;
  est_chunks: number;
  share: number;
};
export type IndexPlan = {
  files: PlanFile[];
  budget: Budget;
  total: Totals;
  data_share: number;
  est_seconds: number;
  violations: string[];
  directories: (Totals & { directory: string })[];
  extensions: (Totals & { extension: string })[];
  contributors: (Totals & {
    directory: string;
    extension: string;
    pattern: string;
    exclude: string;
  })[];
};

const extension = (path: string) =>
  path.toLowerCase().endsWith(".min.js") ? path.slice(-7) : posix.extname(path);
const escapeGlob = (path: string) => path.replaceAll(/[\\*?[\]{}]/gu, "\\$&");
const directory = (file: PlanFile) =>
  posix.dirname(file.path).split("/").slice(0, 3).join("/");
export function summarize(files: PlanFile[], budget: Budget): IndexPlan {
  const chunks = files.reduce((sum, file) => sum + file.est_chunks, 0);
  const aggregate = (key: (file: PlanFile) => string) => {
    const groups = new Map<string, Totals>();
    for (const file of files) {
      const name = key(file);
      const item = groups.get(name) ?? {
        files: 0,
        bytes: 0,
        est_chunks: 0,
        share: 0,
      };
      item.files++;
      item.bytes += file.bytes;
      item.est_chunks += file.est_chunks;
      groups.set(name, item);
    }
    return [...groups]
      .map(([name, totals]) => ({
        name,
        files: totals.files,
        bytes: totals.bytes,
        est_chunks: totals.est_chunks,
        share: chunks === 0 ? 0 : totals.est_chunks / chunks,
      }))
      .toSorted((a, b) =>
        b.est_chunks === a.est_chunks
          ? a.name.localeCompare(b.name)
          : b.est_chunks - a.est_chunks,
      );
  };
  // Non-overlapping buckets, capped at three directory levels; root files use '.'.
  const directories = aggregate(directory).map(({ name, ...totals }) => ({
    directory: name,
    files: totals.files,
    bytes: totals.bytes,
    est_chunks: totals.est_chunks,
    share: totals.share,
  }));
  const extensions = aggregate((file) => extension(file.path)).map(
    ({ name, ...totals }) => ({
      extension: name,
      files: totals.files,
      bytes: totals.bytes,
      est_chunks: totals.est_chunks,
      share: totals.share,
    }),
  );
  const contributors = aggregate(
    (file) => `${directory(file)}\0${extension(file.path)}`,
  ).map(({ name, ...totals }) => {
    const [dir = ".", ext = ""] = name.split("\0");
    // Extensionless files get an exact path suggestion, never a directory prune.
    const prefix = dir === "." ? "" : `${escapeGlob(dir)}/`;
    let pattern = `${prefix}**/*${escapeGlob(ext)}`;
    if (ext === "")
      pattern = escapeGlob(
        files.find(
          (file) => directory(file) === dir && extension(file.path) === ext,
        )?.path ?? "",
      );
    return {
      directory: dir,
      extension: ext,
      pattern,
      files: totals.files,
      bytes: totals.bytes,
      est_chunks: totals.est_chunks,
      share: totals.share,
      exclude: `- '${pattern.replaceAll("'", "''")}'`,
    };
  });
  const data_share =
    chunks === 0
      ? 0
      : files
          .filter((file) => file.kind === "data")
          .reduce((sum, file) => sum + file.est_chunks, 0) / chunks;
  const est_seconds = chunks / budget.est_chunks_per_second;
  const violations = [];
  if (chunks > budget.max_est_chunks)
    violations.push(`est_chunks ${chunks} > ${budget.max_est_chunks}`);
  if (data_share > budget.max_data_share)
    violations.push(
      `data share ${(data_share * 100).toFixed(1)}% > ${budget.max_data_share * 100}%`,
    );
  if (est_seconds > budget.max_seconds)
    violations.push(
      `estimated GPU seconds ${est_seconds.toFixed(1)} > ${budget.max_seconds}`,
    );
  return {
    files,
    budget,
    total: {
      files: files.length,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      est_chunks: chunks,
      share: chunks === 0 ? 0 : 1,
    },
    data_share,
    est_seconds,
    violations,
    directories,
    extensions,
    contributors,
  };
}

export async function computeIndexPlan(
  project: string,
  ccc: string,
): Promise<Result<IndexPlan, Error>> {
  const result = await attempt(async () => {
    const configFile = Bun.file(join(project, ".cocoindex_code", "rr.toml"));
    const raw = (await configFile.exists())
      ? Bun.TOML.parse(await configFile.text())
      : {};
    const configSchema = z.object({ index: BudgetSchema.optional() }).strict();
    const config = configSchema.safeParse(raw);
    if (!config.success)
      return err(new Error(`invalid rr.toml: ${config.error.message}`));
    const defaults = BudgetSchema.safeParse({});
    if (!defaults.success) return err(new Error(defaults.error.message));
    const budget = config.data.index ?? defaults.data;
    const python = await cccPython(ccc);
    if (python === null)
      return err(
        new Error("index plan refused: cannot locate ccc's Python interpreter"),
      );
    const child = Bun.spawn({
      cmd: [python, join(import.meta.dir, "ccc_plan.py"), project],
      cwd: project,
      env: { ...process.env, RUST_LOG: "error", OTEL_SDK_DISABLED: "true" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0)
      return err(
        new Error(`index plan failed (exit ${code}): ${stderr.trim()}`),
      );
    const files: PlanFile[] = [];
    for (const line of stdout.split("\n").filter(Boolean)) {
      const file = jsonOf(FileSchema).safeParse(line);
      if (!file.success)
        return err(new Error(`invalid planner output: ${file.error.message}`));
      files.push(file.data);
    }
    const plan = summarize(files, budget);
    // A directory can itself end in '.json'. Ask ccc whether a proposed glob would
    // prune any ancestor of an included file; extension-scoping alone is insufficient.
    const validation = Bun.spawn({
      cmd: [
        python,
        join(import.meta.dir, "ccc_plan.py"),
        project,
        "--validate-excludes",
      ],
      cwd: project,
      env: { ...process.env, RUST_LOG: "error", OTEL_SDK_DISABLED: "true" },
      stdin: new Response(
        JSON.stringify({
          patterns: plan.contributors.map((item) => item.pattern),
          paths: files.map((file) => file.path),
        }),
      ),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    });
    const [validationOut, validationErr, validationCode] = await Promise.all([
      new Response(validation.stdout).text(),
      new Response(validation.stderr).text(),
      validation.exited,
    ]);
    const safe = jsonOf(z.array(z.boolean())).safeParse(validationOut);
    if (
      validationCode !== 0 ||
      !safe.success ||
      safe.data.length !== plan.contributors.length
    )
      return err(
        new Error(`cannot validate exclude suggestions: ${validationErr}`),
      );
    for (const [index, item] of plan.contributors.entries()) {
      if (safe.data[index] === true && item.extension !== "") continue;
      // Exact file paths cannot accidentally match an existing directory. They also
      // correctly describe every extensionless contributor, rather than only one file.
      item.exclude = files
        .filter(
          (file) =>
            directory(file) === item.directory &&
            extension(file.path) === item.extension,
        )
        .map((file) => `- '${escapeGlob(file.path).replaceAll("'", "''")}'`)
        .join("\n");
    }
    return ok(plan);
  });
  return result.ok
    ? result.value
    : err(new Error(`index plan refused: ${errorMessage(result.error)}`));
}

export function planReport(plan: IndexPlan): string {
  return (
    `PLAN: ${plan.total.files} files, ${plan.total.bytes} bytes, ${plan.total.est_chunks} est_chunks (ceil(chars / 800)); data ${(plan.data_share * 100).toFixed(1)}%; estimated GPU ${plan.est_seconds.toFixed(1)}s at assumed ${plan.budget.est_chunks_per_second} chunks/s\n` +
    `BUDGET: ${JSON.stringify(plan.budget)}\n` +
    `${plan.violations.length === 0 ? "PLAN: within budget" : `PLAN REFUSED: ${plan.violations.join("; ")}`}\n` +
    "Top contributors; paste under exclude_patterns in .cocoindex_code/settings.yml:\n" +
    plan.contributors
      .slice(0, 10)
      .map(
        (item) =>
          `${item.directory} (${item.extension === "" ? "extensionless" : item.extension}): ${item.est_chunks} chunks, ${(item.share * 100).toFixed(1)}%, ${item.files} files; ${item.exclude}\n`,
      )
      .join("")
  );
}

export function writePlanJsonl(plan: IndexPlan): void {
  for (const file of plan.files)
    process.stdout.write(`${JSON.stringify(file)}\n`);
  const { files: _files, ...summary } = plan;
  process.stdout.write(
    `${JSON.stringify({ type: "summary", estimator: "ceil(chars / 800)", ...summary })}\n`,
  );
}

// Only increasing persisted chunk counts are measured; file-list activity is not embeddings.
export function measuredEta(
  total: number,
  initial: number,
  current: number,
  elapsedSeconds: number,
) {
  const delta = current - initial;
  if (delta <= 0 || elapsedSeconds <= 0) return null;
  const rate = delta / elapsedSeconds;
  return {
    rate,
    remaining: Math.max(0, total - delta) / rate,
    totalSeconds: elapsedSeconds + Math.max(0, total - delta) / rate,
  };
}
