// Shared plumbing for Claude Code hooks (bun runtime; node:-APIs only, zero npm deps —
// hooks must never trigger bun's auto-install at hook time). The zero-dep rule overrides
// the house zod-for-narrowing preference: payload/transcript shapes are hand-narrowed at
// the JSON boundary and kept loose (`any`) on purpose.
//
// Hook protocol reminders (see operating-the-harness/references/hooks.md):
//   - stdin = event JSON
//   - PreToolUse decision = exit 0 + JSON on stdout (decidePre)
//   - Stop guard block    = exit 2 + stderr; never mix the two channels

import { accessSync, constants, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type TranscriptEntry = {
  type?: string
  message?: { content?: unknown }
}

export function readStdinJson(): any {
  return JSON.parse(readFileSync(0, 'utf8'))
}

// Transcript is JSONL; skip malformed lines rather than fail the whole read.
export function readTranscript(path: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line))
    } catch {
      /* skip */
    }
  }
  return entries
}

function textBlocks(content: unknown): string[] {
  if (typeof content === 'string') return [content]
  if (!Array.isArray(content)) return []
  return content
    .filter((b: any) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text)
}

// This turn's assistant prose = assistant text blocks after the last user-type entry
// (tool_result carriers count as user entries too, which is what scopes us to the turn).
export function turnText(entries: TranscriptEntry[]): string {
  const rel = entries.filter(e => e.type === 'assistant' || e.type === 'user')
  let lastUser = -1
  rel.forEach((e, i) => {
    if (e.type === 'user') lastUser = i
  })
  return rel
    .slice(lastUser + 1)
    .filter(e => e.type === 'assistant')
    .flatMap(e => textBlocks(e.message?.content))
    .join('\n')
}

// Most recent HUMAN prompt text (tool_result user entries carry no text blocks).
export function lastUserText(entries: TranscriptEntry[]): string {
  const texts = entries
    .filter(e => e.type === 'user')
    .map(e => textBlocks(e.message?.content).join('\n'))
    .filter(t => t !== '')
  return texts[texts.length - 1] ?? ''
}

// Remove ``` fences, `inline` spans (line-scoped, like the sed it replaces), and
// optionally > blockquotes — so a QUOTED example never triggers a guard.
export function stripCode(text: string, opts: { blockquotes?: boolean } = {}): string {
  const out: string[] = []
  let inFence = false
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (opts.blockquotes && /^\s*>/.test(line)) continue
    out.push(line.replace(/`[^`]*`/g, ''))
  }
  return out.join('\n')
}

// PreToolUse decision — print JSON and exit 0. `extra` merges into hookSpecificOutput
// (e.g. updatedInput). This is the JSON channel: callers must not also exit 2.
export function decidePre(
  decision: 'allow' | 'deny' | 'ask',
  reason: string,
  extra: Record<string, unknown> = {},
): never {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: reason,
        ...extra,
      },
    }),
  )
  process.exit(0)
}

// Locate an executable: $PATH first, then fallback dirs (hooks may run with a narrow PATH).
export function findExe(name: string, fallbackDirs: string[] = []): string | null {
  const dirs = (process.env.PATH ?? '').split(':').filter(Boolean).concat(fallbackDirs)
  for (const dir of dirs) {
    const p = join(dir, name)
    try {
      accessSync(p, constants.X_OK)
      return p
    } catch {
      /* keep looking */
    }
  }
  return null
}
