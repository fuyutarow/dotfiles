import { describe, expect, test } from "bun:test";
import {
  arr,
  at,
  bool,
  num,
  obj,
  parseJson,
  str,
  strAt,
  strsAt,
} from "../narrow.ts";

const payload = parseJson(
  JSON.stringify({
    cwd: "/x",
    tool_input: {
      command: "ls",
      flags: ["-a", 3, "-l", null],
      nested: { deep: 7 },
    },
    flag: true,
    empty: null,
  }),
);

describe("narrow: typed readers over untyped JSON", () => {
  test("parseJson returns what JSON.parse does, and throws on bad JSON like it", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(() => parseJson("{not json")).toThrow();
  });

  test("obj accepts only plain objects", () => {
    expect(obj({ a: 1 })).toEqual({ a: 1 });
    expect(obj([1])).toBeUndefined();
    expect(obj(null)).toBeUndefined();
    expect(obj("s")).toBeUndefined();
    expect(obj(undefined)).toBeUndefined();
  });

  test("scalars: a value of the wrong type is undefined, never coerced", () => {
    expect(str("a")).toBe("a");
    expect(str(1)).toBeUndefined();
    expect(num(1.5)).toBe(1.5);
    expect(num("1")).toBeUndefined();
    expect(num(Number.NaN)).toBeUndefined();
    expect(bool(false)).toBe(false);
    expect(bool(0)).toBeUndefined();
    expect(arr([1])).toEqual([1]);
    expect(arr({})).toBeUndefined();
  });

  test("at / strAt follow nested keys and stop quietly at any missing step", () => {
    expect(at(payload, "tool_input", "nested", "deep")).toBe(7);
    expect(strAt(payload, "tool_input", "command")).toBe("ls");
    expect(strAt(payload, "tool_input", "nope", "command")).toBeUndefined();
    expect(strAt(payload, "cwd", "x")).toBeUndefined(); // "/x" is a string, not an object
    expect(strAt(undefined, "a")).toBeUndefined();
    expect(at(payload)).toEqual(payload); // no keys: the value itself
  });

  test("null and absent are the same absent state for a reader", () => {
    expect(strAt(payload, "empty")).toBeUndefined();
    expect(strAt(payload, "missing")).toBeUndefined();
  });

  test("strsAt keeps only the strings, in order, and is [] when absent", () => {
    expect(strsAt(payload, "tool_input", "flags")).toEqual(["-a", "-l"]);
    expect(strsAt(payload, "tool_input", "command")).toEqual([]);
    expect(strsAt(payload, "nope")).toEqual([]);
  });

  test("a hostile payload cannot reach the prototype", () => {
    // JSON.parse makes "__proto__" an own key; copying it with `out[k] = v` swapped the prototype.
    const hostile = parseJson('{"__proto__": {"command": "x"}, "a": 1}');
    expect(strAt(hostile, "command")).toBeUndefined();
    expect(strAt(hostile, "__proto__", "command")).toBe("x"); // still readable as the plain key it is
    expect(at(payload, "toString")).toBeUndefined();
    expect(at(payload, "constructor")).toBeUndefined();
  });
});
