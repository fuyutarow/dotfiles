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
const wsl: ToolHost = { isMac: false, isLinux: true, isWsl: true };
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
    'brew "bun"\nif OS.linux? && File.read("/proc/sys/kernel/osrelease").match?(/microsoft/iu)\n  cask "codex"\nend\n',
  );
  writeFileSync(
    join(root, "Brewfile.ondemand"),
    'if OS.linux?\n  brew "bubblewrap"\nelse\n  brew "poppler"\nend\nbrew "git-lfs"\nif OS.mac?\n  cask "maccy"\nend\n',
  );
  return root;
}

test("tool declarations resolve tier and formula while honoring OS guards", async () => {
  const root = fixture();
  expect(await toolDeclaration(root, "bun", linux)).toEqual({
    command: "bun",
    tier: "core",
    kind: "formula",
    package: "bun",
  });
  expect(await toolDeclaration(root, "pdftoppm", mac)).toEqual({
    command: "pdftoppm",
    tier: "ondemand",
    kind: "formula",
    package: "poppler",
  });
  expect(await toolDeclaration(root, "bwrap", linux)).toEqual({
    command: "bwrap",
    tier: "ondemand",
    kind: "formula",
    package: "bubblewrap",
  });
  expect(await toolDeclaration(root, "git-lfs", linux)).toEqual({
    command: "git-lfs",
    tier: "ondemand",
    kind: "formula",
    package: "git-lfs",
  });
  expect(await toolDeclaration(root, "codex", wsl)).toEqual({
    command: "codex",
    tier: "core",
    kind: "cask",
    package: "codex",
  });
  expect(await toolDeclaration(root, "bwrap", mac)).toBeUndefined();
  expect(await toolDeclaration(root, "maccy", mac)).toBeUndefined();
  expect(
    (await brewEntries(root, mac)).map(({ kind, name }) => [kind, name]),
  ).toEqual([
    ["formula", "bun"],
    ["formula", "poppler"],
    ["formula", "git-lfs"],
    ["cask", "maccy"],
  ]);
});

test("tool:get only installs a declared missing formula", async () => {
  const root = fixture();
  const installed: string[] = [];
  const result = await getTool(root, "pdftoppm", {
    host: mac,
    isInstalled: () => false,
    install: (_kind, packageName) => {
      installed.push(packageName);
      return Promise.resolve(0);
    },
  });
  expect(result.status).toBe("installed");
  expect(installed).toEqual(["poppler"]);

  const undeclared = await getTool(root, "maccy", {
    host: mac,
    isInstalled: () => false,
    install: (_kind, packageName) => {
      installed.push(packageName);
      return Promise.resolve(0);
    },
  });
  expect(undeclared.status).toBe("undeclared");
  expect(installed).toEqual(["poppler"]);

  const gitLfs = await getTool(root, "git-lfs", {
    host: linux,
    isInstalled: () => false,
    install: (_kind, packageName) => {
      installed.push(packageName);
      return Promise.resolve(0);
    },
  });
  expect(gitLfs).toEqual({
    status: "installed",
    declaration: {
      command: "git-lfs",
      tier: "ondemand",
      kind: "formula",
      package: "git-lfs",
    },
  });
  expect(installed).toEqual(["poppler", "git-lfs"]);
});

test("tool:get preserves cask ownership for a declared cask command", async () => {
  const root = fixture();
  const installs: string[] = [];
  const result = await getTool(root, "codex", {
    host: wsl,
    isInstalled: () => false,
    install: (kind, packageName) => {
      installs.push(`${kind}:${packageName}`);
      return Promise.resolve(0);
    },
  });
  expect(result).toEqual({
    status: "installed",
    declaration: {
      command: "codex",
      tier: "core",
      kind: "cask",
      package: "codex",
    },
  });
  expect(installs).toEqual(["cask:codex"]);
});
