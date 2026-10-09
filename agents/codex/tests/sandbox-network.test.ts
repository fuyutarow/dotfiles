import { describe, expect, test } from "bun:test";
import { drift, edit, readLive } from "../sandbox-network.ts";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const declared = {
  networkAccess: true,
  modelContextWindow: 1000000,
  modelAutoCompactTokenLimit: 950000,
};

describe("Codex settings convergence", () => {
  test("inserts missing model settings before tables and preserves other bytes", () => {
    const source =
      '# user comment\nother = "unchanged"\n\n[sandbox_workspace_write]\nnetwork_access = true\n';
    const result = edit(source, declared);
    expect(result).toBe(
      '# user comment\nother = "unchanged"\n\nmodel_context_window = 1000000\nmodel_auto_compact_token_limit = 950000\n\n[sandbox_workspace_write]\nnetwork_access = true\n',
    );
  });

  test("updates wrong values and preserves inline comments", () => {
    const source =
      "model_context_window = 100000\nmodel_auto_compact_token_limit = 900000 # retain\n[sandbox_workspace_write]\nnetwork_access = false\n";
    expect(edit(source, declared)).toBe(
      "model_context_window = 1000000\nmodel_auto_compact_token_limit = 950000 # retain\n[sandbox_workspace_write]\nnetwork_access = true\n",
    );
  });

  test("a converged file is a byte-identical no-op", () => {
    const source =
      "# leading\nmodel_context_window = 1000000\nmodel_auto_compact_token_limit = 950000\n[sandbox_workspace_write]\nnetwork_access = true # note\n";
    expect(edit(source, declared)).toBe(source);
    expect(
      drift(declared, {
        contents: source,
        networkAccess: true,
        modelContextWindow: 1000000,
        modelAutoCompactTokenLimit: 950000,
      }),
    ).toEqual([]);
  });

  test("same-named model keys inside tables are not changed", () => {
    const source =
      "[custom]\nmodel_context_window = 123\nmodel_auto_compact_token_limit = 456\n[sandbox_workspace_write]\nnetwork_access = true\n";
    const result = edit(source, declared);
    expect(result).toContain(
      "[custom]\nmodel_context_window = 123\nmodel_auto_compact_token_limit = 456\n",
    );
    expect(result).toContain(
      "model_context_window = 1000000\nmodel_auto_compact_token_limit = 950000\n\n[custom]",
    );
  });

  test("live values are read as TOML top-level keys", async () => {
    const home = mkdtempSync(join(tmpdir(), "codex-settings-"));
    mkdirSync(join(home, ".codex"));
    writeFileSync(
      join(home, ".codex/config.toml"),
      "model_context_window = 1000000\nmodel_auto_compact_token_limit = 950000\n[sandbox_workspace_write]\nnetwork_access = true\n",
    );
    const live = await readLive(home);
    expect(live).not.toBeInstanceOf(Error);
    if (!(live instanceof Error)) expect(drift(declared, live)).toEqual([]);
    expect(readFileSync(join(home, ".codex/config.toml"), "utf8")).toContain(
      "model_context_window",
    );
  });
});
