// Typed access to untyped JSON for HOOKS — zero-dep (not even node:), because a hook runs before
// `mise run deps` has necessarily restored node_modules and so can import nothing but node:/bun:
// (writing-bun-scripts BG3: "Hooks: no imports beyond node:/bun:, ever"). That is why hooks cannot
// use zod, the house tool for this; this file is the hook-sized version of the same idea.
//
// What it replaces: a hook payload used to be `any` ("kept loose on purpose"), so
// `payload?.tool_input?.command` type-checked whatever it held. The lint floor now forbids `any`
// flowing anywhere, `as` casts, `x is T` guards and `"key" in v` probing, so a hook reads its
// payload through these readers instead. Each takes `unknown` and returns the value only if it
// really has that type, else `undefined` — the lenient behavior hooks already had (an odd payload
// is "no field", never a throw), now with types that are true.
//
// Everything here narrows with typeof / Array.isArray only: no guard functions, no casts.

export type Obj = Readonly<Record<string, unknown>>;

/** JSON text -> unknown. The one place hooks call JSON.parse; parse the result with the readers below. */
export const parseJson = (text: string): unknown => JSON.parse(text);

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
