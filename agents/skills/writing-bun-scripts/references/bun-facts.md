# Bun facts — dated, verified snapshot

> **Verified**: 2026-07-23 against bun.com/docs (fetched live) + GitHub issues + graded
> third-party sources. Local runtime at verification: **bun 1.3.14** (latest stable per
> bun.com/blog, released 2026-05-13). Re-verify this WHOLE file when `bun --version` moves or
> on any reforge — Bun changes fast and several rules below are pinned to open issues.
> Grades: `[docs]` official bun.com documentation · `[gh]` GitHub issue/discussion (number
> given) · `[3p]` third-party post, named · `[corpus]` observed in the house corpus 2026-07-23.

## §1 Version & pinning

- `bun --version` / `bun --revision` are the version checks; `bun upgrade --version 1.1.30`
  pins an install. `[docs]`
- Bun has **NO native `.bun-version` / `packageManager` support** — Corepack explicitly does
  not support Bun; `setup-bun`/community managers read those fields themselves. Pin the binary
  via Brewfile/mise instead. `[docs+3p]`
- `--frozen-lockfile` has a history of version-sensitive regressions (false drift claims,
  Docker-only failures): treat the Bun BINARY version as part of the reproducibility surface —
  pin it in CI images. `[gh #6966 #12252 #19088 #17601 #15288]`

## §2 Bun.$ (Bun Shell) — semantics and sharp edges

Official semantics `[docs: /docs/runtime/shell]`:

- Interpolation is **escaped by default** — injection-safe; `{ raw: "…" }` is the escape hatch
  (needed for dynamic globs/flags built from strings). Globs `**`/`*`/`{a,b}` are native.
- NOT a system shell — a bash re-implementation in-process; **cross-platform incl. Windows**.
  Builtins: `cd ls rm echo pwd bun cat touch mkdir which mv(partial) exit true false yes seq
  dirname basename`.
- `.text()` `.json()` `.lines()` `.blob()` `.quiet()` `.nothrow()` `.throws(true)`; non-zero
  exit **throws** by default; `ShellError` carries `exitCode` / `stdout` / `stderr`.
- Docs state Bun Shell "runs operations concurrently" unlike bash — sequence side-effecting
  steps as separate awaited `$` calls, not one long block.

Sharp edges (each is a rule):

- `.env({…})` **replaces** the environment — always spread: `.env({ ...process.env, FOO })`;
  omitting `PATH` makes every later command fail to resolve. `[docs example + 3p jangwook.net]`
- `.nothrow()` only suppresses the throw — branch on `exitCode` immediately or failure passes
  silently. `[docs]`
- Backtick command substitution does NOT work inside `` $`…` `` — use `$(…)`. `[docs]`
- **No timeout / AbortSignal API** — anything hangable goes to `Bun.spawn` (§3). `[docs: absent]`
- ~1 MB/s RSS leak when `$` runs in a polling loop — never `$` inside `setInterval`/long-lived
  loops; one-shot scripts are unaffected. `[gh #13060]`
- Dotfile globs can silently no-op even with explicit `.*` patterns — test any dotfile glob.
  `[gh #28021]`
- `rm -rf` via `$` is broken on native Windows — prefer `node:fs` `rm` for destructive ops on
  cross-platform paths. `[gh #13523]` (house targets are mac/WSL — low exposure, still note)
- `echo` differs mac/GNU on `\n` — use `printf` in anything cross-OS. `[3p]`

## §3 Bun.spawn — the native timeout API

`[docs: /docs/api/spawn]` — this section is WHY hand-rolled `setTimeout`+`kill` is REFACTOR:

- `Bun.spawn({ cmd, timeout: ms, killSignal: "SIGKILL" | n, signal: abortController.signal })`
  — "Set `timeout` to terminate a subprocess after a duration in milliseconds"; default kill
  signal on timeout is SIGTERM; `killSignal` also applies to aborts.
