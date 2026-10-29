// A read-only admission gate. The Python bridge owns enumeration; all policy is here.
import { join, posix } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { z, jsonOf } from "@dotfiles/shared/src/zod.ts";
import { attempt, errorMessage } from "@dotfiles/shared/src/attempt.ts";
import { cccPython } from "./ccc-scope.ts";
import { readIndexRate } from "./index-rate.ts";

// Per-file backstops complement ceil(chars / 800): binary files have zero chunks,
// and a large dump must not disappear into a source-heavy data-share denominator.
const CONTENT_LIMITS = {
  max_file_bytes: 1_048_576,
  max_data_file_bytes: 65_536,
};

const BudgetSchema = z
  .object({
    max_est_chunks: z.number().int().positive().default(50_000),
    max_data_share: z.number().min(0).max(1).default(0.2),
    max_seconds: z.number().positive().default(600),
    est_chunks_per_second: z.number().positive().default(50),
    file_byte_allowances: z
      .record(
        z.string().refine(
          (path) =>
            path.length > 0 &&
            path === path.trim() &&
            path === path.normalize("NFC") &&
            !["\\", ":", "*", "?", "[", "]", "{", "}"].some((char) =>
              path.includes(char),
            ) &&
            !Array.from(path).some((char) => {
              const code = char.codePointAt(0) ?? 0;
              return code < 32 || code === 127;
            }) &&
            !path.startsWith("~") &&
            path
              .split("/")
              .every((part) => part !== "" && part !== "." && part !== ".."),
          "expected an exact canonical repository-relative file path",
        ),
        z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      )
      .optional(),
  })
  .strict();
const FileSchema = z.object({
  path: z.string(),
  bytes: z.number().nonnegative(),
  est_chunks: z.number().int().nonnegative(),
  kind: z.enum(["data", "text"]),
  blob: z.boolean().optional(),
});
export type PlanFile = z.infer<typeof FileSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
const aggregateByteLimits = (budget: Budget) => {
  const max_total_bytes = budget.max_est_chunks * 800;
  return {
    max_total_bytes,
    max_data_bytes: max_total_bytes * budget.max_data_share,
  };
};
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
  rate_source: "measured" | "fallback";
  rate_history?: string;
  chunks_per_second: number;
  violations: string[];
  directories: (Totals & { directory: string })[];
  extensions: (Totals & { extension: string })[];
  contributors: (Totals & {
    directory: string;
    extension: string;
    kind: PlanFile["kind"];
    pattern: string;
    exclude: string | null;
  })[];
};

const extension = (path: string) =>
  path.toLowerCase().endsWith(".min.js") ? path.slice(-7) : posix.extname(path);
// Leading ! is ccc's exclusion negation operator, not a literal filename.
const escapeGlob = (path: string) => path.replaceAll(/[\\*?[\]{}!]/gu, "\\$&");
const directory = (file: PlanFile) =>
  posix.dirname(file.path).split("/").slice(0, 3).join("/");
const contributorKey = (file: PlanFile) =>
  `${directory(file)}\0${extension(file.path)}\0${file.kind}`;
