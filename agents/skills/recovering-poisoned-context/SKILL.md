---
name: recovering-poisoned-context
description: >-
  Recovers a session whose context was poisoned by a malformed/leaked tool call —
  the Opus 4.x serialization regression where a stray "court"/"count" token precedes
  a raw <invoke>/<parameter> tag and the tool call is emitted as PLAIN TEXT, so nothing
  executes and the broken XML becomes a few-shot example the model keeps imitating
  (self-poisoning / 自家中毒). Use the moment tool calls keep failing or repeating, raw
  <invoke>/<function_calls>/<parameter> XML shows up in output, a Workflow/Bash won't
  launch, or "正しく再実行します"/retry/reload loops keep reproducing the same break.
  Triggers: malformed tool call, leaked tool call, court/count invoke, tool call as text,
  self-poisoning, 自家中毒, 壊れた tool call, repeated tool errors, /rewind vs retry,
  reload-skills didn't help. Encodes the correct reflex (rewind, NOT retry) and the
  P1/P2/P3 prevention boundary (why a harness/hook cannot prevent contamination).
---

# Recovering a poisoned context (leaked / malformed tool call)

## The one rule

**STOP retrying. The poison is in the transcript, not in your config.** Each retry,
apology ("正しく再実行します"), or `/reload-skills` leaves the broken XML in history and
adds more text around it — the model keeps imitating it. You must REMOVE the poison,
which only context-rewind can do.

```
Esc Esc  (or /rewind)  →  巻き戻し先 = 最初に court/<invoke> が漏れたターンの“直前”
   ↓ それでも直らない
/clear  →  そのタスクだけ新セッションで再開（文脈を全消し）
   ↓ 再発が多い
/model  →  Opus 4.x 以外（例 Sonnet）へ一時退避。震源は decoder 回帰なので発生率が下がる
```

**Do NOT** (all make it worse — they keep the few-shot poison in context):
`/reload-skills`, `/reload-plugins`, "retry carefully", re-sending the same call, or
asking the model to "be more careful". None of these touch the transcript.

## Why this happens (so you trust the rule)

The malformation is **inside the model's decoder** — a stray token leaks before the
tool-call boundary and the call serializes as text. Once that text is in the transcript,
next-token prediction over the model's own history treats it as "how I call a tool" and
reproduces it. The specific word (`court`/`count`) is arbitrary but gets locked in by
repetition. This is **few-shot self-poisoning**, and it self-reinforces until the poison
is removed from context.

## The prevention boundary — what a harness CANNOT do

Three intervention points (full survey → `reference.md`):

| Point | What | Reachable by a Claude Code USER? |
|---|---|---|
| **P1** stop emission | constrained/grammar decoding, **strict tool-use API** | ❌ needs logit access (self-host) or is **server-side (Anthropic)** — not user/hook |
| **P2** stop append | parse-then-decide, repair-before-append, don't echo errors | ❌ harness-INTERNAL (Claude Code itself), not user settings/hooks |
| **P3** remove after | `/rewind`, `/clear`, fresh context | ✅ **this is your only layer** — plus reducing occurrence (lean context, `/model`) |

So **contamination cannot be *prevented* from user config or a hook.** The `Stop` hook
`detect-leaked-toolcall.sh` is a P3 **alarm** (it pings you to rewind) — a smoke detector,
not a fire extinguisher. Real prevention (P1/P2) is the model provider's and Claude Code's
job. Calibrate expectations accordingly.

## Reduce how often it fires (probability lever, not a fix)

- Keep context small & fresh: `/clear` at task boundaries, scope big exploration to
  subagents, keep `CLAUDE.md` lean. Self-poisoning correlates with bloated context.
- Long autonomous Workflow runs are the peak-risk case — that is where the detector earns
  its keep (you notice an unattended leak immediately instead of several turns late).

## Full evidence

`reference.md` — adversarially-verified, cited survey (P1/P2/P3 framework, 30 confirmed
techniques across constrained decoding / framework error-handling / context hygiene /
the Claude Code regression / parse-repair layer, plus honest gaps).
