import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { declaredProvider, hostKind, windowsArguments } from "../runtime.ts";
import {
  hasManagedDefaultFacade,
  installDesktopFacade,
  launcherContents,
  retireManagedDefaultFacade,
  wslDistroName,
} from "../codex-runtime.ts";
import {
  conptyConfigArgument,
  conptyEnvironment,
  desktopArguments,
  shouldUseConpty,
} from "../codex-wsl.ts";
import { bridgeHooks, deployWindowsAssets } from "../windows-assets.ts";

const repo = join(import.meta.dir, "..", "..", "..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "codex-runtime-"));
  roots.push(root);
  return root;
}

describe("WSL dual Codex runtime", () => {
  test("declares the standalone provider for every host", async () => {
    expect((await declaredProvider(repo, "wsl"))._unsafeUnwrap()).toBe(
      "standalone",
    );
    expect((await declaredProvider(repo, "linux"))._unsafeUnwrap()).toBe(
      "standalone",
    );
    expect((await declaredProvider(repo, "mac"))._unsafeUnwrap()).toBe(
      "standalone",
    );
  });

  test("detects the three supported host kinds", () => {
    expect(hostKind("darwin", "xnu")).toBe("mac");
    expect(hostKind("linux", "6.8.0-microsoft-standard-WSL2")).toBe("wsl");
    expect(hostKind("linux", "6.8.0-generic")).toBe("linux");
  });

  test("preserves argv order and translates only declared path operands", async () => {
    const translated = await windowsArguments(
      [
        "exec",
        "--cd",
        "/work/tree",
        "--image=/tmp/photo.png",
        "--output-last-message",
        "/tmp/final.md",
        "prompt",
        "--",
        "-C",
        "/literal",
      ],
      (value) => `WIN(${value})`,
    );
    expect(translated).toEqual([
      "exec",
      "--cd",
      "WIN(/work/tree)",
      "--image=WIN(/tmp/photo.png)",
      "--output-last-message",
      "WIN(/tmp/final.md)",
      "prompt",
      "--",
      "-C",
      "/literal",
    ]);
  });

  test("facade forwards literal argv through a fake Bun without shell substitutions", () => {
    const root = fixture();
    const marker = join(root, "shell-substitution-ran");
    const fakeBun = join(root, "fake-bun");
    const facade = join(root, "codex");
    const log = join(root, "argv.log");
    const literalDotfiles = `${root}/literal-$dollar-\`touch ${marker}\`-$(touch ${marker})`;
    writeFileSync(
      fakeBun,
      '#!/usr/bin/env sh\nprintf \'%s\\n\' "$@" > "$FAKE_BUN_LOG"\n',
      "utf8",
    );
    chmodSync(fakeBun, 0o755);
    writeFileSync(facade, launcherContents(fakeBun, literalDotfiles), "utf8");
    chmodSync(facade, 0o755);

    const result = Bun.spawnSync([facade, "resume"], {
      env: { ...process.env, FAKE_BUN_LOG: log },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual([
      join(literalDotfiles, "agents/codex/codex-wsl.ts"),
      "resume",
    ]);
    expect(existsSync(marker)).toBe(false);
  });

  test("preserves an explicit --cd without adding a second working directory", async () => {
    expect(
      await desktopArguments(
        "codex.exe",
        "/work/default",
        [
          "exec",
          "--cd",
          "/work/selected",
          "--output-last-message",
          "/tmp/final.md",
        ],
        (value) => `WIN(${value})`,
      ),
    ).toEqual([
      "codex.exe",
      "exec",
      "--cd",
      "WIN(/work/selected)",
      "--output-last-message",
      "WIN(/tmp/final.md)",
    ]);
  });

  test("uses ConPTY only for an interactive UI, not headless command forms", () => {
    expect(shouldUseConpty(true, true, [])).toBe(true);
    expect(shouldUseConpty(false, true, [])).toBe(false);
    expect(shouldUseConpty(true, false, [])).toBe(false);
    for (const args of [
      ["exec"],
      ["--version"],
      ["version"],
      ["--help"],
      ["-h"],
      ["app-server"],
    ])
      expect(shouldUseConpty(true, true, args)).toBe(false);
  });

  test("encodes the ConPTY launch contract as bounded UTF-8 JSON", () => {
    const encoded = conptyConfigArgument({
      executable: "C:\\Program Files\\Codex\\codex.exe",
      args: ["exec", "hello"],
      cwd: "\\\\wsl.localhost\\r99-u26\\home\\fuyu\\Workspace\\firedancer",
      codeXHome: "C:\\Users\\fuyutarow\\.codex",
      cols: 120,
      rows: 40,
    });
    expect(encoded).toBe(
      Buffer.from(
        JSON.stringify({
          executable: "C:\\Program Files\\Codex\\codex.exe",
          args: ["exec", "hello"],
          cwd: "\\\\wsl.localhost\\r99-u26\\home\\fuyu\\Workspace\\firedancer",
          codeXHome: "C:\\Users\\fuyutarow\\.codex",
          cols: 120,
          rows: 40,
        }),
        "utf8",
      ).toString("base64"),
    );
  });

  test("declares the VT ConPTY terminal through WSLENV without disturbing declared transfers", () => {
    expect(
      conptyEnvironment({
        TERM: "xterm-256color",
        WSLENV: "HOME/u:PATH/l",
      }),
    ).toEqual({
      TERM: "xterm-256color",
      WSLENV: "HOME/u:PATH/l:TERM",
    });
    expect(conptyEnvironment({ TERM: "dumb", WSLENV: "TERM/u" })).toEqual({
      TERM: "xterm-256color",
      WSLENV: "TERM/u",
    });
  });

  test("retires only the managed plain facade while keeping standalone releases", async () => {
    const home = fixture();
    const release = join(home, ".codex/packages/standalone/releases/0.1.0");
    const bin = join(home, ".local/bin");
    mkdirSync(release, { recursive: true });
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(release, "codex"), "standalone", "utf8");
    const contents = launcherContents("/opt/bun/bin/bun", "/work/dotfiles");
    writeFileSync(join(bin, "codex"), contents, "utf8");

    expect(await hasManagedDefaultFacade(home)).toBe(true);
    writeFileSync(join(bin, "codex.exe"), "stale desktop facade", "utf8");
    await installDesktopFacade(home, contents);
    expect(await retireManagedDefaultFacade(home)).toBe(true);
    expect(existsSync(release)).toBe(true);
    expect(existsSync(join(bin, "codex"))).toBe(false);
    expect(readFileSync(join(bin, "codex.exe"), "utf8")).toBe(contents);
  });

  test("leaves an unmanaged plain codex executable alone", async () => {
    const home = fixture();
    const bin = join(home, ".local/bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "codex"), "#!/bin/sh\necho user\n", "utf8");

    expect(await hasManagedDefaultFacade(home)).toBe(false);
    expect(await retireManagedDefaultFacade(home)).toBe(false);
    expect(readFileSync(join(bin, "codex"), "utf8")).toContain("echo user");
  });

  test("derives the WSL distro from a wslpath fixture for noninteractive shells", async () => {
    expect(
      await wslDistroName(undefined, () =>
        Promise.resolve("\\\\wsl.localhost\\r99-u26\\"),
      ),
    ).toBe("r99-u26");
  });

  test("bridges only command hooks and leaves unknown hook values intact", () => {
    const result = bridgeHooks(
      {
        hooks: [
          { type: "command", command: "bun hook.ts" },
          { type: "other", command: "keep" },
        ],
      },
      "r99-u26",
      "/home/linuxbrew/.linuxbrew/bin/bun",
      "/home/fuyu/dotfiles/agents/codex/windows-hook.ts",
    );
    expect(JSON.stringify(result)).toContain("wsl.exe");
    expect(JSON.stringify(result)).toContain("r99-u26");
    expect(result).toMatchObject({
      hooks: [{ type: "command" }, { type: "other", command: "keep" }],
    });
  });

  test("backs up an existing skill directory before replacing it with copied contents", async () => {
    const root = fixture();
    const dotfiles = join(root, "dotfiles");
    const home = join(root, "windows-home");
    const linuxHome = join(root, "linux-home");
    const sourceSkill = join(dotfiles, "agents/skills/example");
    mkdirSync(sourceSkill, { recursive: true });
    mkdirSync(join(dotfiles, "agents/commands"), { recursive: true });
    mkdirSync(join(dotfiles, "agents/codex"), { recursive: true });
    mkdirSync(join(linuxHome, ".codex"), { recursive: true });
    writeFileSync(join(sourceSkill, "SKILL.md"), "new skill", "utf8");
    writeFileSync(join(dotfiles, "agents/codex/AGENTS.md"), "guidance", "utf8");
    writeFileSync(
      join(dotfiles, "agents/codex/windows-conpty.cs"),
      "class Program { static int Main() { return 0; } }",
      "utf8",
    );
    writeFileSync(
      join(dotfiles, "agents/commands/prompt.md"),
      "prompt",
      "utf8",
    );
    writeFileSync(join(linuxHome, ".codex/hooks.json"), "{}", "utf8");
    const existing = join(home, ".agents/skills/example");
    mkdirSync(existing, { recursive: true });
    writeFileSync(join(existing, "old.md"), "user content", "utf8");

    const deployed = await deployWindowsAssets(
      dotfiles,
      home,
      linuxHome,
      "r99-u26",
    );
    if (!deployed.ok) return;
    expect(deployed.ok).toBe(true);

    const backups = join(home, ".codex/dotfiles-backups");
    const [stamp] = readdirSync(backups);
    expect(stamp).toBeDefined();
    if (stamp === undefined) return;
    expect(
      readFileSync(
        join(backups, stamp, ".agents/skills/example/old.md"),
        "utf8",
      ),
    ).toBe("user content");
    expect(readFileSync(join(existing, "SKILL.md"), "utf8")).toBe("new skill");
    expect(existsSync(join(existing, "old.md"))).toBe(false);
  });
});
