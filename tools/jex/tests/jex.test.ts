import { afterAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { INPUT_CAP } from "../src/classify.ts";
import packageJson from "../package.json" with { type: "json" };

const Verdict = z.object({
  model: z.union([
    z.string(),
    z.object({ na: z.literal(true), why: z.string() }),
  ]),
  bits: z.array(
    z.object({
      id: z.string(),
      p: z.number(),
      reason: z.union([
        z.string(),
        z.object({ na: z.literal(true), why: z.string() }),
      ]),
    }),
  ),
  refuted: z
    .object({
      p: z.number(),
      reason: z.union([
        z.string(),
        z.object({ na: z.literal(true), why: z.string() }),
      ]),
    })
    .optional(),
});
function decode<S extends z.ZodType>(schema: S, text: string): z.output<S> {
  const parsed = jsonOf(schema).safeParse(text);
  if (!parsed.success) return expect.unreachable(parsed.error.message);
  return parsed.data;
}
const verdict = (text: string) => decode(Verdict, text);
const root = await mkdtemp(join(tmpdir(), "jex-test-"));
const q = join(root, "questions.toml");
const file = join(root, "input.txt");
const cli = resolve(import.meta.dir, "../src/jex.ts");
await writeFile(
  q,
  'schema = 1\n[[question]]\nid = "a"\ntext = "Is this readable?"\n[[question]]\nid = "b"\ntext = "Is this text?"\n',
);
await writeFile(file, "hello 世界\n");
let calls = 0;
let answer: unknown = {};
let status = 200;
let request: unknown;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (req) => {
    calls++;
    request = decode(z.unknown(), await req.text());
    return Response.json(answer, { status });
  },
});
afterAll(async () => {
  await server.stop(true);
  await rm(root, { recursive: true, force: true });
});
async function run(
  args = [q, file],
  endpoint = server.url.href,
  env: NodeJS.ProcessEnv = {},
) {
  const child = Bun.spawn([process.execPath, cli, ...args], {
    env: {
      ...process.env,
      TYPESAFE_API_KEY: "fake-jex-key",
      JEV_URL: endpoint,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}
const replies = (a: number, b: number) => ({
  answers: {
    a: { type: "noul", noul: a },
    b: { type: "noul", noul: b, reason: "fixture" },
  },
});

test.each(
  ["AGX_NEXT_JEV_URL", "JEX_JEV_URL"].flatMap((name) =>
    ["", "https://retired.invalid"].flatMap((value) =>
      [false, true].map((preview) => ({ name, value, preview })),
    ),
  ),
)("rejects retired endpoint override %j", async ({ name, value, preview }) => {
  const before = calls;
  const result = await run(
    preview ? ["--request", q, file] : [q, file],
    server.url.href,
    { [name]: value },
  );
  expect(result.exit).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain(name);
  expect(result.stderr).toContain("use JEV_URL instead");
  expect(calls).toBe(before);
});

test("all bits >= .5 succeeds and prints normalized bits", async () => {
  answer = { ...replies(0.5, 1), model: "jev-test-reported-model" };
  const result = await run();
  expect(result.exit).toBe(0);
  expect(verdict(result.stdout)).toEqual({
    model: "jev-test-reported-model",
    bits: [
      {
        id: "a",
        p: 0.5,
        reason: { na: true, why: '{"type":"noul","noul":0.5}' },
      },
      { id: "b", p: 1, reason: "fixture" },
    ],
  });
  expect(request).toMatchObject({
    model: "jev-latest",
    questions: { a: { type: "noul", instructions: "Is this readable?" } },
    state: {
      files: [
        {
          path: file,
          sha256: createHash("sha256").update("hello 世界\n").digest("hex"),
          content: "hello 世界\n",
          size: Buffer.byteLength("hello 世界\n"),
        },
      ],
    },
  });
});
test("missing response model is explicit on verdict output", async () => {
  answer = replies(1, 1);
  const result = await run();
  expect(result.exit).toBe(0);
  expect(verdict(result.stdout).model).toEqual({
    na: true,
    why: "Jev response did not report a usable model",
  });
});
test("one bit < .5 fails with bits on stdout", async () => {
  answer = replies(0.499, 0.8);
  const result = await run();
  expect(result.exit).toBe(1);
  expect(verdict(result.stdout)).toEqual({
    model: {
      na: true,
      why: "Jev response did not report a usable model",
    },
    bits: [
      {
        id: "a",
        p: 0.499,
        reason: { na: true, why: '{"type":"noul","noul":0.499}' },
      },
      { id: "b", p: 0.8, reason: "fixture" },
    ],
  });
});
test("refuted >= .5 fails, below .5 succeeds", async () => {
  const ref = join(root, "refuted.toml");
  await writeFile(
    ref,
    `refuted_question = "Is this unreadable?"\n${await readFile(q, "utf8")}`,
  );
  for (const p of [0.5, 0.499]) {
    answer = {
      answers: {
        ...replies(0.8, 0.9).answers,
        refuted: { type: "noul", noul: p },
      },
    };
    const result = await run([ref, file]);
    expect(result.exit).toBe(p >= 0.5 ? 1 : 0);
    expect(verdict(result.stdout)).toEqual({
      model: {
        na: true,
        why: "Jev response did not report a usable model",
      },
      bits: [
        {
          id: "a",
          p: 0.8,
          reason: { na: true, why: '{"type":"noul","noul":0.8}' },
        },
        { id: "b", p: 0.9, reason: "fixture" },
      ],
      refuted: {
        p,
        reason: {
          na: true,
          why: JSON.stringify({ type: "noul", noul: p }),
        },
      },
    });
  }
});
test("missing and extra ids cannot judge and still print bits", async () => {
  for (const answers of [
    { a: { type: "noul", noul: 1 } },
    { ...replies(1, 1).answers, extra: { type: "noul", noul: 1 } },
  ]) {
    answer = { answers };
    const result = await run();
    expect(result.exit).toBe(4);
    expect(verdict(result.stdout).bits.length).toBe(
      Object.keys(answers).length,
    );
  }
});
test("invalid answer shape and probabilities never succeed", async () => {
  for (const value of [
    null,
    { answers: {} },
    { bits: [] },
    {
      answers: { a: { type: "noul", noul: 1.1 }, b: { type: "noul", noul: 1 } },
    },
    {
      answers: { a: { type: "choice", noul: 1 }, b: { type: "noul", noul: 1 } },
    },
  ]) {
    answer = value;
    const result = await run();
    expect(result.exit).toBe(4);
    expect(verdict(result.stdout)).toHaveProperty("bits");
  }
});
test("invalid answer retains the response-reported model", async () => {
  answer = { model: "jev-invalid-answer-model", answers: {} };
  const result = await run();
  expect(result.exit).toBe(4);
  expect(verdict(result.stdout)).toMatchObject({
    model: "jev-invalid-answer-model",
    bits: [],
  });
});
test("unreachable endpoint exits 3", async () => {
  const unused = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const url = unused.url.href;
  await unused.stop(true);
  expect((await run([q, file], url)).exit).toBe(3);
});
test("HTTP errors cannot succeed", async () => {
  answer = replies(1, 1);
  status = 503;
  expect((await run()).exit).toBe(4);
  status = 200;
});
test("--request sends nothing and matches sent request", async () => {
  const before = calls;
  const preview = await run(["--request", q, file]);
  expect(preview.exit).toBe(0);
  expect(calls).toBe(before);
  answer = replies(1, 1);
  await run();
  expect(decode(z.unknown(), preview.stdout)).toEqual(request);
});
test("invalid questions, duplicate ids, count, command checks, and missing files exit 4 without sending", async () => {
  const bad = join(root, "invalid.toml");
  const text = await readFile(q, "utf8");
  const before = calls;
  for (const value of [
    "!bad",
    "schema = 1\nquestion = []",
    text.replace('id = "b"', 'id = "a"'),
    text.replace("schema = 1", "schema = 2"),
    `verify = ["true"]\n${text}`,
    `schema = 1\n${Array.from({ length: 9 }, (_, i) => `[[question]]\nid = "q${i}"\ntext = "Yes?"`).join("\n")}`,
  ]) {
    await writeFile(bad, value);
    expect((await run([bad, file])).exit).toBe(4);
  }
  expect((await run([q, join(root, "missing")])).exit).toBe(4);
  expect(calls).toBe(before);
});
test("combined input over the byte limit exits 4 with the actual size and sends nothing", async () => {
  const first = join(root, "first.txt");
  const second = join(root, "second.txt");
  await writeFile(first, "a".repeat(20_000));
  const invalidUtf8 = new Uint8Array(INPUT_CAP - 20_000 + 1);
  invalidUtf8.fill(0x62);
  invalidUtf8[0] = 0xff;
  await writeFile(second, invalidUtf8);
  const before = calls;
  const result = await run(["--request", q, first, second]);
  expect(result.exit).toBe(4);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain(
    `input exceeds ${INPUT_CAP}-byte limit (actual size: ${INPUT_CAP + 1} bytes)`,
  );
  expect(calls).toBe(before);
});
test("usage and unknown flags fail with exit 2; version aliases print the package version", async () => {
  for (const args of [[], [q], ["--__proto__", q, file]])
    expect((await run(args)).exit).toBe(2);
  expect((await run(["--no-such-flag", q, file])).exit).toBe(1);
  const unknownShort = await run(["-Z", q, file]);
  expect(unknownShort.exit).toBe(1);
  expect(unknownShort.stderr).toContain("-Z");
  expect(unknownShort.stderr).not.toContain("--Z");
  for (const flag of ["-V", "--version"]) {
    const version = await run([flag]);
    expect(version.exit).toBe(0);
    expect(version.stdout).toBe(`jex ${packageJson.version}\n`);
    expect(version.stderr).toBe("");
  }
  const help = await run(["--help"]);
  expect(help.exit).toBe(0);
  expect(help.stdout).toContain(`${INPUT_CAP} bytes`);
});
