// Pure parts of the definition route and its hook. The end-to-end yardstick is
// bench-definitions.ts against a real catalog (README "Measurements"); these pin the rules that
// decide what a card says and what counts as internal.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  firstLine,
  isPrivate,
  isTest,
  loadRetrievalConfig,
  strengthOf,
} from "../definitions.ts";

describe("definition cards", () => {
  test("the doc line skips a signature copy and rulers", () => {
    const doc =
      "    saturating_add(a::T, b::T) where {T<:Signed} -> T\n\n-----\nAdd two signed integers, clamping.";
    expect(firstLine("saturating_add", doc)).toBe(
      "Add two signed integers, clamping.",
    );
  });
  test("internal by convention: leading underscore or a kernel/impl/inner/helper suffix", () => {
    for (const name of [
      "_rows",
      "residual_add_flag_kernel!",
      "parse_impl",
      "walk_inner",
      "fmt_helper",
    ])
      expect(isPrivate({ name })).toBe(true);
    for (const name of ["residual_add_flag!", "kernelize", "impl_trait_for"])
      expect(isPrivate({ name })).toBe(false);
  });
  test("test files are recognised by path, not by name", () => {
    expect(isTest({ file: "packages/X/test/round.jl" })).toBe(true);
    expect(isTest({ file: "src/a.test.ts" })).toBe(true);
    expect(isTest({ file: "src/testing_utils.jl" })).toBe(false);
  });
  test("without a judge nothing is judged; with one, its thresholds decide", () => {
    const local = loadRetrievalConfig().thresholds.local;
    const jev = loadRetrievalConfig().thresholds.jev;
    expect(strengthOf(9, false, local)).toBe("unranked");
    expect(strengthOf(4.2, true, local)).toBe("strong");
    expect(strengthOf(2, true, local)).toBe("likely");
    expect(strengthOf(-3, true, local)).toBe("none");
    expect(strengthOf(2.3, true, jev)).toBe("strong"); // p ~ 0.91
    expect(strengthOf(-0.1, true, jev)).toBe("none"); // p < 0.5
  });
});

describe("retrieval.toml", () => {
  const shipped = readFileSync(
    join(import.meta.dir, "..", "retrieval.toml"),
    "utf8",
  );
  const load = (text: string) => {
    const path = join(
      mkdtempSync(join(tmpdir(), "retrieval-")),
      "retrieval.toml",
    );
    writeFileSync(path, text);
    return () => loadRetrievalConfig(path);
  };
  test("the shipped file carries exactly the values that were hardcoded before", () => {
    const c = loadRetrievalConfig();
    expect([c.recall, c.pool]).toEqual([40, 40]);
    expect(c.priors).toEqual({
      public: 1,
      documented: 0.5,
      private: -1.5,
      test: -1.5,
    });
    expect(c.thresholds.local).toEqual({ strong: 4, likely: 1.5, hook: 7.5 });
    expect(c.thresholds.jev).toEqual({ strong: 2.2, likely: 0, hook: 3.5 });
    expect(c.jevEndpoint).toEqual({
      url: "https://jevtypesafeai.com/api/v1/decide",
    });
    expect(
      load(
        shipped.replace(
          'jev_provider = "jevtypesafeai"',
          'jev_provider = "typesafe"',
        ),
      )().jevEndpoint,
    ).toEqual({
      url: "https://api.typesafe.ai/v1/systemone",
      model: "jev-latest",
    });
  });
  test("a bad value stops and names its key", () => {
    const cases: [string, string, RegExp][] = [
      ["pool = 40", "pool = 41", /definition\.pool must be at most recall/],
      ["recall = 40", "recall = 0", /definition\.recall must be an integer/],
      [
        'jev_provider = "jevtypesafeai"',
        'jev_provider = "other"',
        /definition\.jev_provider must be one of/,
      ],
      [
        'url = "https://api.typesafe.ai/v1/systemone"',
        'url = "http://api.typesafe.ai"',
        /jev_endpoints\.typesafe\.url/,
      ],
      [
        "hook = 7.5",
        "hook = 3.0",
        /thresholds\.local\.hook must be at least strong/,
      ],
      [
        "likely = 1.5",
        "likely = 5.0",
        /thresholds\.local\.likely must be below strong/,
      ],
      [
        "documented = 0.5",
        'documented = "0.5"',
        /priors\.documented must be a finite number/,
      ],
    ];
    for (const [from, to, err] of cases) {
      expect(shipped.includes(from)).toBe(true);
      const text = from.startsWith("url")
        ? shipped
            .replace(from, to)
            .replace(
              'jev_provider = "jevtypesafeai"',
              'jev_provider = "typesafe"',
            )
        : shipped.replace(from, to);
      expect(load(text)).toThrow(err);
    }
  });
});
