import { resolve } from "node:path";
import { jsonOf, z } from "../tools/shared/src/zod.ts";

const root = resolve(import.meta.dir, "..");
// Consumer-owned tasks and illustrative placeholders, scoped to their document.
const exceptions: Record<string, Record<string, string>> = {
  "agents/skills/compiling-latex/SKILL.md": {
    "latex:fmt:check": "LaTeX preset task in the consumer repository",
    "latex:lint": "LaTeX preset task in the consumer repository",
    "latex:check": "LaTeX preset task in the consumer repository",
  },
  "agents/skills/governing-research-documentation/references/harness-integration.md":
    {
      "docs:research-check":
        "Task declared by the consumer research repository",
    },
  "agents/skills/wiring-mise-tasks/SKILL.md": {
    X: "Placeholder for a task in an arbitrary repository",
  },
  "agents/skills/wiring-mise-tasks/references/recipes.md": {
    a: "Illustrative task in an arbitrary repository",
  },
  "agents/skills/wiring-repositories/SKILL.md": {
    a: "Illustrative task in an arbitrary repository",
    "hook:": "Illustrative hook:<event> task in a consumer repository",
  },
};

const child = Bun.spawn(["mise", "tasks", "--json"], {
  cwd: root,
  stdout: "pipe",
  stderr: "pipe",
  stdin: "ignore",
  timeout: 60_000,
});
const [stdout, stderr, exit] = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
  child.exited,
]);
if (exit !== 0) {
  process.stderr.write(`mise tasks failed (${exit}): ${stderr}\n`);
  process.exit(2);
}
const rows = jsonOf(
  z.array(z.looseObject({ name: z.string(), aliases: z.array(z.string()) })),
).safeParse(stdout);
if (!rows.success) {
  process.stderr.write("mise tasks returned invalid JSON or task entries\n");
  process.exit(2);
}
const tasks = new Set(
  rows.data.flatMap((row) => [row.name].concat(row.aliases)),
);
const files = (
  await Promise.all([
    Array.fromAsync(
      new Bun.Glob("agents/skills/*/SKILL.md").scan({ cwd: root }),
    ),
    Array.fromAsync(
      new Bun.Glob("agents/skills/*/references/**/*.md").scan({ cwd: root }),
    ),
  ])
)
  .flat()
  .filter((file) => !file.split("/").includes("tests"))
  .toSorted();
let count = 0;
let failures = 0;
function checkDocument(file: string, source: string): void {
  for (const match of source.matchAll(
    /\bmise[ \t]+run[ \t]+([a-zA-Z0-9][a-zA-Z0-9:_-]*)/gu,
  )) {
    const task = match[1];
    if (task === undefined) continue;
    count++;
    if (tasks.has(task) || exceptions[file]?.[task] !== undefined) continue;
    const line = source.slice(0, match.index).split("\n").length;
    process.stderr.write(`FAIL ${file}:${line}: unknown mise task ${task}\n`);
    failures++;
  }
}
for (const file of files) {
  checkDocument(file, await Bun.file(resolve(root, file)).text());
}
if (failures > 0) process.exitCode = 1;
else
  process.stdout.write(
    `PASS: ${count} task mentions in ${files.length} skill documents resolve or have documented exceptions\n`,
  );
