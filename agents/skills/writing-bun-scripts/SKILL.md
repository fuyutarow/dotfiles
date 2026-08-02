---
name: writing-bun-scripts
description: >-
  Writes and refactors local automation scripts in Bun TypeScript — the house default past a
  thin POSIX shim (bootstrap / hook-entry). Ordinary CLIs run `bun <path>` with Cleye `cli`,
  framework help and positional schemas, strict/prototype-safe flags, JSON envelope or verdict
  lines, Bun.$ for
  shell-outs, Bun.spawn with NATIVE timeout for hangable CLIs, bun test + fixtures,
  BUN-NATIVE-FIRST over hand-rolled plumbing. Owns the dependency ladder (builtins →
  repo-root graduation project → pinned `bunx pkg@x.y.z`), bunx-over-npx, and the bash→TS
  migration of the corpus. Use when writing or migrating a local script or hook —
  ローカルスクリプト,
  スクリプト書いて, 自動化して, bash を bun/TS に書き換え, シェルスクリプト移行,
  スクリプトのリファクタ, bun スクリプト, bunx, npx, hooks 実装, skill の scripts/. LAW:
  NO-NEW-BASH beyond declared shims; CWD-HOSTILE (inline pinned imports THROW under an
  ancestor node_modules — pin in bun.lock, import bare); ZERO-DEP WHERE DISTRIBUTED (hooks/,
  templates/, `.zero-dep`); PINNED-OR-ABSENT; bun TRANSPILES, never type-checks.
  Cuts: TS idiom → writing-typescript (co-fires on .ts; its zod/ts-pattern rows YIELD to the
  zero-dep floor where distributed); Python payload → running-python-tools; mise task graph → wiring-mise-tasks; skill ships a script? → forging-skills;
  hook events/settings → operating-the-harness; claude/codex/grok/agy CLI → driving-*.
  Workflow-native: one script stays SOLO; corpus migrations fan out read-only per file.
  English skill; respond in the user's language (default Japanese).
---

# Writing Bun scripts — local automation in Bun TypeScript

> **Version**: v2608.1.1 (2026-08-02) — Cleye corpus boundary and interpolation-safe floor.
> Bun runtime facts remain pinned in `references/bun-facts.md`.
> **Scope**: local automation scripts on this host — dotfiles scripts, skill `scripts/`, Claude
> hooks, repo helpers. NORMATIVE, not descriptive: the 2026-07 bash→TS migration corpus (18
> skill scripts + 4 hooks) is the refactor PATIENT, graded KEEP / REFACTOR in the Refactor map
> below — where corpus and this skill disagree, this skill wins.
> **Durability**: dated facts (Bun version/API status, issue links, third-party benchmarks)
> live ONLY in `references/bun-facts.md` — a Bun version number or API-status claim in this
> body is a bug. Staleness: re-verify that file when `bun --version` moves.
> **Build order (atomic).** Verify:
> `test -f references/bun-facts.md || echo MISSING facts; test -f scripts/script-check.ts || echo MISSING floor; test -f tests/forge-verification-ledger.md || echo MISSING ledger`

## Language & stable tokens

English skill; respond in the user's language (default Japanese). Stable tokens, fixed even
inside Japanese prose: **LAW**, **gate** (BG0–BG4), **shim**, **envelope**, **verdict lines**,
**graduation**, **CWD-HOSTILE**, **CLEYE-FIRST**, **BUN-NATIVE-FIRST**, **KEEP / REFACTOR**,
**floor**.

## THE LAW

> Local automation on this host is Bun TypeScript. Bash survives only as a declared THIN SHIM —
> bootstrap-before-toolchain, hook-entry, a ≤10-line exec wrapper — and the first conditional,
> loop, or JSON access appearing in a `.sh` is the signal it should have been `.ts`
> (**NO-NEW-BASH**). Scripts are zero-config single files run `bun <path>` from ANY cwd: an
> ancestor `node_modules` silently flips Bun's module resolution, so third-party imports are
> absent by default and paths resolve from `import.meta.dir`, never from cwd unless cwd IS the
> input (**CWD-HOSTILE**). Ordinary argv boundaries use Cleye `cli`: framework help and
> `parameters` are the contract, not behavior to reproduce manually. Direct `typeFlag` is only a
> marked raw argv forwarding/embedding exception whose downstream relay preserves token order and
> `--` (**CLEYE-FIRST**). Where Bun ships the primitive — `$`, `spawn` with native timeout,
> `file`, `which`, `Glob`, `sleep`, `bun:sqlite`, `password` — hand-rolling it is the smell
> (**BUN-NATIVE-FIRST**). Third-party code enters only pinned: `bunx pkg@x.y.z`, or graduation
> to package.json + bun.lock (**PINNED-OR-ABSENT**). And bun **TRANSPILES, never type-checks**:
> a green run proves nothing about types.

