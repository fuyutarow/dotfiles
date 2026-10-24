import { afterAll, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

const ROOT = resolve(import.meta.dir, "../..");
const PRESET = join(ROOT, "presets/typescript");
const scratch = await mkdtemp(join(tmpdir(), "oxlint-standard-fixtures-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));
await mkdir(join(scratch, "presets/typescript"), { recursive: true });
await cp(
  join(PRESET, "house-plugin.js"),
  join(scratch, "presets/typescript/house-plugin.js"),
);
await cp(
  join(PRESET, "dotfiles-plugin.js"),
  join(scratch, "presets/typescript/dotfiles-plugin.js"),
);
await cp(
  join(PRESET, "house.oxlintrc.json"),
  join(scratch, "presets/typescript/house.oxlintrc.json"),
);
await cp(join(ROOT, ".oxlintrc.json"), join(scratch, ".oxlintrc.json"));
await mkdir(join(scratch, "node_modules"));
await cp(
  join(ROOT, "node_modules/oxlint-plugin-eslint"),
  join(scratch, "node_modules/oxlint-plugin-eslint"),
  { recursive: true, dereference: true },
);
const Entry = z.object({ selector: z.string(), message: z.string().min(1) });
const Config = z.looseObject({ rules: z.record(z.string(), z.unknown()) });
const Entries = z.tuple([z.literal("error")]).rest(Entry);
const cases = jsonOf(
  z.array(
    z.object({
      id: z.string(),
      entry: z.number().int(),
      scope: z.enum(["house", "dotfiles"]),
      bad: z.array(z.string()).min(1),
      good: z.array(z.string()).min(1),
    }),
  ),
).safeParse(await Bun.file(join(PRESET, "fixtures.json")).text());
if (!cases.success) expect.unreachable(cases.error.message);
const configs = await Promise.all(
  [join(PRESET, "house.oxlintrc.json"), join(ROOT, ".oxlintrc.json")].map(
    async (path) => {
      const parsed = Config.safeParse(
        Bun.JSONC.parse(await Bun.file(path).text()),
      );
      if (!parsed.success) return expect.unreachable(parsed.error.message);
      return parsed.data;
    },
  ),
);
const house = Entries.safeParse(
  configs[0]?.rules["eslint-js/no-restricted-syntax"],
);
const local = Entries.safeParse(
  configs[1]?.rules["dotfiles-js/no-restricted-syntax"],
);
if (!house.success || !local.success)
  expect.unreachable("missing custom syntax entries");
const entries = { house: house.data.slice(1), dotfiles: local.data.slice(1) };
const Report = jsonOf(
  z.looseObject({
    diagnostics: z.array(
      z.looseObject({ message: z.string(), filename: z.string() }),
    ),
    number_of_files: z.number(),
  }),
);

const proofCases = cases.data.flatMap((row) =>
  (["bad", "good"] as const).flatMap((which) =>
    row[which].map((source, index) => ({
      row,
      which,
      source,
      index,
      file: join(scratch, `${row.id}.${which}.${index}.ts`),
    })),
  ),
);
// Separate files keep every nearest-neighbour case independent. One oxlint invocation
// avoids loading the same ESLint plugin once per snippet; filenames identify each proof.
await Promise.all(
  proofCases.map(({ file, source }) => writeFile(file, source)),
);
const child = Bun.spawn(
  [
    process.execPath,
    join(ROOT, "node_modules/oxlint/bin/oxlint"),
    "-c",
    join(scratch, ".oxlintrc.json"),
    "--format=json",
    ...proofCases.map(({ file }) => file),
  ],
  { cwd: scratch, stdout: "pipe", stderr: "pipe", timeout: 60_000 },
);
const [out, err, exit] = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
  child.exited,
]);
const report = Report.safeParse(out);
if (!report.success) expect.unreachable(`exit ${exit}: ${err}\n${out}`);
test("each configured custom entry has bad and good fixture proof", () => {
  expect(exit).toBe(1);
  expect(report.data.number_of_files).toBe(proofCases.length);
  for (const scope of ["house", "dotfiles"] as const) {
    expect(
      cases.data
        .filter((row) => row.scope === scope && row.entry >= 0)
        .map((row) => row.entry)
        .toSorted((a, b) => a - b),
    ).toEqual(entries[scope].map((_, index) => index));
  }
});
for (const { row, which, file, index } of proofCases) {
  const dateRule = z
    .tuple([
      z.literal("error"),
      z.object({ name: z.literal("Date"), message: z.string() }),
    ])
    .safeParse(configs[0]?.rules["house/no-restricted-globals"]);
  if (!dateRule.success) expect.unreachable("missing Date restriction");
  const entry = Entry.safeParse(
    row.entry === -1
      ? { selector: "global Date", message: dateRule.data[1].message }
      : entries[row.scope][row.entry],
  );
  if (!entry.success) expect.unreachable("missing custom entry");
  test(
    row.id + " " + which + "[" + index + "]",
    () => {
      const hits = report.data.diagnostics.filter(
        (d) =>
          resolve(scratch, d.filename) === file &&
          d.message.includes(entry.data.message),
      );
      expect(hits.length).toBe(which === "bad" ? 1 : 0);
    },
    60_000,
  );
}
