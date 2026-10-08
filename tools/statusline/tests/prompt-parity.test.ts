import { afterAll, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempDirs, tempHome, tempDir } from "./helpers.ts";

// The statusline's first line copies the zsh PS1 head (user@host:time zone|cwd), but nothing tied
// the two together: on 2026-10-06 the offset was desaturated in one and the owner found the other
// unchanged — 「片方は治しているのに、もう片方に影響がないのはどうなの？」. They stay separate code
// (no forced sharing); this test is the link. It renders BOTH heads for real — zsh from the repo's
// zsh/zshrc, not the deployed copy, using the header _prompt_stamp prints rather than PROMPT's
// input line — and fails when any part's color or text differs (the minute may tick between the
// two renders, so the time's text is not compared, only its color).

const REPO = join(import.meta.dir, "..", "..", "..");
const STATUSLINE = join(import.meta.dir, "..", "src", "statusline.ts");
const SGR = new RegExp(`${String.fromCodePoint(27)}\\[([0-9;]*)m`, "u");

type Part = { color: string; text: string };

/** The visible parts of a line, each with the foreground color it is drawn in. */
function parts(line: string): Part[] {
  const pieces = line.split(SGR);
  const out: Part[] = [];
  let color = "default";
  for (const [i, piece] of pieces.entries()) {
    if (i % 2 === 1) {
      // 0 = reset, 39 = default foreground: the same "no color" in both renderers
      color =
        piece === "0" || piece === "39" || piece === "" ? "default" : piece;
      continue;
    }
    const text = piece.trim();
    if (text !== "") out.push({ color, text });
  }
  return out;
}

const HEAD_PARTS = 8; // user @ host : time zone | cwd

function zshHead(home: string): Part[] {
  const zdot = tempDir("prompt-parity-");
  writeFileSync(
    join(zdot, ".zshrc"),
    `source ${JSON.stringify(join(REPO, "zsh", "zshrc"))}\n`,
  );
  const r = Bun.spawnSync(
    [
      "zsh",
      "-ic",
      'add-zsh-hook -d precmd _prompt_stamp; _prompt_stamp >/dev/null; print -rP -- "$_prompt_header"',
    ],
    {
      cwd: REPO,
      env: { ...process.env, HOME: home, ZDOTDIR: zdot, PWD: REPO },
      timeout: 30_000,
    },
  );
  return parts(r.stdout.toString().split("\n")[0] ?? "").slice(0, HEAD_PARTS);
}

function statuslineHead(home: string): Part[] {
  const r = Bun.spawnSync([process.execPath, STATUSLINE], {
    cwd: REPO,
    stdin: new Blob(["{}"]),
    env: {
      ...process.env,
      HOME: home,
      HERDR_ENV: "0",
      CLAUDE_CODE_EXECPATH: "",
      AGENT_ROUTER_STATE_DIR: join(home, "state"),
      PATH: tempDir("prompt-bin-"),
      PWD: REPO,
      TZ: process.env.TZ ?? "UTC",
    },
    timeout: 30_000,
  });
  return parts(r.stdout.toString().split("\n")[0] ?? "").slice(0, HEAD_PARTS);
}

// part 4 is the time: same color, text may differ by a tick
const comparable = (ps: Part[]): Part[] =>
  ps.map((p, i) => (i === 4 ? { color: p.color, text: "<time>" } : p));

test("the statusline head and the zsh prompt draw each part in the same color", () => {
  const home = tempHome();
  const zsh = zshHead(home);
  const line = statuslineHead(home);
  expect(zsh).toHaveLength(HEAD_PARTS);
  expect(line).toHaveLength(HEAD_PARTS);
  expect(comparable(line)).toEqual(comparable(zsh));
}, 60_000);

afterAll(cleanupTempDirs);