- `proc.kill()` / `proc.killed` / `proc.exited` (Promise) / `proc.exitCode` / `proc.signalCode`.
- `Bun.spawnSync({ cmd, maxBuffer })` — kills the child once output exceeds `maxBuffer` bytes.
- Drain pattern stays: `await Promise.all([new Response(proc.stdout).text(), …, proc.exited])`,
  then bound what you relay (house caps: 16k/32k chars — `[corpus]` run-claude.ts).

## §4 Auto-install & the cwd trap (the CWD-HOSTILE ground truth)

`[docs: /docs/runtime/auto-install]`:

- Auto-install activates ONLY when **no `node_modules` exists in cwd or any parent**; then
  resolution is `bun.lock` → nearest `package.json` semver → **latest**, fetched from the
  network MID-RUN into `~/.bun/install/cache` (`BUN_INSTALL_CACHE_DIR`).
- Inline version specifiers are real under auto-install — docs' own examples:
  `import { z } from "zod@3.0.0"`, `"zod@^3.20.0"`, `"zod@next"`.
- The TRAP: with an ancestor `node_modules`, Bun switches to Node-style resolution and inline
  version specifiers **THROW** (`VersionSpecifierNotAllowedHere`) — a script that works from a
  clean dir fails when invoked from a project dir. This killed a Claude-skills setup in the
  wild. `[3p magarcia.io ×2]` ⇒ house scripts (run from arbitrary cwd) carry ZERO bare/inline
  npm imports; inline pins are for throwaway one-offs in known-clean cwds only.
- No offline mode, no PEP-723-style inline manifest yet. `[gh #20460 #5062 #26532]`
- `bunfig.toml` `[install] auto = "auto" | "force" | "disable" | "fallback"`. `[docs]`
- Adjacent trap: `bun add` may re-resolve and bump OTHER deps within semver as a side effect
  `[gh #25969]`; `bun update <transitive>` does not surgically patch a transitive CVE — verify
  the resolved tree. `[3p charpeni.com]`

## §5 bunx — the JS uvx, with a staleness bug

- `bunx pkg` = `bun x pkg`; **unpinned bunx can run a stale cached/global copy instead of npm
  latest**. Provenance (corrected 2026-07-23 by live `gh issue view`): #6375 was closed as a
  DUPLICATE (its report partially mitigated in v1.0.29 — bunx re-checks for updates more
  frequently); the real tracking issue **#4989 remains OPEN (reopened)** — staleness inside the
  refresh window and global-install shadowing persist. ALWAYS pin `bunx pkg@x.y.z` in
  hooks/CI/scripts. `[gh #6375 → #4989]`
- `bun pm cache rm` does NOT clear the preferred global install — remove the global bin too
  when a stale version persists. `[gh #6375 family]`
- **The pin-breaks-plugins corollary** (observed in-house 2026-07-23): a tool whose PLUGINS
  resolve as sibling packages of a bun GLOBAL install (textlint + its rule packages) works
  under unpinned `bunx tool` only BECAUSE bunx prefers that global install; pinning
  `bunx tool@x.y.z` switches to an isolated install without the plugins ("No rules found").
  Pinning such tools requires GRADUATION (a package.json pinning tool + plugins together) —
  a bare version pin is not available to them. `[corpus: linting-prose lint-floor]`
- Can be slower than npx for some CLIs (resolver overhead) — benchmark before claiming a win.
  `[gh #16801]`
- WSL: bunx has mis-selected musl over glibc binaries `[gh via opencode #8826]`; interactive
  bunx/`bun create` prompts can freeze a WSL terminal — always pass non-interactive flags
  `[gh #4664]`; keep bun-managed dirs on the native WSL filesystem, never `/mnt/c/...`
  `[gh #1631]`.

## §6 File I/O

- `Bun.file(path)` is a lazy reference: `.text()` `.json()` `.exists()`; `Bun.write(dest, data)`
  accepts `string | Blob(BunFile) | ArrayBuffer | TypedArray | Response`. `[docs]`
- node:fs stays for `existsSync` (sync boolean gates), `readdir`, `rm`, `mkdtemp` — Bun-native
  has no sync exists or dir-walk equivalent (`Bun.Glob` covers pattern scans). `[docs+corpus]`

## §7 stdout & SIGPIPE

