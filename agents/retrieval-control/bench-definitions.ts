// `mise run bench:definitions -- --cases <file.json>` — how often `repo-retrieve definition` puts
// the right definition on top, per language. The yardstick for every ranking change in
// definitions.ts: a change ships only if it does not lower top-3 here.
//
// Case files live OUTSIDE this public repo (they name private code): ~/.local/share/repo-retrieve/
// bench/*.json. Shape:
//   {"project": "~/Workspace/x", "cases": [{"need": 1, "truth": ["fn!"], "en": "...", "ja": "..."}]}
// A case with "truth": [] is a NEGATIVE: nothing in the repo does it, so the right answer is
// NO_DEFINITION (strength "none"); it is counted under "absent".
import { homedir } from "node:os";
import { cli } from "cleye";
import { err, ok, type Result } from "neverthrow";
import { jsonOf, z } from "../hooks/zod.ts";
import { findDefinitions } from "./definitions.ts";

let prototypeFlag = false;
const rejectPrototypeFlag = (type: string, flag: string): boolean => {
  const reject = type === "unknown-flag" && flag === "__proto__";
  prototypeFlag = prototypeFlag || reject;
  return reject;
};
const argv = cli(
  {
    name: "bench-definitions",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: [],
    flags: {
      cases: { type: String, description: "case file (JSON)", default: "" },
    },
  },
  undefined,
  Bun.argv.slice(2),
);
if (prototypeFlag) {
  console.error("bench-definitions: unknown option '--__proto__'");
  process.exit(2);
}
if (argv._.length > 0 || argv.flags.cases === "") {
  console.error("usage: bench-definitions --cases <file.json>");
  process.exit(2);
}

const CaseSchema = z.object({
  need: z.union([z.number(), z.string()]),
  truth: z.array(z.string()),
  en: z.string().optional(),
  ja: z.string().optional(),
});
type Case = z.output<typeof CaseSchema>;
const SpecSchema = z.object({
  project: z.string(),
  cases: z.array(CaseSchema),
});
const specText = await Bun.file(argv.flags.cases).text();
const specRead = jsonOf(SpecSchema).safeParse(specText);
if (!specRead.success) {
  console.error(
    `bench-definitions: ${argv.flags.cases} is not a case spec: ${specRead.error.message}`,
  );
  process.exit(2);
}
const spec = specRead.data;
const project = spec.project.replace(/^~(?=\/)/u, homedir());
const tally: Record<
  string,
  { n: number; top1: number; top3: number; top10: number }
> = {};
let absentRight = 0;
let absentTotal = 0;
const ms: number[] = [];

async function runCase(
  c: Case,
  lang: "en" | "ja",
  q: string,
): Promise<Result<void, Error>> {
  const t0 = performance.now();
  const a = await findDefinitions(project, q, 10);
  if (a.isErr()) return err(a.error);
  const answer = a.value;
  ms.push(performance.now() - t0);
  for (const n of answer.notes) console.error(`NOTE ${n}`);
  if (c.truth.length === 0) {
    absentTotal += 1;
    if (answer.strength === "none") absentRight += 1;
    const verdict = answer.strength === "none" ? "OK" : "FALSE MATCH";
    console.log(
      `${c.need} ${lang} absent  ${verdict} best=${answer.best.toFixed(2)} top=${answer.cards[0]?.name ?? "-"}`,
    );
    return ok(undefined);
  }
  const rank = answer.cards.findIndex((d) => c.truth.includes(d.name)) + 1;
  const t = (tally[lang] ??= { n: 0, top1: 0, top3: 0, top10: 0 });
  t.n += 1;
  if (rank === 1) t.top1 += 1;
  if (rank >= 1 && rank <= 3) t.top3 += 1;
  if (rank >= 1) t.top10 += 1;
  const top = answer.cards
    .slice(0, 3)
    .map((d) => d.name)
    .join(", ");
  console.log(
    `${c.need} ${lang} rank=${rank !== 0 ? rank : "×"} ${answer.strength} best=${answer.best.toFixed(2)} top=${top}`,
  );
  return ok(undefined);
}

const runs = spec.cases.flatMap((c) =>
  (["en", "ja"] as const).map((lang) => ({ c, lang, q: c[lang] })),
);
for (const { c, lang, q } of runs) {
  if (q === undefined || q === "") continue;
  const result = await runCase(c, lang, q);
  if (result.isErr()) {
    process.stderr.write(`${result.error.message}\n`);
    process.exit(1);
  }
}
ms.sort((x, y) => x - y);
for (const [lang, t] of Object.entries(tally))
  console.log(
    `${lang}: top1 ${t.top1}/${t.n}  top3 ${t.top3}/${t.n}  top10 ${t.top10}/${t.n}`,
  );
const all = Object.values(tally).reduce(
  (a, t) => ({ n: a.n + t.n, top3: a.top3 + t.top3 }),
  { n: 0, top3: 0 },
);
console.log(
  `all: top3 ${all.top3}/${all.n}` +
    (absentTotal !== 0
      ? `  absent correctly ${absentRight}/${absentTotal}`
      : ""),
);
console.log(
  `latency median ${Math.round(ms[Math.floor(ms.length / 2)] ?? 0)} ms, max ${Math.round(ms.at(-1) ?? 0)} ms`,
);
