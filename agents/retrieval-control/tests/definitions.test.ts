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

const loadFromText = (text: string) => {
  const path = join(
    mkdtempSync(join(tmpdir(), "retrieval-")),
    "retrieval.toml",
  );
  writeFileSync(path, text);
  return () => loadRetrievalConfig(path);
};

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
    const strengths = loadRetrievalConfig().match(
      (config) => [
        strengthOf(9, false, config.thresholds.local),
        strengthOf(4.2, true, config.thresholds.local),
        strengthOf(2, true, config.thresholds.local),
        strengthOf(-3, true, config.thresholds.local),
        strengthOf(2.3, true, config.thresholds.jev), // p ~ 0.91
        strengthOf(-0.1, true, config.thresholds.jev), // p < 0.5
      ],
      (error) => [`ERROR: ${error.message}`],
    );
    expect(strengths).toEqual([
      "unranked",
      "strong",
      "likely",
      "none",
      "strong",
      "none",
    ]);
  });
});

describe("retrieval.toml", () => {
  const shipped = readFileSync(
    join(import.meta.dir, "..", "retrieval.toml"),
    "utf8",
  );
  test("the shipped file carries the hardcoded values it replaced (pool since re-measured)", () => {
    const values = loadRetrievalConfig().match(
      (config) => ({
        recall: config.recall,
        pool: config.pool,
        priors: config.priors,
        local: config.thresholds.local,
        jev: config.thresholds.jev,
      }),
      (error) => `ERROR: ${error.message}`,
    );
    expect(values).toEqual({
      recall: 40,
      pool: 25,
      priors: { public: 1, documented: 0.5, private: -1.5, test: -1.5 },
      local: { strong: 4, likely: 1.5, hook: 7.5 },
      jev: { strong: 2.2, likely: 0, hook: 3.5 },
    }); // pool 40 -> 25: bench 2026-10-01
    const endpointUrl = loadRetrievalConfig().match(
      (config) => config.jevEndpoint.url,
      (error) => `ERROR: ${error.message}`,
    );
    const whenExhausted = loadRetrievalConfig().match(
      (config) => config.jevEndpoint.whenExhausted ?? "missing",
      (error) => `ERROR: ${error.message}`,
    );
    expect(endpointUrl).toBe("https://jevtypesafeai.com/api/v1/decide");
    expect(whenExhausted).toContain('jev_provider = "typesafe"');
    // Owner decision 2026-10-01: an exhausted reseller balance points to the official API.
    const officialEndpoint = loadFromText(
      shipped.replace(
        'jev_provider = "jevtypesafeai"',
        'jev_provider = "typesafe"',
      ),
    )().match(
      (config) => config.jevEndpoint,
      (error) => `ERROR: ${error.message}`,
    );
    expect(officialEndpoint).toEqual({
      url: "https://api.typesafe.ai/v1/systemone",
      model: "jev-latest",
    });
  });
  test("a bad value stops and names its key", () => {
    const cases: [string, string, RegExp][] = [
      ["pool = 25", "pool = 41", /definition\.pool must be at most recall/u],
      ["recall = 40", "recall = 0", /definition\.recall must be an integer/u],
      [
        'jev_provider = "jevtypesafeai"',
        'jev_provider = "other"',
        /definition\.jev_provider must be one of/u,
      ],
      [
        'url = "https://api.typesafe.ai/v1/systemone"',
        'url = "http://api.typesafe.ai"',
        /jev_endpoints\.typesafe\.url/u,
      ],
      [
        "hook = 7.5",
        "hook = 3.0",
        /thresholds\.local\.hook must be at least strong/u,
      ],
      [
        "likely = 1.5",
        "likely = 5.0",
        /thresholds\.local\.likely must be below strong/u,
      ],
      [
        "documented = 0.5",
        'documented = "0.5"',
        /priors\.documented must be a finite number/u,
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
      const message = loadFromText(text)().match(
        () => "valid config unexpectedly accepted",
        (error) => error.message,
      );
      expect(message).toMatch(err);
    }
  });
});
