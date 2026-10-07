import { describe, expect, test } from "bun:test";
import {
  docsComponents,
  holdsPathBinary,
} from "../reclaim-judgment.ts";
import { projectIsBusy } from "../reclaim-rust-targets.ts";

describe("reclaim:judgment predicates", () => {
  test("skip a project while cargo or rustc has a cwd inside it", () => {
    expect(projectIsBusy("/w/project", ["/w/project/crates/a"])).toBe(true);
    expect(projectIsBusy("/w/project", ["/w/project-fork"])).toBe(false);
  });

  test("skip a target holding a binary resolved from PATH", () => {
    expect(holdsPathBinary("/w/project/target", ["/w/project/target/release/tool"])).toBe(true);
    expect(holdsPathBinary("/w/project/target", ["/usr/local/bin/tool"])).toBe(false);
  });

  test("select only rust-docs documentation components", () => {
    expect(docsComponents([
      "rust-docs-x86_64-unknown-linux-gnu",
      "rust-std-x86_64-unknown-linux-gnu",
      "rust-analyzer",
      "rust-docs-preview",
    ])).toEqual(["rust-docs-x86_64-unknown-linux-gnu", "rust-docs-preview"]);
  });
});
