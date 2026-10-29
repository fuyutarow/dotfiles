// The search-route gate judges shell SYNTAX (2026-10-06, case 4): `rr … | grep -F -e '<pat>'` is the
// documented display filter whatever characters the quoted words hold, and raw search stays denied.
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { decisionOf, runHook, tempDir } from "./helpers.ts";

const HOOK = "enforce-search-route.ts";

function project(): { cwd: string; env: Record<string, string> } {
  const cwd = tempDir("search-route-syntax-");
  mkdirSync(join(cwd, ".cocoindex_code"), { recursive: true });
  writeFileSync(join(cwd, ".cocoindex_code", "settings.yml"), "x: 1\n");
  const bin = tempDir("search-route-syntax-bin-");
  writeFileSync(join(bin, "ccc"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(bin, "ccc"), 0o755);
  return { cwd, env: { PATH: `${bin}:${process.env["PATH"] ?? ""}` } };
}

const verdict = (command: string): string | undefined => {
  const { cwd, env } = project();
  const r = runHook(
    HOOK,
    { tool_name: "Bash", tool_input: { command }, cwd },
    env,
  );
  expect(r.code).toBe(0);
  return decisionOf(r.stdout)?.permissionDecision;
};

describe("search-route reads syntax, not text", () => {
  test("a router stream filtered by ONE grep is allowed, any quoted words", () => {
    for (const command of [
      `rr text '<x>' 2>&1 | grep -F -e '.ts:'`,
      `rr text 'Promise<void>' 2>&1 | grep -F -e '.ts:' | head -20`,
      `rr regex 'a|b' 2>/dev/null | rg -e 'x y' | tail -n 5`,
      `rr text "needle \\"q\\"" | grep -i -- 'foo>bar'`,
      `cd agents && rr files '**/*.ts' | grep -F -e 'hooks/'`,
      `rr about '意味 <JA>' 2>&1 | grep -v -e 'tests/'`,
    ])
      expect(verdict(command)).toBeUndefined();
  });

  test("non-search command output can be filtered with any grep/rg flags", () => {
    for (const command of [
      `agx worker run /tmp/ticket.md 2>&1 | grep -E 'a|b'`,
      `agx worker run /tmp/ticket.md --json | jq -r .x | rg -i y | head`,
      `journalctl -u service | rg -v x | head`,
      `jj log --limit 10 | rg -E -v -i 'foo|bar'`,
      `bun test agents/hooks/tests | rg -v 'pass' | head -n 20`,
      `printf '%s\\n' a b | grep -e a -e b`,
    ])
      expect(verdict(command)).toBeUndefined();
  });

  test("grep words inside quotes or heredoc data are not searches", () => {
    for (const command of [
      `echo "grep -rn needle src/"`,
      `git commit -m 'find old bug; rg -n x'`,
      `cat <<'EOF'\ngrep -rn needle .\nfind . -name x\nEOF`,
    ])
      expect(verdict(command)).toBeUndefined();
  });

  test("the same constructs used for real are still denied", () => {
    for (const command of [
      `rr text '<x>' | grep -F -e '.ts:' src/`,
      `rr text '<x>' | grep -F -e '.ts:' | sort`,
      `rr text '<x>' $(grep -rn x .)`,
      `cat file.txt | grep foo`,
      `sed -n '1,5p' src/file.ts | rg foo`,
      `find . -type f | grep foo`,
      `grep -r foo .`,
      `grep -rn needle src/`,
      `cat <<EOF\n$(grep -rn needle .)\nEOF`,
      `bash <<EOF\nfind . -name x\nEOF`,
      `sh -c 'grep -rn needle .'`,
      `cd src && rg needle`,
      `python3 - <<EOF\nimport os\nos.walk('.')\nEOF`,
    ])
      expect({ command, verdict: verdict(command) }).toEqual({
        command,
        verdict: "deny",
      });
  });

  test("unparseable syntax keeps the text-based behaviour", () => {
    expect(verdict(`echo 'unterminated; grep -rn x .`)).toBe("deny");
  });
});
