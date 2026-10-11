import { cli } from "cleye";
import { resolve } from "node:path";
import { z } from "../agents/hooks/zod.ts";

const path = resolve(import.meta.dir, "../agents/retros/register.toml");
let prototypeFlagSeen = false;
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") prototypeFlagSeen = true;
}
const parsedArgs = cli(
  {
    name: "retros-recur",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: ["<id>"],
    flags: {
      date: { type: String, description: "recurrence date (YYYY-MM-DD)" },
    },
  },
  undefined,
  Bun.argv.slice(2),
);
const id = parsedArgs._[0];
const date = parsedArgs.flags.date ?? Temporal.Now.plainDateISO().toString();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const registerSchema = z.object({
  lesson: z.array(
    z.object({ id: z.string(), recurrences: z.array(dateSchema) }),
  ),
});

const main = async (): Promise<void> => {
  if (prototypeFlagSeen) {
    process.stderr.write("retros:recur: unsupported --__proto__ flag\n");
    process.exitCode = 2;
    return;
  }
  if (parsedArgs._.length !== 1) {
    process.stderr.write("usage: retros:recur -- <id> [--date YYYY-MM-DD]\n");
    process.exitCode = 2;
    return;
  }
  if (!dateSchema.safeParse(date).success) {
    process.stderr.write(`retros:recur: invalid date: ${date}\n`);
    process.exitCode = 2;
    return;
  }
  const original = await Bun.file(path).text();
  const decoded = registerSchema.safeParse(Bun.TOML.parse(original));
  if (!decoded.success) {
    process.stderr.write(
      `retros:recur: invalid register: ${decoded.error.message}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const matching = decoded.data.lesson.filter((lesson) => lesson.id === id);
  if (matching.length !== 1) {
    process.stderr.write(
      `retros:recur: expected one lesson ${id}; found ${matching.length}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const sections = original.split(/(?=\[\[lesson\]\])/u);
  const sectionIndex = sections.findIndex((section) =>
    new RegExp(`^id\\s*=\\s*${JSON.stringify(id)}\\s*$`, "mu").test(section),
  );
  const section = sections[sectionIndex];
  if (section === undefined) {
    process.stderr.write(`retros:recur: lesson section not found: ${id}\n`);
    process.exitCode = 1;
    return;
  }
  const recurrences = matching[0]?.recurrences;
  if (recurrences === undefined) {
    process.stderr.write(`retros:recur: recurrence list missing: ${id}\n`);
    process.exitCode = 1;
    return;
  }
  if (recurrences.includes(date)) {
    process.stdout.write(
      `retros:recur: ${id} already has recurrence ${date}\n`,
    );
    return;
  }
  sections[sectionIndex] = section.replace(
    /^recurrences\s*=\s*\[[^\]]*\]/mu,
    `recurrences = [${[...recurrences, date].map((item) => JSON.stringify(item)).join(", ")}]`,
  );
  await Bun.write(path, sections.join(""));
  process.stdout.write(`retros:recur: appended ${date} to ${id}\n`);
};

if (import.meta.main) await main();
