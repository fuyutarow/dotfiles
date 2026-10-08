import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  docsComponents,
  judgmentCandidates,
} from "../../src/targets/judgment.ts";

test("judgment owns rust-docs only; Rust target directories belong to rust", () => {
  const root = mkdtempSync(join(tmpdir(), "disk-reclaim-judgment-"));
  const project = join(root, "project");
  const target = join(project, "target");
  const docs = join(root, ".rustup/toolchains/stable/share/doc/rust/html");
  mkdirSync(target, { recursive: true });
  mkdirSync(docs, { recursive: true });
  writeFileSync(join(project, "Cargo.toml"), "[package]\nname='fixture'\n");
  writeFileSync(join(target, "old-artifact"), "fixture");
  const selected = judgmentCandidates(
    { RUSTUP_HOME: join(root, ".rustup") },
    root,
  );
  expect(selected.map((c) => c.path)).toEqual([docs]);
  expect(selected[0]).toMatchObject({
    verdict: "KEEP",
    reason: "protected: tool installation root",
    action: { argv: [] },
  });
  expect(
    docsComponents([
      "rust-docs-x86_64",
      "rust-std-x86_64",
      "rust-docs-preview",
    ]),
  ).toEqual(["rust-docs-x86_64", "rust-docs-preview"]);
});
