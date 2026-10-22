import { createHash } from "node:crypto";
import { attempt, errorMessage } from "../../shared/src/attempt.ts";
import { jevEndpoint, postJev } from "../../shared/src/jev-client.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";

const Question = z.strictObject({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
});
export const Questions = z
  .strictObject({
    schema: z.literal(1),
    question: z.array(Question).min(1).max(8),
    refuted_question: z.string().trim().min(1).optional(),
  })
  .refine(
    (q) =>
      new Set(q.question.map((item) => item.id)).size === q.question.length,
    "question ids must be unique",
  )
  .refine(
    (q) =>
      q.refuted_question === undefined ||
      !q.question.some((item) => item.id === "refuted"),
    "refuted is reserved when refuted_question is present",
  );
type Questions = z.output<typeof Questions>;
const Noul = z.object({
  type: z.literal("noul"),
  noul: z.number().min(0).max(1),
  reason: z.string().optional(),
});
const Answer = z.object({ answers: z.record(z.string(), Noul) });
export const INPUT_CAP = 30_000;
const REQUEST_CAP = 1024 * 1024;

async function fileState(path: string, cap: number) {
  const file = Bun.file(path);
  const reader = file.stream().getReader();
  const digest = createHash("sha256");
  const prefix = new Uint8Array(cap);
  let size = 0;
  let retained = 0;
  const read = await attempt(async () => {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      digest.update(chunk.value);
      size += chunk.value.byteLength;
      const part = chunk.value.subarray(0, cap - retained);
      prefix.set(part, retained);
      retained += part.byteLength;
    }
  });
  await reader.cancel().catch(() => {});
  reader.releaseLock();
  if (!read.ok) return read;
  return {
    ok: true as const,
    value: {
      path,
      sha256: digest.digest("hex"),
      size,
      content: prefix.subarray(0, retained),
    },
  };
}

const readFileState = (path: string, cap: number) =>
  attempt(() => fileState(path, cap));

export async function buildRequest(q: Questions, paths: string[]) {
  const files = [];
  let remaining = INPUT_CAP;
  let inputSize = 0;
  for (const path of paths) {
    const result = await readFileState(path, remaining);
    if (!result.ok) return result;
    if (!result.value.ok) return result.value;
    const file = result.value.value;
    inputSize += file.size;
    remaining -= file.content.byteLength;
    files.push(file);
  }
  if (inputSize > INPUT_CAP)
    return {
      ok: false as const,
      error: new Error(
        `input exceeds ${INPUT_CAP}-byte limit (actual size: ${inputSize} bytes)`,
      ),
    };
  const decodedFiles = [];
  for (const file of files) {
    const decoded = await attempt(() =>
      new TextDecoder("utf-8", { fatal: true }).decode(file.content),
    );
    if (!decoded.ok) return decoded;
    decodedFiles.push({ ...file, content: decoded.value });
  }
  const questions = Object.fromEntries(
    q.question.map(({ id, text }) => [
      id,
      { type: "noul", instructions: text },
    ]),
  );
  if (q.refuted_question !== undefined)
    Object.defineProperty(questions, "refuted", {
      value: { type: "noul", instructions: q.refuted_question },
      enumerable: true,
    });
  const request = {
    model: process.env.JEX_JEV_MODEL ?? "jev-latest",
    state: { files: decodedFiles },
    questions,
  };
  if (Buffer.byteLength(JSON.stringify(request)) > REQUEST_CAP)
    return {
      ok: false as const,
      error: new Error("request exceeds 1 MiB cap"),
    };
  return { ok: true as const, value: request };
}

const diagnostic = (message: string): void => {
  process.stderr.write(`jex: ${message.replaceAll(/[\r\n]+/gu, " ")}\n`);
};

export async function classify(
  qPath: string,
  paths: string[],
  preview: boolean,
): Promise<number> {
  const endpoint = jevEndpoint("https://api.typesafe.ai/v1/systemone");
  if (!endpoint.ok) {
    diagnostic(endpoint.error);
    return 2;
  }
  const loaded = await attempt(async () =>
    Bun.TOML.parse(await Bun.file(qPath).text()),
  );
  const q = Questions.safeParse(loaded.ok ? loaded.value : undefined);
  if (!q.success) {
    diagnostic(
      loaded.ok
        ? `invalid questions: ${q.error.message}`
        : errorMessage(loaded.error),
    );
    return 4;
  }
  const built = await buildRequest(q.data, paths);
  if (!built.ok) {
    diagnostic(`cannot read inputs: ${errorMessage(built.error)}`);
    return 4;
  }
  if (preview) {
    process.stdout.write(`${JSON.stringify(built.value)}\n`);
    return 0;
  }
  const post = await postJev(endpoint.value, built.value, 30_000);
  if (!post.ok) {
    diagnostic(post.reason);
    return 3;
  }
  const model = post.model ?? {
    na: true,
    why: "Jev response did not report a usable model",
  };
  const answer = jsonOf(Answer).safeParse(post.text);
  if (!answer.success) {
    process.stdout.write(`${JSON.stringify({ model, bits: [] })}\n`);
    diagnostic(`invalid Jev answer (HTTP ${post.status})`);
    return 4;
  }
  const normalized = Object.entries(answer.data.answers).map(([id, a]) => ({
    id,
    p: a.noul,
    reason: a.reason ?? { na: true as const, why: JSON.stringify(a) },
  }));
  const refuted =
    q.data.refuted_question === undefined
      ? undefined
      : normalized.find((bit) => bit.id === "refuted");
  process.stdout.write(
    `${JSON.stringify({ model, bits: normalized.filter((bit) => bit !== refuted), ...(refuted === undefined ? {} : { refuted: { p: refuted.p, reason: refuted.reason } }) })}\n`,
  );
  const expected = Object.keys(built.value.questions);
  if (
    post.status !== 200 ||
    normalized.length !== expected.length ||
    normalized.some((bit) => !expected.includes(bit.id))
  ) {
    diagnostic(`Jev answer ids or HTTP status mismatch (HTTP ${post.status})`);
    return 4;
  }
  const no = normalized.some((bit) => bit !== refuted && bit.p < 0.5);
  return no || (refuted !== undefined && refuted.p >= 0.5) ? 1 : 0;
}
