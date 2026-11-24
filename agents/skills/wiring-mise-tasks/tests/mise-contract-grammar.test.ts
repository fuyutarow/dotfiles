import { expect, test } from "bun:test";
import { segmentInversions } from "#scripts/mise-contract.ts";

test("a word that leads one task name and ends another is an inversion", () => {
  expect(
    segmentInversions([
      "testnet:publish",
      "deploy:testnet",
      "localnet:up",
      "dev:localnet",
    ]),
  ).toEqual([
    "localnet(localnet:up,dev:localnet)",
    "testnet(testnet:publish,deploy:testnet)",
  ]);
});

test("object-first names, verify pairs and bare verbs are not inversions", () => {
  expect(
    segmentInversions([
      "check",
      "lint",
      "fmt",
      "fmt:check",
      "check:fast",
      "web:build",
      "web:deploy",
      "docs:build",
      "lint:ts",
      "lint:ts:all",
      "hook:pre-commit",
      // A contract-verb namespace puts its object last on purpose.
      "bun:check",
      "lint:bun",
      "android:line",
      "test:android",
      // A contract verb last is the action on that object.
      "lint:rust",
      "okf:lint",
    ]),
  ).toEqual([]);
});
