import { describe, expect, test } from "bun:test";
import { definitionsIn } from "../suggest-existing-definition.ts";

describe("new-definition detection", () => {
  test("julia long and short forms, with the comment above as context", () => {
    const text =
      "# clamp instead of wrap\nfunction clamp_add16(a, b)\n  a + b\nend\nsq(x) = x * x\ny = f(1)\n";
    const found = definitionsIn(text, "jl");
    expect(found.map((d) => d.name).sort()).toEqual(["clamp_add16", "sq"]);
    expect(found.find((d) => d.name === "clamp_add16")?.text).toContain(
      "clamp instead of wrap",
    );
  });
  test("a call is not a definition", () => {
    expect(
      definitionsIn("  result = compute(x)\nprintln(result)\n", "jl"),
    ).toEqual([]);
  });
  test("ts/py/rs headers", () => {
    expect(
      definitionsIn("export async function load(p: string) {\n}\n", "ts").map(
        (d) => d.name,
      ),
    ).toEqual(["load"]);
    expect(
      definitionsIn("def parse(s):\n    pass\n", "py").map((d) => d.name),
    ).toEqual(["parse"]);
    expect(
      definitionsIn("pub fn add(a: i32) -> i32 {\n}\n", "rs").map(
        (d) => d.name,
      ),
    ).toEqual(["add"]);
  });
});
