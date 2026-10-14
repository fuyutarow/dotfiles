import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  brewEntries,
  getTool,
  toolDeclaration,
  type ToolHost,
} from "../src/tool-tiers.ts";

const roots: string[] = [];
const linux: ToolHost = { isMac: false, isLinux: true, isWsl: false };
const mac: ToolHost = { isMac: true, isLinux: false, isWsl: false };

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "tool-tiers-"));
  roots.push(root);
  writeFileSync(
    join(root, "Brewfile.core"),
    'brew "bun"\nif OS.linux? && File.read("/proc/sys/kernel/osrelease").match?(/microsoft/iu)\n  brew "codex"\nend\n',
  );
  writeFileSync(
    join(root, "Brewfile.ondemand"),
    'if OS.linux?\n  brew "bubblewrap"\nelse\n  brew "poppler"\nend\nif OS.mac?\n  cask "maccy"\nend\n',
  );
  return root;
}

test("tool declarations resolve tier and formula while honoring OS guards", async () => {
  const root = fixture();
  expect(await toolDeclaration(root, "bun", linux)).toEqual({
    command: "bun",
    tier: "core",
    formula: "bun",
  });
  expect(await toolDeclaration(root, "pdftoppm", mac)).toEqual({
    command: "pdftoppm",
    tier: "ondemand",
    formula: "poppler",
  });
  expect(await toolDeclaration(root, "bwrap", linux)).toEqual({
    command: "bwrap",
    tier: "ondemand",
    formula: "bubblewrap",
  });
  expect(await toolDeclaration(root, "bwrap", mac)).toBeUndefined();
  expect(await toolDeclaration(root, "maccy", mac)).toBeUndefined();
  expect(
    (await brewEntries(root, mac)).map(({ kind, name }) => [kind, name]),
  ).toEqual([
    ["formula", "bun"],
    ["formula", "poppler"],
    ["cask", "maccy"],
  ]);
});

test("tool:get only installs a declared missing formula", async () => {
  const root = fixture();
  const installed: string[] = [];
  const result = await getTool(root, "pdftoppm", {
    host: mac,
    isInstalled: () => false,
    install: (formula) => {
      installed.push(formula);
      return Promise.resolve(0);
    },
  });
  expect(result.status).toBe("installed");
  expect(installed).toEqual(["poppler"]);

  const undeclared = await getTool(root, "maccy", {
    host: mac,
    isInstalled: () => false,
    install: (formula) => {
      installed.push(formula);
      return Promise.resolve(0);
    },
  });
  expect(undeclared.status).toBe("undeclared");
  expect(installed).toEqual(["poppler"]);
});
