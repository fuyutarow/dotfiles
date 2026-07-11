// Test helpers — each hook is exercised END-TO-END: spawned as a real process with a
// synthetic payload on stdin, asserting on exit code / stdout JSON / stderr. That tests
// the actual hook contract, not just the library functions.

import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOOKS_DIR = join(import.meta.dir, '..')

export function runHook(
  name: string,
  payload: unknown,
  env: Record<string, string> = {},
): { code: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [join(HOOKS_DIR, name)], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_HOOK_QUIET: '1', ...env },
  })
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

// PreToolUse hooks print one decision JSON on stdout (or nothing = silent pass).
export function decisionOf(stdout: string): any {
  if (stdout.trim() === '') return null
  return JSON.parse(stdout).hookSpecificOutput
}

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function writeTranscript(entries: unknown[]): string {
  const p = join(tempDir('hooktest-'), 'transcript.jsonl')
  writeFileSync(p, entries.map(e => JSON.stringify(e)).join('\n') + '\n')
  return p
}

export const user = (text: string) => ({
  type: 'user',
  message: { content: [{ type: 'text', text }] },
})
export const assistant = (text: string) => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text }] },
})
// A tool_result carrier — type "user" but no text blocks (bounds the turn like a real one).
export const toolResultUser = () => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: 'x' }] },
})

// A fake `correo` on PATH whose behavior is driven by $FAKE_CORREO_MODE, so the wrapper's
// block policy is testable without the real binary (or a Sudachi dictionary).
export function fakeCorreoDir(): string {
  const dir = tempDir('fakecorreo-')
  const script = `#!/bin/sh
mode="\${FAKE_CORREO_MODE:-clean}"
case "$1" in
  calque)
    if [ "$mode" = calque ]; then echo 'L3 [calque/commitする] hit'; exit 1; fi
    exit 0 ;;
  codemix)
    if [ "$mode" = codemix ]; then echo '⚑ 42 latin/100字'; fi
    exit 0 ;;
  coinage)
    if [ "$mode" = coinage ]; then echo 'x: not a dictionary headword'; exit 1; fi
    if [ "$mode" = nodict ]; then exit 2; fi
    exit 0 ;;
esac
exit 0
`
  const p = join(dir, 'correo')
  writeFileSync(p, script)
  chmodSync(p, 0o755)
  return dir
}

// A HOME with an existing .claude/ dir (for hooks that write logs under ~/.claude).
export function tempHome(): string {
  const home = tempDir('hookhome-')
  mkdirSync(join(home, '.claude'))
  return home
}
