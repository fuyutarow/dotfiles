import { open } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import { jsonOf, z } from "../zod.ts";

// Project only the settings envelope, validating JSON syntax without retaining
// assistant text, instructions or arrays. Bounds apply to memory, not file length.
const CHUNK_BYTES = 64 * 1024;
const MAX_TOKEN_CHARS = 64 * 1024;
const MAX_DEPTH = 128;
const PATHS = new Set([
  "",
  "type",
  "payload",
  "payload.type",
  "payload.model",
  "payload.effort",
  "payload.reasoning_effort",
  "payload.thread_settings",
  "payload.thread_settings.model",
  "payload.thread_settings.reasoning_effort",
]);
type Frame = {
  kind: "object" | "array";
  state: "keyOrEnd" | "key" | "colon" | "value" | "valueOrEnd" | "commaOrEnd";
  path: string | undefined;
  key: string | undefined;
};
type Projection = Map<string, unknown>;
const STRING = jsonOf(z.string());

class Projector {
  private frames: Frame[] = [];
  private fields: Projection = new Map();
  private done = false;
  private invalid = false;
  private string = false;
  private escaped = false;
  private unicode = 0;
  private raw = "";
  private capture = false;
  private primitive = "";
  private numberState = "";
  private literalIndex = 0;

  *feed(text: string): Generator<Projection> {
    for (const char of text) {
      if (char === "\n") {
        yield* this.finishLine();
      } else if (!this.invalid) this.character(char);
    }
  }

  private *finishLine(): Generator<Projection> {
    const result = this.finish();
    if (result !== undefined) yield result;
    this.reset();
  }

  finish(): Projection | undefined {
    if (this.primitive !== "") this.endPrimitive();
    return !this.invalid &&
      !this.string &&
      this.done &&
      this.frames.length === 0
      ? this.fields
      : undefined;
  }

  private reset(): void {
    this.frames = [];
    this.fields = new Map();
    this.done = false;
    this.invalid = false;
    this.string = false;
    this.escaped = false;
    this.unicode = 0;
    this.raw = "";
    this.capture = false;
    this.primitive = "";
    this.numberState = "";
    this.literalIndex = 0;
  }

  private valuePath(): string | undefined {
    const frame = this.frames.at(-1);
    if (frame === undefined) return this.done ? undefined : "";
    if (
      frame.kind !== "object" ||
      frame.path === undefined ||
      frame.key === undefined
    )
      return undefined;
    // Dotted/empty JSON keys are literal keys, never aliases for selected paths.
    if (frame.key === "" || frame.key.includes(".")) return undefined;
    const path = frame.path === "" ? frame.key : `${frame.path}.${frame.key}`;
    return PATHS.has(path) ? path : undefined;
  }

  private expectsValue(): boolean {
    const frame = this.frames.at(-1);
    return frame === undefined
      ? !this.done
      : frame.state === "value" || frame.state === "valueOrEnd";
  }

  private put(path: string | undefined, value: unknown): void {
    if (path === undefined) return;
    // JSON duplicate keys have last-value semantics, including replaced containers.
    for (const key of this.fields.keys()) {
      if (key === path || key.startsWith(`${path}.`)) this.fields.delete(key);
    }
    this.fields.set(path, value);
  }

  private completed(): void {
    const frame = this.frames.at(-1);
    if (frame === undefined) this.done = true;
    else frame.state = "commaOrEnd";
  }