export function summarize(
  files: PlanFile[],
  budget: Budget,
  measuredRate: number | null = null,
): IndexPlan {
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
  const groupedFiles = Map.groupBy(files, contributorKey);
  const contributors = aggregate(contributorKey).map(({ name, ...totals }) => {
    const [dir = ".", ext = "", kindName = "text"] = name.split("\0");
    const kind: PlanFile["kind"] = kindName === "data" ? "data" : "text";
    const matchingFiles = groupedFiles.get(name) ?? [];
    // Exact paths ensure a data suggestion can never remove adjacent source or prose.
    const pattern = matchingFiles
      .map((file) => escapeGlob(file.path))
      .join("\n");
    return {
      directory: dir,
      extension: ext,
      kind,
      pattern,
      files: totals.files,
      bytes: totals.bytes,
      est_chunks: totals.est_chunks,
      share: totals.share,
      exclude:
        kind === "data"
          ? matchingFiles
              .map(
                (file) => `- '${escapeGlob(file.path).replaceAll("'", "''")}'`,
              )
              .join("\n")
          : null,
    };
  });
  const data_share =
    chunks === 0
      ? 0
      : files
          .filter((file) => file.kind === "data")
          .reduce((sum, file) => sum + file.est_chunks, 0) / chunks;
  const rate_source = measuredRate === null ? "fallback" : "measured";
  const chunks_per_second = measuredRate ?? budget.est_chunks_per_second;
  const est_seconds = chunks / chunks_per_second;
  const violations = [];
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const dataBytes = files
    .filter((file) => file.kind === "data")
    .reduce((sum, file) => sum + file.bytes, 0);
  const aggregateLimits = aggregateByteLimits(budget);
  const inadequate =
    "effective candidate remains included; .gitignore/exclude_patterns or max_file_size in .cocoindex_code/settings.yml must exclude it";
  for (const file of files) {
    const allowance = Object.hasOwn(
      budget.file_byte_allowances ?? {},
      file.path,
    )
      ? budget.file_byte_allowances?.[file.path]
      : undefined;
    if (file.blob === true)
      violations.push(`${file.path}: binary/blob content; ${inadequate}`);
    if (file.bytes > (allowance ?? CONTENT_LIMITS.max_file_bytes))
      violations.push(
        `${file.path}: ${file.bytes} bytes > per-file limit ${allowance ?? CONTENT_LIMITS.max_file_bytes}; ${inadequate}`,
      );
    else if (
      file.kind === "data" &&
      file.bytes > (allowance ?? CONTENT_LIMITS.max_data_file_bytes)
    )
      violations.push(
        `${file.path}: dump/data candidate ${file.bytes} bytes > data-file limit ${allowance ?? CONTENT_LIMITS.max_data_file_bytes}; ${inadequate}`,
      );
  }
  if (bytes > aggregateLimits.max_total_bytes)
    violations.push(
      `aggregate candidate bytes ${bytes} > ${aggregateLimits.max_total_bytes} (budget.max_est_chunks × 800); exclusions are inadequate; largest paths: ${files
        .toSorted((a, b) =>
          a.bytes === b.bytes
            ? a.path.localeCompare(b.path)
            : b.bytes - a.bytes,
        )
        .slice(0, 5)
        .map((file) => file.path)
        .join(", ")}`,
    );
  if (dataBytes > aggregateLimits.max_data_bytes)
    violations.push(
      `aggregate data bytes ${dataBytes} > ${aggregateLimits.max_data_bytes} (budget.max_est_chunks × 800 × budget.max_data_share); exclusions are inadequate; exclude dump/data candidates`,
    );
  if (chunks > budget.max_est_chunks)
    violations.push(`est_chunks ${chunks} > ${budget.max_est_chunks}`);
  if (data_share > budget.max_data_share)
    violations.push(
      `data share ${(data_share * 100).toFixed(1)}% > ${budget.max_data_share * 100}%`,
    );
  if (rate_source === "measured" && est_seconds > budget.max_seconds)
    violations.push(
      `estimated GPU seconds ${est_seconds.toFixed(1)} > ${budget.max_seconds}`,
    );
  return {
    files,
    budget,
    total: {
      files: files.length,
      bytes,
      est_chunks: chunks,
      share: chunks === 0 ? 0 : 1,
    },
    data_share,
    est_seconds,
    rate_source,
    chunks_per_second,
    violations,
    directories,
    extensions,
    contributors,
  };
}