## The gates — BG0–BG4, each with a checkable artifact

| Gate | Rule | Artifact |
|---|---|---|
| **BG0 RUNTIME** (deny-gate, fires on entry) | A new local script is `.ts` on bun. DENY: new bash beyond the four shim classes (any new `.sh` carries a `# shim: <bootstrap\|hook-entry\|exec-wrapper\|vendored>` comment); node/ts-node/npx as a runtime; deno. `vendored` = shell an external tool overwrites (e.g. `herdr-agent-state.sh`) — marker-EXEMPT, detected from its own vendor header, not a marker the overwrite would erase. Migration never touches the bootstrap layer (`scripts/link-dots.sh`, `wsl:init` path) — it runs before brew/bun exist and stays POSIX. | file extension + shim comment in any surviving `.sh` (vendored: header content, not a written marker) |
| **BG1 CONTRACT** | Invoked `bun <path>`; **no shebang** (shebang + exec bit ONLY when the file is substituted as a binary — the fixture pattern). Every ordinary argv entry uses bare-imported Cleye `cli` (exact `cleye@2.6.0` in repo-root package.json + bun.lock); `node:util` `parseArgs` and hand parsing of `Bun.argv` / `process.argv` are forbidden. Every `cli` **and** `command` declares `strictFlags: true`, `ignoreArgv: rejectPrototypeFlag`, and `parameters:` (spell `parameters: []` for flag-only). Cleye commands inherit `strictFlags` but not `ignoreArgv`. `rejectPrototypeFlag` rejects unknown `__proto__` before type-flag mutates its unknown-object; `constructor` and `prototype` are ordinary own keys, so strictFlags rejects them in the normal unknown path. Cleye camelCase flag keys intentionally render/accept kebab-case flags. Use `<rest...>` / `[rest...]` only when excess positionals are accepted deliberately; otherwise reject `parsed._.length` or call `rejectUnexpectedArguments(parsed.unknownFlags, parsed._)`. Cleye-owned help exits 0; ordinary unknown flags and missing required parameters exit 1 on stderr; the local prototype guard and caught usage/environment failures exit 2. Direct `typeFlag` is permitted only for `// argv-forwarding: <consumer>` on its own line: use a real parser call, retain its `unknownFlags` invariant, parse a copy, and relay the original raw argv byte/order/`--` unchanged; reviewers verify that last semantic property. Its wrapper-owned keys stay explicit kebab spelling. A zero-dep tree that needs argv parsing must graduate first; zero-dep is never permission to select another parser. Entry = `main().catch(…)` → `FATAL: …` on stderr, exit 2; `import.meta.main` guard only when also imported. ONE declared consumer per script — machine → single-line JSON envelope; agent/human → verdict lines. After parsing, domain verdicts use exit 0 clean / 1 findings / 2 FATAL; Cleye's framework exit 1 is distinguished by its stderr diagnostic, not by code alone. Use `process.stdout.write`, not `console.log`. | floor PASS + a boundary fixture proving strict/prototype/help/positional behavior |
| **BG2 SUBPROCESS** | Simple shell-out → `Bun.$` (escaped interpolation, cross-platform; sharp edges in facts §2 — spread `process.env` in `.env()`, branch on `exitCode` after `.nothrow()`, no `$` in polling loops). Can hang, needs streaming or kill → `Bun.spawn` with NATIVE `timeout:` / `killSignal:` / `signal:` — a hand-rolled `setTimeout`+`kill()` is REFACTOR (facts §3). **Drain `stdout` and `stderr` in ONE `Promise.all`** with `proc.exited` — sequential drain deadlocks on the pipe you are not reading, and the only symptom is your own timeout, which misreads as a slow child. **Bound a hangable child with `signal: AbortSignal.timeout(ms)` and read the timeout off the SIGNAL** (`sig.aborted`) — `proc.killed` is true after a clean exit, and `proc.signalCode` cannot separate your timeout from an external kill. All three measured, facts §3. Always bound relayed output (slice caps); gate on `Bun.which` before real work. Hooks context: sync `main`, `spawnSync`, zero npm imports ever. | `timeout:` present, or a `// bounded:` comment naming why not; floor W9/W10 clean (no `.killed` branch, no sequential drain) |
| **BG3 DEPENDENCIES** | The ladder: node:/bun: builtins → Bun global → **the repo-root graduation project** (package.json + bun.lock, restored by `mise run deps`; bare import, EXACT version, resolved on the file's realpath so symlinked skills work from any cwd) → `bunx pkg@x.y.z` (PINNED — unpinned bunx in any hook/CI path is drift; staleness is real, facts §5) → GRADUATION to a package.json + bun.lock project (trigger: ≥2 files sharing deps, a dep you must pin, or type/editor pressure). Inline `pkg@ver` imports are legal ONLY in throwaway one-offs run from a known-clean cwd — an ancestor `node_modules` makes them THROW (facts §4). Hooks: no imports beyond node:/bun:, ever — auto-install at hook time is the hazard. | floor unpinned-import FAIL; graduation = the package.json itself |
| **BG4 VERIFICATION** | Behavior worth keeping → `bun test` in a sibling `tests/`, fixture-binary pattern (a real spawned executable exercising timeout/error paths — not a mock); prove any new gate/floor check FIRES (inject bad input, watch FAIL, revert); types: editor LSP + `bunx typescript@<pin> tsc --noEmit` at graduation — never claim "typed" from a green run (TRANSPILE-ONLY). | test run output / red→green record in the change |

## Decision table

| You want to… | Do this |
|---|---|
| New local script | one `.ts`, run `bun path/script.ts` — BG1 anatomy |
| A few shell commands | `Bun.$` — `` await $`cmd`.text() ``; `{ raw: … }` for globs; sequence with separate awaits |
| Call a CLI that can hang (LLM CLIs, network) | `Bun.spawn({ cmd: […], timeout, killSignal })` + bounded relay |
| Read / write a file | `Bun.file(p).text()/.json()` / `Bun.write` (node:fs stays for `existsSync`/`readdir`/`rm`) |
| Parse flags / positionals in an ordinary command | `cli({ name, flags, parameters, strictFlags: true, ignoreArgv: rejectPrototypeFlag })`; Cleye owns help and positional mapping |
| Own named commands + generated command help | `cli({ commands: [command({ name, parameters, strictFlags: true, ignoreArgv: rejectPrototypeFlag })], … })`; every command repeats the prototype guard |
| Accept excess positionals | declare a deliberate `<rest...>` / `[rest...]` schema; otherwise reject `parsed._.length` or use `rejectUnexpectedArguments(parsed.unknownFlags, parsed._)` |
| Forward arbitrary downstream argv | exact `// argv-forwarding: <downstream>` marker; parse a copy with `typeFlag`, then relay the original argv unchanged including `--` |
| Run a JS/TS CLI tool once | `bunx pkg@x.y.z` — never npx, never `npm i -g` |
| Python payload (lib or tool) | STOP → `running-python-tools` (uvx / `uv run --with`) |
| Import a library | BG3 graduation check FIRST |
| Write a hook | sync `main`, node:/Bun globals only, zero deps, fail-open/-closed declared in the header |
| Test a script | `bun test <dir>/tests` + a fixture binary |
| Migrate a `.sh` | freeze its CLI/exit/output contract → write the `.ts` → delete the `.sh` in the same change |

## Refactor map — corpus baseline → target (the standing work order)

The 2026-07 migration corpus is graded here; receipts and the full drift evidence live in
`tests/forge-verification-ledger.md`. Contracts KEEP; implementations largely REFACTOR.

| Corpus pattern | Verdict | Target |
|---|---|---|
| exit 0/1/2 + `main().catch` → FATAL stderr, exit 2 | KEEP | — |
| `parseArgs`, raw `Bun.argv`, or unmarked direct `typeFlag` | REFACTOR | ordinary boundary → Cleye `cli`; direct type-flag only with the exact forwarding marker |
| manual help / positional routing | REFACTOR | Cleye help and `parameters`; excess is a spread schema, `parsed._.length`, or the established `rejectUnexpectedArguments` refusal |
| Cleye `strictFlags` without local ignoreArgv | REFACTOR (security) | `ignoreArgv: rejectPrototypeFlag` on every cli/command prevents `--__proto__` mutation before strictFlags runs |
| exact-kebab schema rule | REFACTOR | Cleye camelCase keys render as kebab-case flags; exact spelling remains only on forwarding-wrapper type-flag keys |
| envelope vs verdict-lines split by consumer | KEEP | declare the consumer per script (BG1) |
| zero npm imports across the corpus | **SUPERSEDED 2026-07-28** — the physics is real but it is solved by graduation, not by abstinence: measured, an inline pinned import throws under an ancestor node_modules while a lockfile-backed bare import resolves through symlinks from any cwd | repo-root package.json + bun.lock; DISTRIBUTED code (hooks/, templates/, `.zero-dep` trees) stays zero-dep |
| fixture-binary tests (driving-claude family) | KEEP | extend to the other script families |
| hooks: sync + zero-dep + explicit fail-open/-closed headers | KEEP (sync + zero-dep is load-bearing; Bun globals are equally legal there) | — |
| hand-rolled `setTimeout`+`kill`+`clearTimeout` (probe family ×3 + run-claude) | REFACTOR | native `Bun.spawn` `timeout:`/`killSignal:` |
| `Bun.spawn` ceremony for short bounded commands (version checks, wrangler calls) | REFACTOR | `Bun.$` + `.quiet()`/`.nothrow()` + `exitCode` branch |
| `node:fs` readFile boilerplate for whole-file reads | REFACTOR | `Bun.file().text()/.json()` |
| error envelopes that exit 0 (turnstile auth-probe) | REFACTOR (bug) | error envelope ⇒ non-zero exit (BG1) |
| `process.exitCode =` vs `process.exit()` split | RULE | set exit at the entry boundary only; either form; never mid-library |
| the same `run()` helper duplicated across skills | RULE | never import across skill dirs — self-containment beats DRY (links break cross-dir paths); SHRINK the pattern via native options until duplication is trivial |
| unpinned `bunx textlint` / `bunx wrangler` calls | REFACTOR | pin `bunx pkg@x.y.z` (facts §5) |

CI gap (repo `fmt:ts` excludes `agents/skills/**`; skill tests unreachable from `mise run
test`) → `wiring-mise-tasks` territory; recorded in the ledger, not fixed here.

## Execution model

The modal invocation — writing or refactoring ONE script — is SOLO, zero agents. Corpus-wide
migrations/audits fan out ONE read-only worker per script (extract contract → rewrite → floor +
test), and evidence is CITATION-RELAY: a verdict carries the command + verbatim output; an
agent's bare PASS is zero evidence. No harness → same map, serial. Durable operating guidance
from a frontier model (Fable 5, 2026-07); if a constraint here feels unnecessary, that feeling
is the failure mode — follow the map.

## MUST-NOT-FIRE — and the fire/no-fire set

FIRES:

| Ask | Why |
|---|---|
| 「この bash スクリプト、bun ts に書き換えて」 | the migration core |
| 「移行した skill scripts、拙いから全面リファクタして」 | the standing work order — co-fire `refactoring-code` (governs: two hats, oracle); this supplies the Refactor map + the bun oracle |
| "write a script that tallies brew leaves vs the Brewfile" | no bun keyword — BG0 routes local automation to bun ts |
| 「probe-models.ts に --json フラグ足して」 | editing a house bun script (co-fire `implementing-and-debugging` FIRST when non-trivial) |
| 「この script、yaml パーサ import していい？」(a bun script is in context) | BG3 dependency ladder |
| 「hooks に新しい detector 足して」 | co-fire `operating-the-harness` FIRST (event/matcher contract); this owns the hook body |
| 「link-dots.sh も ts 化しよう」 | fires to REFUSE — bootstrap shim stays POSIX (BG0) |

MUST NOT fire (route):

| Ask | Route |
|---|---|
| 「React コンポーネントの props 型直して」 | `writing-typescript` alone — idiom, not a local script |
| 「PDF からテキスト抽出して」 | `running-python-tools` — Python payload (uv run --with pypdf) |
| 「mise に lint:ts タスク足して」 | `wiring-mise-tasks` — the graph; here only if also authoring the script body |
| a one-shot interactive pipeline (`ls \| grep …`) | no skill — a command, not a kept script |
| 「codex exec の sandbox フラグどれ？」 | `driving-codex` — that CLI's own semantics |
| 「Worker をデプロイして」 | wrangler / workers-best-practices family (but a deploy SCRIPT to author → co-fire: their wrangler semantics, this skill's script anatomy) |
| 「bun で CLI ツール作って npm に publish したい」 | product/package engineering, not local automation — `writing-typescript` idiom floor; this skill's scope ends at the local graduation project |
| 「Express サーバーをリファクタして」 | `refactoring-code` + `writing-typescript` — an app/server, not a local automation script |
| 「zsh の alias 追加して」 | no skill — shell config is the zsh/ topic, not a script |

## Routing — sibling cuts (typed)

| Sibling | Cut |
|---|---|
| `writing-typescript` | PURPOSE — how TS READS (idiom floor: `satisfies`, `??`, absence modeling) → theirs; how a SCRIPT is built/run/tested/shipped → here. It auto-co-fires via its `paths` glob on any `.ts`. SEAM RULING (canonical home HERE, mirrored there): in zero-config standalone scripts the zero-dep floor beats its zod/ts-pattern rows — hand-rolled narrowing (`isRecord`) is the accepted form; those rows re-enter at graduation. |
| `running-python-tools` | DECISIVE by payload language — Python tool/snippet NOW → there (uvx / `uv run`); JS/TS tool/script → here (`bunx` pinned). This skill is the home of the bunx-over-npx rule that its body names as "the Python analogue … used for JS" (reciprocal landed there 2026-07-23). |
| `writing-python` | the same DECISIVE cut for KEPT code — kept Python → there; kept TS scripts → here. |
| `wiring-mise-tasks` | PURPOSE — task NAME/verb/graph → theirs; the script BODY a task runs → here. |
| `forging-skills` | PURPOSE — WHETHER a skill ships a script + floor-vs-semantic doctrine → theirs; HOW that script is written → here. |
| `operating-the-harness` | PURPOSE — hook EVENTS/matchers/settings.json → theirs; the hook's `.ts` body → here (hooks rows in BG2/BG3). Its hooks reference carries generic bash/npx RECIPE examples from the upstream docs — illustrative contract, not house style; house hook bodies follow this skill (reciprocal note deferred, ledger). |
| `driving-claude` / `driving-codex` / `driving-grok` / `driving-antigravity` | PURPOSE — THAT CLI's flags/laws/models → theirs; generic spawn/envelope/timeout craft → here (their scripts are corpus exemplars). |
| `implementing-and-debugging` / `refactoring-code` | co-fire with ORDER on any behavior change / restructure — they govern; this supplies the bun oracle (floor + `bun test` green bracket) and the target idioms. |
| `raising-resolution` | silent sub-step: probe the actual runtime (`bun --version`, run the command) before asserting a Bun fact — never recall one from training. |

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/bun-facts.md` | DATED verified Bun facts: auto-install & the cwd trap, Bun.$ semantics + sharp edges, native spawn timeout API, bunx staleness, node-compat gaps, WSL quirks, --compile, perf reality, typecheck wiring, version pinning | before relying on any Bun feature not already encoded in the gates; any "does Bun support X?" |
| `scripts/script-check.ts` | the mechanical floor — run `bun ${CLAUDE_SKILL_DIR}/scripts/script-check.ts <file.ts …>`, never read into context | after every new/edited script; per-file in corpus audits |
| `tests/forge-verification-ledger.md` | F3 artifact: harvest provenance, the corpus KEEP/REFACTOR baseline with receipts, fleet findings, proof-of-fire records | reforging; auditing this skill; starting the corpus refactor |
