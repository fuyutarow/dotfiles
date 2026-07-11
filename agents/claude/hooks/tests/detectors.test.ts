import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assistant, fakeCorreoDir, runHook, tempHome, user, writeTranscript } from './helpers.ts'

const stopPayload = (transcript_path: string, active = false) => ({
  transcript_path,
  stop_hook_active: active,
})

// ── detect-leaked-toolcall ───────────────────────────────────────────────────
describe('detect-leaked-toolcall', () => {
  const HOOK = 'detect-leaked-toolcall.ts'
  const LEAK = 'court\n<invoke name="Bash">\n<parameter name="command">ls'

  test('raw leaked tag in this turn -> exit 0 (alert-only) + log line', () => {
    const home = tempHome()
    const t = writeTranscript([user('do it'), assistant(LEAK)])
    const r = runHook(HOOK, stopPayload(t), { HOME: home })
    expect(r.code).toBe(0)
    const log = readFileSync(join(home, '.claude/leaked-toolcall.log'), 'utf8')
    expect(log).toContain('leaked-toolcall')
  })

  test('tag inside a code fence -> no log (mentions are fine)', () => {
    const home = tempHome()
    const t = writeTranscript([user('explain the bug'), assistant('```\n' + LEAK + '\n```')])
    runHook(HOOK, stopPayload(t), { HOME: home })
    expect(existsSync(join(home, '.claude/leaked-toolcall.log'))).toBe(false)
  })

  test('leak in a PREVIOUS turn -> ignored (turn-scoped)', () => {
    const home = tempHome()
    const t = writeTranscript([user('a'), assistant(LEAK), user('b'), assistant('clean')])
    runHook(HOOK, stopPayload(t), { HOME: home })
    expect(existsSync(join(home, '.claude/leaked-toolcall.log'))).toBe(false)
  })

  test('missing transcript -> FAIL OPEN exit 0', () => {
    expect(runHook(HOOK, stopPayload('/nonexistent.jsonl')).code).toBe(0)
  })
})

// ── detect-audit-theater ─────────────────────────────────────────────────────
describe('detect-audit-theater', () => {
  const HOOK = 'detect-audit-theater.ts'
  const gateWord = '監査' + '完了' // built by concat so this test file never contains it raw

  test('unbounded gate language in an audit turn -> exit 2 with rewrite instruction', () => {
    const t = writeTranscript([user('文体を監査して'), assistant(`${gateWord}です。`)])
    const r = runHook(HOOK, stopPayload(t))
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('self-justifying or unbounded')
  })

  test('same phrase QUOTED in a code fence -> exit 0', () => {
    const t = writeTranscript([user('文体を監査して'), assistant('```\n' + gateWord + '\n```')])
    expect(runHook(HOOK, stopPayload(t)).code).toBe(0)
  })

  test('non-audit context -> exit 0 even with the phrase', () => {
    const t = writeTranscript([user('こんにちは'), assistant(`${gateWord}です。`)])
    expect(runHook(HOOK, stopPayload(t)).code).toBe(0)
  })

  test('naked PASS in an audit turn -> exit 2; bounded PASS -> exit 0', () => {
    const naked = writeTranscript([user('prose audit please'), assistant('PASS.')])
    expect(runHook(HOOK, stopPayload(naked)).code).toBe(2)
    const bounded = writeTranscript([
      user('prose audit please'),
      assistant('PASS — checked sections 1-3; appendix not checked.'),
    ])
    expect(runHook(HOOK, stopPayload(bounded)).code).toBe(0)
  })

  test('loop guard: stop_hook_active -> exit 0', () => {
    const t = writeTranscript([user('監査して'), assistant(`${gateWord}`)])
    expect(runHook(HOOK, stopPayload(t, true)).code).toBe(0)
  })
})

// ── detect-prose-correo ──────────────────────────────────────────────────────
describe('detect-prose-correo', () => {
  const HOOK = 'detect-prose-correo.ts'
  const withFake = (mode: string) => ({
    PATH: `${fakeCorreoDir()}:/usr/bin:/bin`,
    FAKE_CORREO_MODE: mode,
    HOME: tempHome(), // keeps ~/.cargo/bin fallback away from a real correo
  })
  const transcript = () => writeTranscript([user('説明して'), assistant('本文です。')])

  test('calque hit -> exit 2 with the rewrite rule', () => {
    const r = runHook(HOOK, stopPayload(transcript()), withFake('calque'))
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('カタカナ動詞')
    expect(r.stderr).toContain('[calque/')
  })

  test('codemix density hit (⚑ lines) -> exit 2', () => {
    const r = runHook(HOOK, stopPayload(transcript()), withFake('codemix'))
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('ルー語密度')
  })

  test('coinage hit -> exit 2; coinage exit 2 (no dict) -> FAIL-SAFE pass', () => {
    expect(runHook(HOOK, stopPayload(transcript()), withFake('coinage')).code).toBe(2)
    expect(runHook(HOOK, stopPayload(transcript()), withFake('nodict')).code).toBe(0)
  })

  test('clean text -> exit 0', () => {
    expect(runHook(HOOK, stopPayload(transcript()), withFake('clean')).code).toBe(0)
  })

  const realCorreoInFallbacks =
    existsSync('/usr/local/bin/correo') || existsSync('/home/linuxbrew/.linuxbrew/bin/correo')
  test.skipIf(realCorreoInFallbacks)('correo absent -> FAIL-SAFE exit 0', () => {
    const r = runHook(HOOK, stopPayload(transcript()), {
      PATH: '/usr/bin:/bin',
      HOME: tempHome(),
    })
    expect(r.code).toBe(0)
  })

  test('loop guard: stop_hook_active -> exit 0', () => {
    const r = runHook(HOOK, stopPayload(transcript(), true), withFake('calque'))
    expect(r.code).toBe(0)
  })
})
