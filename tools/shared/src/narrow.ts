// Typed access to untyped JSON for HOOKS — a hook runs before `mise run deps` has necessarily
// restored node_modules, so the only non-builtin it may import is zod.ts, the vendored zod bundle
// beside this file (zero-install). This file is the hook-sized version of a zod schema: readers
// over `unknown` for hooks that narrow by hand.
//
// What it replaces: a hook payload used to be `any` ("kept loose on purpose"), so
// `payload?.tool_input?.command` type-checked whatever it held. The lint floor now forbids `any`
// flowing anywhere, `as` casts, `x is T` guards and `"key" in v` probing, so a hook reads its
// payload through these readers instead. Each takes `unknown` and returns the value only if it
// really has that type, else `undefined` — the lenient behavior hooks already had (an odd payload
// is "no field", never a throw), now with types that are true.
//
// Everything here narrows with typeof / Array.isArray only: no guard functions, no casts.

import { jsonText } from "./zod.ts";

export type Obj = Readonly<Record<string, unknown>>;

/**
 * JSON text -> decoded value, or undefined on invalid JSON. Decoded by the repo's zod codec, so no
 * hook calls JSON.parse itself; parse the result with the readers below.
 */
export const parseJson = (text: string): unknown => {
  const parsed = jsonText.safeParse(text);
  return parsed.success ? parsed.data : undefined;
};

/**
 * A plain object (not null, not an array) as a string-keyed record; else undefined.
 * Keys are copied with defineProperty, never `out[key] = value`: JSON.parse makes "__proto__" an
 * ordinary OWN key, and assigning it to a plain object would swap the prototype, so a hostile
 * payload could make `command` appear to exist through inheritance.
 */
export function obj(v: unknown): Obj | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
  const out: Record<string, unknown> = {};
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

/** Follow `keys` through nested objects: at(p, "tool_input", "command"). undefined if any step is missing or not an object. */
export function at(v: unknown, ...keys: string[]): unknown {
  let cur: unknown = v;
  for (const key of keys) {
    const o = obj(cur);
    // Own keys only: "toString" / "constructor" are not payload fields.
    if (o === undefined || !Object.hasOwn(o, key)) return undefined;
    cur = o[key];
  }
  return cur;
}

/** at() read as a string: strAt(p, "tool_input", "command"). */
export function strAt(v: unknown, ...keys: string[]): string | undefined {
  return str(at(v, ...keys));
}

/** at() read as an array of strings; elements that are not strings are dropped. [] when absent. */
export function strsAt(v: unknown, ...keys: string[]): string[] {
  const list = arr(at(v, ...keys)) ?? [];
  return list.flatMap((item) => {
    const s = str(item);
    return s === undefined ? [] : [s];
  });
}