export async function computeIndexPlan(
  project: string,
  ccc: string,
  options: { validationTimeoutMs?: number } = {},
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
      cmd: [
        python,
        join(import.meta.dir, "ccc_plan.py"),
        project,
        "--limits",
        JSON.stringify({
          ...CONTENT_LIMITS,
          ...aggregateByteLimits(budget),
          file_byte_allowances: budget.file_byte_allowances ?? {},
        }),
      ],
      cwd: project,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
        RUST_LOG: "error",
        OTEL_SDK_DISABLED: "true",
      },
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
    const measuredRate = await readIndexRate();
    const plan = summarize(files, budget, measuredRate.rate);
    plan.rate_history = measuredRate.report;
    // A directory can itself end in '.json'. Ask ccc whether a proposed glob would
    // prune any ancestor of an included file; extension-scoping alone is insufficient.
    const dataItems = plan.contributors.filter((item) => item.kind === "data");
    const groupedData = Map.groupBy(
      files.filter((file) => file.kind === "data"),
      contributorKey,
    );
    const dataPatterns = dataItems.flatMap((item) =>
      (groupedData.get(`${item.directory}\0${item.extension}\0data`) ?? []).map(
        (file) => escapeGlob(file.path),
      ),
    );
    const validationTimeoutMs = options.validationTimeoutMs ?? 120_000;
    const validationSignal = AbortSignal.timeout(validationTimeoutMs);
    const validation = Bun.spawn({
      cmd: [
        python,
        join(import.meta.dir, "ccc_plan.py"),
        project,
        "--validate-excludes",
      ],
      cwd: project,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
        RUST_LOG: "error",
        OTEL_SDK_DISABLED: "true",
      },
      stdin: new Response(
        JSON.stringify({
          patterns: dataPatterns,
          paths: files.map((file) => file.path),
        }),
      ),
      stdout: "pipe",
      stderr: "pipe",
      signal: validationSignal,
    });
    const [validationOut, validationErr, validationCode] = await Promise.all([
      new Response(validation.stdout).text(),
      new Response(validation.stderr).text(),
      validation.exited,
    ]);
    const safe = jsonOf(z.array(z.boolean())).safeParse(validationOut);
    if (
      validationSignal.aborted ||
      validationCode !== 0 ||
      !safe.success ||
      safe.data.length !== dataPatterns.length
    ) {
      let reason = `subprocess failed`;
      if (validationSignal.aborted)
        reason = `timed out after ${validationTimeoutMs}ms`;
      else if (validationCode === 0 && !safe.success)
        reason = `invalid validator output: ${safe.error.message.slice(0, 2000)}`;
      else if (validationCode === 0 && safe.success)
        reason = `validator result count mismatch: expected ${dataPatterns.length}, received ${safe.data.length}`;
      return err(
        new Error(
          `cannot validate exclude suggestions: ${reason}; exit ${validationCode}; signal ${validation.signalCode ?? "none"}; stderr=${JSON.stringify(validationErr.slice(0, 2000))}; stdout=${JSON.stringify(validationOut.slice(0, 2000))}`,
        ),
      );
    }
    const safeByPath = new Map(
      dataPatterns.map((pattern, index) => [
        pattern,
        safe.data[index] === true,
      ]),
    );
    for (const item of dataItems) {
      const excludes = (
        groupedData.get(`${item.directory}\0${item.extension}\0data`) ?? []
      )
        .filter((file) => safeByPath.get(escapeGlob(file.path)) === true)
        .map((file) => `- '${escapeGlob(file.path).replaceAll("'", "''")}'`);
      item.exclude = excludes.length === 0 ? null : excludes.join("\n");
    }
    return ok(plan);
  });
  return result.ok
    ? result.value
    : err(new Error(`index plan refused: ${errorMessage(result.error)}`));
}

export function planReport(plan: IndexPlan): string {
  const excludes = plan.contributors.filter((item) => item.exclude !== null);
  const contributors = plan.contributors
    .slice(0, 10)
    .map(
      (item) =>
        `${item.directory} (${item.extension === "" ? "extensionless" : item.extension}, ${item.kind}): ${item.est_chunks} chunks, ${(item.share * 100).toFixed(1)}%, ${item.files} files\n`,
    )
    .join("");
  const suggestions =
    excludes.length === 0
      ? "No data-kind contributor can be safely excluded. Adjust [index] budgets in .cocoindex_code/rr.toml.\n"
      : "Suggested data-only excludes for .cocoindex_code/settings.yml:\n" +
        excludes
          .slice(0, 10)
          .map((item) => item.exclude ?? "")
          .join("\n") +
        "\n";
  return (
    `PLAN: ${plan.total.files} files, ${plan.total.bytes} bytes, ${plan.total.est_chunks} est_chunks (ceil(chars / 800)); data ${(plan.data_share * 100).toFixed(1)}%; estimated GPU ${plan.est_seconds.toFixed(1)}s at ${plan.chunks_per_second.toFixed(2)} chunks/s (${plan.rate_source})\n` +
    `${plan.rate_history ?? "RATE HISTORY: no history supplied"}\n` +
    (plan.rate_source === "fallback"
      ? "PLAN WARNING: time estimate uses the configured fallback rate; the time budget is advisory until a measured host rate exists.\n"
      : "") +
    `BUDGET: ${JSON.stringify(plan.budget)}\n` +
    `CONTENT LIMITS (bytes): ${JSON.stringify({ ...CONTENT_LIMITS, ...aggregateByteLimits(plan.budget) })}; blob content is refused at any size\n` +
    (plan.violations.length === 0
      ? "PLAN: within budget\n"
      : "PLAN REFUSED: " + plan.violations.join("; ") + "\n") +
    "Top contributors (informational):\n" +
    contributors +
    (plan.violations.length === 0 ? "" : suggestions)
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
