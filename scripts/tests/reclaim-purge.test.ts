// scripts/reclaim-purge.ts against FIXTURE graveyards only (GRAVEYARD, XDG_DATA_HOME and HOME point
// into a temp dir — the real ones are never touched). The answer is typed into a real pty
// (Bun.Terminal, 40 columns — a narrow pane): the confirmation is human-only, so a "yes" piped into
// stdin must be refused. The case that matters most: after the answer the process EXITS. Until
// 2026-10-06 it read the answer with process.stdin.once("data"), which kept stdin open, so a
// finished purge printed "✅ purge 完了" and then hung.
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "reclaim-purge.ts");
const ANSI = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;?]*[A-Za-z]`, "gu");
const HANG_MS = 20_000; // a hang is the bug under test: it must not pass by waiting forever

function fixture(): { root: string; env: Record<string, string> } {
  const root = mkdtempSync(join(tmpdir(), "purge-"));
  mkdirSync(join(root, "g"));
  mkdirSync(join(root, "xdg", "Trash", "files"), { recursive: true });
  mkdirSync(join(root, "xdg", "Trash", "info"), { recursive: true });
  mkdirSync(join(root, "home"));
  writeFileSync(join(root, "g", "a"), "junk\n");
  return {
    root,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: join(root, "home"),
      GRAVEYARD: join(root, "g"),
      XDG_DATA_HOME: join(root, "xdg"),
      USER: "purge-test",
    },
  };
}

/** Run the purge in a 40-column pty; type `keys` once the prompt is on screen. */
async function purgeTty(
  keys: string,
  env: Record<string, string>,
): Promise<{ code: number; out: string }> {
  let raw = "";
  let typed = false;
  const decoder = new TextDecoder();
  await using terminal = new Bun.Terminal({
    cols: 40,
    rows: 24,
    data(term, data) {
      raw += decoder.decode(data, { stream: true });
      if (!typed && raw.includes("yes と入力")) {
        typed = true;
        term.write(keys);
      }
    },
  });
  const proc = Bun.spawn(["bun", SCRIPT], { env, terminal });
  const code = await Promise.race([
    proc.exited,
    Bun.sleep(HANG_MS).then(() => {
      proc.kill();
      return -1;
    }),
  ]);
  return { code, out: raw.replace(ANSI, "") };
}

test("yes typed at a terminal: the graveyard is emptied and the process exits 0 (does not hang)", async () => {
  const { root, env } = fixture();
  const r = await purgeTty("yes\r", env);
  expect(r.code).toBe(0);
  expect(r.out).toContain("✅ purge 完了");
  expect(existsSync(join(root, "g", "a"))).toBe(false);
  expect(existsSync(join(root, "g"))).toBe(true); // the directory itself survives
});

test("yes: the delete reports what it removed, every counted entry", async () => {
  const { root, env } = fixture();
  mkdirSync(join(root, "g", "d", "e"), { recursive: true });
  writeFileSync(join(root, "g", "d", "e", "f"), "junk\n");
  const r = await purgeTty("yes\r", env);
  expect(r.code).toBe(0);
  // a + d + d/e + d/e/f = 4 entries
  expect(r.out).toContain("rip graveyard: 4 件を削除しました");
});

test("anything but yes, and Esc, abort with exit 1 and remove nothing", async () => {
  for (const keys of ["no\r", "\r", "\u001B"]) {
    const { root, env } = fixture();
    const r = await purgeTty(keys, env);
    expect([keys, r.code]).toEqual([keys, 1]);
    expect(r.out).toContain("中止しました");
    expect(existsSync(join(root, "g", "a"))).toBe(true);
  }
});

test("a yes piped into stdin is refused: the confirmation is human-only", () => {
  for (const answer of ["yes\n", ""]) {
    const { root, env } = fixture();
    const r = Bun.spawnSync(["bun", SCRIPT], {
      stdin: new Blob([answer]),
      env,
      timeout: HANG_MS,
    });
    expect([answer, r.exitCode]).toEqual([answer, 1]);
    expect(r.stdout.toString()).toContain("人間専用です");
    expect(existsSync(join(root, "g", "a"))).toBe(true);
  }
});
