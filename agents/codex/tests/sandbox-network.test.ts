import { describe, expect, test } from "bun:test";
import { drift, edit } from "../sandbox-network.ts";

function live(contents: string | null, networkAccess: boolean | null) {
  return { contents, networkAccess };
}

describe("Codex sandbox network config", () => {
  test("drift is empty only when the declared boolean matches live state", () => {
    expect(drift(true, live("", true))).toEqual([]);
    expect(drift(false, live("", false))).toEqual([]);
    expect(drift(true, live(null, null))).toHaveLength(1);
    expect(drift(true, live("", false))).toHaveLength(1);
  });

  test("creates an absent file with the declared table", () => {
    expect(edit(null, true)).toBe(
      "[sandbox_workspace_write]\nnetwork_access = true\n",
    );
  });

  test("appends a table after existing content without changing it", () => {
    const source =
      '# keep this\n[projects]\n"/tmp/a" = { trust_level = "trusted" }\n';
    expect(edit(source, true)).toBe(
      `${source}\n[sandbox_workspace_write]\nnetwork_access = true\n`,
    );
  });

  test("changes false to true and preserves inline comments", () => {
    const source =
      "[sandbox_workspace_write]\nnetwork_access = false # keep comment\n";
    expect(edit(source, true)).toBe(
      "[sandbox_workspace_write]\nnetwork_access = true # keep comment\n",
    );
  });

  test("an already true value is byte-identical", () => {
    const source =
      "# leading\n[sandbox_workspace_write] # table note\nnetwork_access = true  # note\n";
    expect(edit(source, true)).toBe(source);
  });

  test("preserves comments and tables before and after the target table", () => {
    const source =
      '# beginning\n[projects]\nname = "before"\n\n[sandbox_workspace_write]\n# retained\nnetwork_access = false\n\n[tui]\n' +
      "# trailing\n";
    const expected = source.replace(
      "network_access = false",
      "network_access = true",
    );
    expect(edit(source, true)).toBe(expected);
    expect(edit(expected, true)).toBe(expected);
  });

  test("adds a missing assignment inside an existing table before the next table", () => {
    const source = "[sandbox_workspace_write]\n# retained\n\n[tui]\n";
    expect(edit(source, true)).toBe(
      "[sandbox_workspace_write]\n# retained\n\nnetwork_access = true\n[tui]\n",
    );
  });
});
