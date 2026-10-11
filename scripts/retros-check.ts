import { resolve } from "node:path";
import { cli } from "cleye";
import { z } from "../agents/hooks/zod.ts";

const ROOT = resolve(import.meta.dir, "..");
const REGISTER = resolve(ROOT, "agents/retros/register.toml");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const Lesson = z.object({
  id: z.string().min(1),
  first_seen: date,
  sources: z.array(z.enum(["retro", "memory", "session"])).min(1),
  principle: z.string().min(1),
  enforcement: z.object({
    type: z.enum(["hook", "lint", "test", "skill", "manual"]),
    locus: z.string().min(1),
  }),
  status: z.enum(["open", "in-progress", "fixed"]),
  recurrences: z.array(date),
});
const Register = z.object({ lesson: z.array(Lesson).min(1) });
type Lesson = z.infer<typeof Lesson>;

export type Finding = { id: string; text: string };
let prototypeFlagSeen = false;
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") prototypeFlagSeen = true;
}

export async function inspectRegister(
  parsed: unknown,
  root = ROOT,
): Promise<Finding[]> {
  const decoded = Register.safeParse(parsed);
  if (!decoded.success)
    return decoded.error.issues.map((issue) => {
      const locus = issue.path.join(".");
      return {
        id: "register",
        text: `schema: ${locus.length > 0 ? locus : "lesson"}: ${issue.message}`,
      };
    });

  const findings: Finding[] = [];
  const ids = new Set<string>();
  for (const lesson of decoded.data.lesson) {
    if (ids.has(lesson.id))
      findings.push({ id: lesson.id, text: "duplicate id" });
    ids.add(lesson.id);
    const locus = resolve(root, lesson.enforcement.locus);
    if (
      lesson.enforcement.locus.startsWith("/") ||
      (locus !== root && !locus.startsWith(`${root}/`))
    )
      findings.push({
        id: lesson.id,
        text: `locus escapes repository: ${lesson.enforcement.locus}`,
      });
    else if (!(await Bun.file(locus).exists()))
      findings.push({
        id: lesson.id,
        text: `missing enforcement locus: ${lesson.enforcement.locus}`,
      });
  }
  return findings;
}

function serialize(lesson: Lesson, json: boolean): string {
  const needsEnforcement =
    lesson.enforcement.type === "manual" && lesson.recurrences.length > 0;
  if (json)
    return JSON.stringify({ ...lesson, needs_enforcement: needsEnforcement });
  return `${lesson.id}${needsEnforcement ? " needs-enforcement" : ""}`;
}

const main = async (): Promise<void> => {
  const args = cli(
    {
      name: "retros-check",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      flags: {
        json: { type: Boolean, description: "emit one JSON record per lesson" },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (prototypeFlagSeen) {
    process.stderr.write("retros:check: unsupported --__proto__ flag\n");
    process.exitCode = 2;
    return;
  }
  if (args._.length > 0) {
    process.stderr.write(
      `retros:check: unexpected arguments: ${args._.join(" ")}\n`,
    );
    process.exitCode = 2;
    return;
  }
  const contents = await Bun.file(REGISTER).text();
  const parsed = Register.safeParse(Bun.TOML.parse(contents));
  if (!parsed.success) {
    process.stderr.write(
      `retros:check: invalid register TOML: ${parsed.error.message}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const findings = await inspectRegister(parsed.data, ROOT);
  if (findings.length > 0) {
    for (const finding of findings)
      process.stderr.write(`${finding.id}: ${finding.text}\n`);
    process.exitCode = 1;
    return;
  }
  for (const lesson of parsed.data.lesson)
    process.stdout.write(`${serialize(lesson, args.flags.json === true)}\n`);
};

if (import.meta.main) await main();
