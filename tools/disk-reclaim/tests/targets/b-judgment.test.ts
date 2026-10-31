import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import { judgmentCandidates } from "../../src/targets/judgment.ts";

const root = tempRoot("disk-reclaim-judgment-");
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

test("judgment owns rust-docs only; Rust target directories belong to rust", async () => {
  const project = join(root, "project");
  const target = join(project, "target");
  const docs = join(root, ".rustup/toolchains/stable/share/doc/rust/html");
  mkdirSync(target, { recursive: true });
  mkdirSync(docs, { recursive: true });
  writeFileSync(join(project, "Cargo.toml"), "[package]\nname='fixture'\n");
  writeFileSync(join(target, "old-artifact"), "fixture");
  const selected = await judgmentCandidates(
    { RUSTUP_HOME: join(root, ".rustup") },
    root,
  );
  expect(selected.map((c) => c.path)).toEqual([docs]);
  expect(selected[0]).toMatchObject({
    verdict: "KEEP",
    reason: "protected: tool installation root",
    action: { argv: [] },
  });
});