  private character(char: string): void {
    if (this.string) {
      this.stringCharacter(char);
      return;
    }
    if (this.primitive !== "") {
      if (!/[\s,}\]]/u.test(char)) {
        this.primitiveCharacter(char);
        return;
      }
      this.endPrimitive();
      if (this.invalid) return;
    }
    if (/^[\t\r ]$/u.test(char)) return;
    const frame = this.frames.at(-1);
    if (char === '"') {
      const key = frame?.state === "key" || frame?.state === "keyOrEnd";
      if (!key && !this.expectsValue()) {
        this.invalid = true;
        return;
      }
      this.string = true;
      this.capture = key || this.valuePath() !== undefined;
      this.raw = this.capture ? '"' : "";
    } else if (char === "{" || char === "[") {
      if (!this.expectsValue() || this.frames.length >= MAX_DEPTH) {
        this.invalid = true;
        return;
      }
      const path = this.valuePath();
      this.put(path, char === "{" ? {} : []);
      this.frames.push({
        kind: char === "{" ? "object" : "array",
        state: char === "{" ? "keyOrEnd" : "valueOrEnd",
        path,
        key: undefined,
      });
    } else if (char === "}" || char === "]") {
      const kind = char === "}" ? "object" : "array";
      const empty =
        frame?.state === "keyOrEnd" || frame?.state === "valueOrEnd";
      if (frame?.kind !== kind || (!empty && frame.state !== "commaOrEnd")) {
        this.invalid = true;
        return;
      }
      this.frames.pop();
      this.completed();
    } else if (char === ":") {
      if (frame?.state !== "colon") this.invalid = true;
      else frame.state = "value";
    } else if (char === ",") {
      if (frame?.state !== "commaOrEnd") this.invalid = true;
      else {
        frame.state = frame.kind === "object" ? "key" : "value";
        frame.key = undefined;
      }
    } else {
      if (!this.expectsValue()) {
        this.invalid = true;
        return;
      }
      this.primitive = char === "t" ? "true" : "";
      if (char === "f") this.primitive = "false";
      if (char === "n") this.primitive = "null";
      if (this.primitive !== "") this.literalIndex = 1;
      else {
        this.primitive = "number";
        this.numberState = "start";
        this.primitiveCharacter(char);
      }
    }
  }

  private stringCharacter(char: string): void {
    this.captureCharacter(char);
    if (this.unicode > 0) {
      if (!/^[0-9a-f]$/iu.test(char)) this.invalid = true;
      this.unicode--;
    } else if (this.escaped) {
      if (char === "u") this.unicode = 4;
      else if (!'"\\/bfnrt'.includes(char)) this.invalid = true;
      this.escaped = false;
    } else if (char === "\\") this.escaped = true;
    else if (char === '"') {
      this.string = false;
      const parsed = this.capture ? STRING.safeParse(this.raw) : undefined;
      const value = parsed?.success === true ? parsed.data : undefined;
      const frame = this.frames.at(-1);
      if (frame?.state === "key" || frame?.state === "keyOrEnd") {
        frame.key = value;
        frame.state = "colon";
      } else {
        this.put(this.valuePath(), value);
        this.completed();
      }
      this.raw = "";
    } else if ((char.codePointAt(0) ?? 0) < 32) this.invalid = true;
  }

  private captureCharacter(char: string): void {
    if (!this.capture) return;
    this.raw += char;
    if (this.raw.length <= MAX_TOKEN_CHARS) return;
    const frame = this.frames.at(-1);
    if (frame?.state === "key" || frame?.state === "keyOrEnd") {
      this.capture = false;
      this.raw = "";
    } else this.invalid = true;
  }

  private primitiveCharacter(char: string): void {
    if (this.primitive !== "number") {
      if (this.primitive[this.literalIndex] !== char) this.invalid = true;
      this.literalIndex++;
      return;
    }
    const digit = /^[0-9]$/u.test(char);
    const state = this.numberState;
    if (state === "start" && char === "-") this.numberState = "sign";
    else if ((state === "start" || state === "sign") && digit)
      this.numberState = char === "0" ? "zero" : "integer";
    else if (state === "integer" && digit) this.numberState = state;
    else if ((state === "zero" || state === "integer") && char === ".")
      this.numberState = "dot";
    else if (state === "dot" && digit) this.numberState = "fraction";
    else if ((state === "fraction" || state === "exponentDigits") && digit)
      this.numberState = state;
    else if (
      ["zero", "integer", "fraction"].includes(state) &&
      /^[eE]$/u.test(char)
    )
      this.numberState = "exponent";
    else if (state === "exponent" && /^[+-]$/u.test(char))
      this.numberState = "exponentSign";
    else if ((state === "exponent" || state === "exponentSign") && digit)
      this.numberState = "exponentDigits";
    else this.invalid = true;
  }

  private endPrimitive(): void {
    const valid =
      this.primitive === "number"
        ? ["zero", "integer", "fraction", "exponentDigits"].includes(
            this.numberState,
          )
        : this.literalIndex === this.primitive.length;
    if (!valid) this.invalid = true;
    this.put(this.valuePath(), undefined); // settings accept strings only
    this.primitive = "";
    this.completed();
  }
}

/** Validate an already observed prefix before treating growth as an append. */
export async function hashSettingsPrefix(
  path: string,
  end: number,
  deadline: number,
) {
  await using file = await open(path, "r");
  const hash = new Bun.CryptoHasher("sha256");
  const chunk = Buffer.alloc(CHUNK_BYTES);
  let offset = 0;
  while (offset < end && performance.now() < deadline) {
    const { bytesRead } = await file.read(
      chunk,
      0,
      Math.min(CHUNK_BYTES, end - offset),
      offset,
    );
    if (bytesRead === 0) return null;
    hash.update(chunk.subarray(0, bytesRead));
    offset += bytesRead;
  }
  return offset === end
    ? { hash, digest: hash.copy().digest("hex") }
    : undefined;
}

const envelope = (fields: Projection) => ({
  type: fields.get("type"),
  payload: {
    type: fields.get("payload.type"),
    model: fields.get("payload.model"),
    effort: fields.get("payload.effort"),
    reasoning_effort: fields.get("payload.reasoning_effort"),
    thread_settings: {
      model: fields.get("payload.thread_settings.model"),
      reasoning_effort: fields.get("payload.thread_settings.reasoning_effort"),
    },
  },
});

/** Stream compact validated settings envelopes from a fixed source snapshot. */
export async function* readCodexSettingsEvents(
  path: string,
  size: number,
  deadline: number,
  start = 0,
  hash: Bun.CryptoHasher = new Bun.CryptoHasher("sha256"),
) {
  await using file = await open(path, "r");
  const decoder = new StringDecoder("utf8");
  const projector = new Projector();
  const chunk = Buffer.alloc(CHUNK_BYTES);
  let offset = start;
  let completeOffset = start;
  let completeDigest = hash.copy().digest("hex");
  while (offset < size && performance.now() < deadline) {
    const { bytesRead } = await file.read(
      chunk,
      0,
      Math.min(CHUNK_BYTES, size - offset),
      offset,
    );
    if (bytesRead === 0) return;
    const part = chunk.subarray(0, bytesRead);
    const newline = part.lastIndexOf(10);
    if (newline >= 0) {
      hash.update(part.subarray(0, newline + 1));
      completeOffset = offset + newline + 1;
      completeDigest = hash.copy().digest("hex");
      hash.update(part.subarray(newline + 1));
    } else hash.update(part);
    offset += bytesRead;
    for (const fields of projector.feed(decoder.write(part)))
      yield envelope(fields);
  }
  if (offset < size) return;
  for (const fields of projector.feed(decoder.end())) yield envelope(fields);
  const final = projector.finish();
  if (final !== undefined)
    yield { ...envelope(final), settings_final_line: true };
  // Completion is explicit: a budget/short-read must not expose a partially folded head.
  yield {
    type: "settings_scan_complete",
    offset: completeOffset,
    digest: completeDigest,
  };
}
