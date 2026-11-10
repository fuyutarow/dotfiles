import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { err, ok } from "neverthrow";
import {
  claudeCreditsMarkerPath,
  readClaudeCreditsMarker,
} from "../src/claude-credits.ts";
import { rateRow } from "../src/rate-limits.ts";
import { ESC, RST } from "../src/ansi.ts";

const stripAnsi = (value: string): string =>
  value.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");

const NOW = 1791496800; // epoch seconds, injected into every render below
const DAY = 24 * 60 * 60;
const scratch = await mkdtemp(join(tmpdir(), "claude-credits-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));

/** A fresh XDG state dir per case; `ageSeconds` undefined = marker absent. */
async function stateDirWithMarker(
  name: string,
  ageSeconds: number | undefined,
): Promise<string> {
  const stateDir = join(scratch, name);
  await mkdir(join(stateDir, "agx"), { recursive: true });
  if (ageSeconds !== undefined) {
    const marker = join(stateDir, "agx", "claude-credits-unavailable");
    await writeFile(marker, "");
    await utimes(marker, NOW - ageSeconds, NOW - ageSeconds);
  }
  return stateDir;
}

/** The statusline's own wiring: read the marker at its path, then render the Rate row at NOW. */
async function rowWithMarker(stateDir: string): Promise<string> {
  const credits = await readClaudeCreditsMarker(
    join(stateDir, "agx", "claude-credits-unavailable"),
  );
  return rateRow(
    {
      rlModel: [],
      codexRate: {
        windows: [{ minutes: 10080, percent: 12 }],
        credits: "1234",
        mtimeMs: NOW * 1000,
      },
      claudeCredits: credits,
    },
    NOW,
  );
}

describe("Anthropic API credit token on the Rate row", () => {
  test("absent marker: `claude api n/a` after the codex credits part", async () => {
    const row = await rowWithMarker(
      await stateDirWithMarker("absent", undefined),
    );
    expect(stripAnsi(row)).toContain("codex credits 1234 · claude api n/a");
    expect(stripAnsi(row)).not.toContain("out→sub");
    expect(row).toContain(`${ESC}[2mn/a (no balance source)${RST}`);
  });

  test("marker 1 h old: exhausted token in the warning colour", async () => {
    const row = await rowWithMarker(await stateDirWithMarker("hour", 3600));
    expect(stripAnsi(row)).toContain("codex credits 1234 · claude api out→sub");
    expect(stripAnsi(row)).not.toContain("claude api n/a");
    expect(row).toContain(`${ESC}[38;5;178mout→sub${RST}`);
  });

  test("marker exactly 24 h old: back to `claude api n/a`", async () => {
    const row = await rowWithMarker(await stateDirWithMarker("day", DAY));
    expect(stripAnsi(row)).toContain("codex credits 1234 · claude api n/a");
    expect(stripAnsi(row)).not.toContain("out→sub");
  });

  test("marker one second under 24 h old is still exhausted", async () => {
    const row = await rowWithMarker(
      await stateDirWithMarker("day-minus-1", DAY - 1),
    );
    expect(stripAnsi(row)).toContain("claude api out→sub");
  });

  test("the token never renders a number, whatever the marker age", async () => {
    for (const age of [undefined, 1, 3600, DAY - 1, DAY, 10 * DAY]) {
      const row = stripAnsi(
        await rowWithMarker(await stateDirWithMarker(`num-${age}`, age)),
      );
      expect(row).toMatch(/claude api (n\/a|out→sub)/u);
      expect(row).not.toMatch(/claude api [^|·]*\d/u);
    }
  });

  test("an unreadable marker is a failure n/a with its reason, not a silent absence", () => {
    const row = stripAnsi(
      rateRow(
        {
          rlModel: [],
          claudeCredits: err("claude credits marker unreadable"),
        },
        NOW,
      ),
    );
    expect(row).toContain("claude api n/a");
  });

  test("the marker path follows XDG_STATE_HOME, falling back to ~/.local/state", () => {
    expect(claudeCreditsMarkerPath({ XDG_STATE_HOME: "/x/state" })).toBe(
      "/x/state/agx/claude-credits-unavailable",
    );
    expect(claudeCreditsMarkerPath({ XDG_STATE_HOME: "", HOME: "/h" })).toBe(
      "/h/.local/state/agx/claude-credits-unavailable",
    );
    expect(claudeCreditsMarkerPath({ HOME: "/h" })).toBe(
      "/h/.local/state/agx/claude-credits-unavailable",
    );
  });

  test("readClaudeCreditsMarker reports an absent marker as ok(undefined)", async () => {
    const result = await readClaudeCreditsMarker(
      join(scratch, "no-such-dir", "claude-credits-unavailable"),
    );
    expect(result).toEqual(ok(undefined));
  });
});
