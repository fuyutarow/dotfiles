// Readers for untyped JSON values, plus JSON text parsing for consumers that need the zod codec.

import { jsonText } from "./zod.ts";

export type Obj = Readonly<Record<string, unknown>>;

/** A plain object (not null, not an array) as a string-keyed record; else undefined. */
export function obj(v: unknown): Obj | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
  const out: Record<string, unknown> = {};
  // defineProperty preserves an own __proto__ key without changing the reader's prototype.
  for (const entry of Object.entries(v)) {
    Object.defineProperty(out, entry[0], {
      value: entry[1],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

/** An array as a read-only list of unknown; else undefined. */
export function arr(v: unknown): readonly unknown[] | undefined {
  return Array.isArray(v) ? v : undefined;
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

/** Follow own keys through nested objects; undefined if any step is missing or not an object. */
export function at(v: unknown, ...keys: string[]): unknown {
  let cur: unknown = v;
  for (const key of keys) {
    const record = obj(cur);
    if (record === undefined || !Object.hasOwn(record, key)) return undefined;
    cur = record[key];
  }
  return cur;
}

export function strAt(v: unknown, ...keys: string[]): string | undefined {
  return str(at(v, ...keys));
}

/** JSON text -> decoded value, or undefined on invalid JSON. */
export const parseJson = (text: string): unknown => {
  const parsed = jsonText.safeParse(text);
  return parsed.success ? parsed.data : undefined;
};