- `console.log` crashes with exit 141 when the read end closes early (`| head`);
  `process.stdout.write` survives — scripts meant to be piped write via `process.stdout.write`.
  `[gh #1632]` House corpus already complies. `[corpus]`

## §8 bun test

- Discovery: `*.test.{js,jsx,ts,tsx,mjs,cjs,mts,cts}`, `*_test.*`, `*.spec.*`, `*_spec.*`;
  jest-like API ("not everything is implemented"); subset by path or `-t <regex>`; setup via
  bunfig `[test] preload = ["./setup.ts"]`. `[docs]`
- House shape: zero-config, `tests/` sibling of `scripts/`, fixture-binary pattern (a real
  shebanged executable substituted for the driven binary). `[corpus driving-claude]`

## §9 Node compat — what actually bites scripts

- Native addons (node-gyp/N-API) are categorically broken (JSC, not V8): bcrypt, canvas,
  argon2, sharp(native), sqlite3 → use `Bun.password`, `bun:sqlite`, JS/WASM equivalents.
  `[3p dev.to 2026 compat survey]`
- `node:vm` partial/fragile; `node:cluster` and some stream/crypto edges — smoke-test under bun
  if a script leans on them. `[3p same]`
- `node:util parseArgs` implemented and documented (ongoing compat work; `allowNegative` etc.
  arrived in 1.2.x). `[docs]`
- `.env` autoload: Bun's own `.env` loading takes precedence over library dotenv logic and
  does NOT override already-set shell/CI vars `[gh #25100]`; resolution is cwd-relative — a
  worktree/subdir invocation silently loses vars `[gh #27493]` ⇒ pass required vars explicitly;
  never depend on `.env` discovery in scripts (CWD-HOSTILE).

## §10 bun build --compile

- Bundles imports + runtime into one executable; `--target` matrix: linux/windows/darwin ×
  x64(+baseline/modern)/arm64, incl. musl variants. Caveats: large binary (docs' own words),
  baseline builds for older CPUs, some Windows metadata flags can't cross-compile. `[docs]`
- Not always fully self-contained — a compiled binary has failed after its source tree was
  deleted; test from a clean machine before trusting distribution. `[gh #14676 / #14649]`
- `import.meta.main` has been reported `false` inside compiled executables. `[gh]`

## §11 Env & entrypoint idioms

- `Bun.env` / `import.meta.env` are aliases of `process.env` — prefer `process.env` for
  portability. `[docs]`
- `import.meta.main` ("did this file start the process?") is the dual-use guard;
  `import.meta.dir` / `.path` (+ Node-compat aliases `.dirname` / `.filename`) are the
  CWD-HOSTILE path anchors. `[docs]`
- House idiom: `process.env.X_BIN ?? "x"` for binary overrides; `Bun.which(bin)` as the
  PATH gate before real work. `[corpus]`
- `bun <path>` ≡ `bun run <path>`; on a name collision with a package.json script, `bun run`
  prefers the script and bare `bun` prefers the file — moot in zero-config, relevant at
  graduation. `[docs]`

## §12 Performance reality

- Cold start ~8–15 ms vs Node ~60–120 ms — the REAL win for one-shot local scripts; marketed
  multi-x throughput numbers do not transfer to steady-state workloads (~20–40%). `[3p
  byteiota.com / dev.to production reports]`
- Long-running processes leak (Bun.$ loops #13060; spawn polling RSS >1 GB over ~12 h #18265;
  #25487) — bun is for one-shot scripts and short-lived tools; daemons/watchers need another
  runtime or periodic restarts. `[gh]`

## §13 Type-checking (TRANSPILE-ONLY wiring)

- Bun strips types; nothing checks them at run time. Editor LSP is necessary but not
  sufficient. `[docs+3p]`
- At graduation (package.json project): add `@types/bun` + `typescript` as devDeps, a minimal
  tsconfig, and wire `bunx typescript@<pin> tsc --noEmit` as a separate gate (never inline in
  the script's own execution path). Zero-config single files have no tsc story — the floor +
  tests + editor are the whole net. `[3p oneuptime 2026 + gh]`
