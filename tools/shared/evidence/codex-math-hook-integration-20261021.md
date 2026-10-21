# Codex math hook integration verification

## Scope and acceptance boundary

This verification executes the combined actual adapter and helper, not a stub
or a reimplementation of the policy. Source files are unchanged. Checks use
synthetic Stop stdin and an isolated temporary HOME/XDG environment. They do
not invoke a model turn, native vendor Stop event, renderer, or service.
Results are recorded below after foreground execution.

The consumer path is `agents/codex/hooks.json` Stop registration plus the
`agents/hooks/hooks.toml` vendor identity, through `scripts/render-home.ts`
to generated `~/.codex/hooks.json`. The adapter imports the real
`./math-delimiters.ts`; both directories and render inputs already belong to
`scripts/config-registry.ts`. The manifest identity does not wire an event;
the handwritten vendor Stop entry does. No central math `[[hook]]` is added.

Source declarations, a rendered home configuration, and an actual session's
loaded hooks are separate acceptance surfaces. This run verifies the source
consumer path and in-memory wiring, not deployed or session state. Root owns
normal gates and rendering from accepted source with `mise run link:dots`.

## Reproducible verification program

Run the TypeScript block below through Bun stdin from the repository root.
It writes only an isolated temporary directory, executes the actual adapter
entrypoint, and validates the existing manifest with its own parser and wiring
helpers. The count of cases refers to separate synthetic process invocations.
No fixture or test file is added to the repository.

```typescript
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegistry, HooksConfigSchema, wire } from "./scripts/hook-registry.ts";
import { loadSlugs } from "./agents/hooks/slugs.ts";

const isolated = mkdtempSync(join(tmpdir(), "codex-math-integration-"));
const env = {
  ...process.env,
  HOME: isolated,
  XDG_CONFIG_HOME: join(isolated, "config"),
  XDG_CACHE_HOME: join(isolated, "cache"),
  XDG_DATA_HOME: join(isolated, "data"),
  XDG_STATE_HOME: join(isolated, "state"),
  CODEX_HOME: join(isolated, "codex"),
  CLAUDE_CONFIG_DIR: join(isolated, "claude"),
  HOOK_SLUG: "dotfiles:codex-math-delimiters",
};
const cases = [
  ["legacy-inline-display", JSON.stringify({last_assistant_message: "数式 \\(x+1\\) と \\[y=2\\]。"}), "block"],
  ["fenced-code", JSON.stringify({last_assistant_message: "```tex\n\\(x\\) \\[y\\]\n```"}), "allow"],
  ["inline-code", JSON.stringify({last_assistant_message: "例: `\\(x\\) \\[y\\]`"}), "allow"],
  ["dollar", JSON.stringify({last_assistant_message: "数式 $x+1$ と $$y=2$$。"}), "allow"],
  ["retry-guard", JSON.stringify({stop_hook_active:true,last_assistant_message:"\\(x\\) \\[y\\]"}), "allow"],
  ["malformed", "{", "diagnostic"],
  ["missing", "{}", "diagnostic"],
  ["wrong-type", JSON.stringify({last_assistant_message:42}), "diagnostic"],
  ["null-response", JSON.stringify({last_assistant_message:null}), "diagnostic"],
];
for (const [name, input, expected] of cases) {
  const result = Bun.spawnSync([process.execPath, "agents/codex/hooks/enforce-math-delimiters.ts"], {
    env, stdin: Buffer.from(input), stdout:"pipe", stderr:"pipe", timeout:5000,
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (result.exitCode !== 0 || result.error) throw new Error(`${name}: process failed`);
  if (expected === "block") {
    const decoded = JSON.parse(stdout);
    if (stdout.trim().split("\n").length !== 1 || decoded.decision !== "block" ||
        typeof decoded.reason !== "string" || !decoded.reason.includes("$...$") ||
        !decoded.reason.includes("$$...$$") || !decoded.reason.includes("コード外") ||
        !decoded.reason.includes("そのまま保持") || stderr !== "") {
      throw new Error(`${name}: invalid block output`);
    }
  } else if (stdout !== "") {
    throw new Error(`${name}: unexpected stdout`);
  } else if (expected === "diagnostic") {
    if (stderr.trim().split("\n").length !== 1 || !stderr.startsWith("[dotfiles:codex-math-delimiters] check failed open:") || Buffer.byteLength(stderr) > 1024) {
      throw new Error(`${name}: invalid diagnostic`);
    }
  } else if (stderr !== "") {
    throw new Error(`${name}: unexpected stderr`);
  }
  console.log(JSON.stringify({case:name,exit:result.exitCode,stdout,stderr}));
}
const registry = loadRegistry("agents/hooks");
if (registry.errors.length) throw new Error(registry.errors.join("; "));
const slugs = loadSlugs("agents/hooks/hooks.toml");
if (slugs instanceof Error) throw slugs;
const identities = slugs.identities.filter(h => h.slug === "codex-math-delimiters");
if (identities.length !== 1 || identities[0].script !== "codex/hooks/enforce-math-delimiters.ts" ||
    identities[0].commands.length !== 1 || identities[0].commands[0] !== "bun ~/.codex/hooks/enforce-math-delimiters.ts") throw new Error("invalid identity");
const config = await Bun.file("agents/codex/hooks.json").json();
const hooks = HooksConfigSchema.parse(config.hooks);
const wired = wire(hooks, registry.specs, "codex");
const command = "HOOK_SLUG=dotfiles:codex-math-delimiters bun ~/.codex/hooks/enforce-math-delimiters.ts";
if (wired.Stop.flatMap(g => g.hooks).filter(h => h.command === command).length !== 1 ||
    registry.specs.some(s => s.script.includes("math-delimiters"))) throw new Error("invalid wiring");
console.log("manifest: valid; one vendor identity; one wired math Stop; no central math entry");
const ownership = Bun.spawnSync([process.execPath, "scripts/one-writer-check.ts"], {
  env, stdout:"pipe", stderr:"pipe", timeout:10000,
});
console.log(JSON.stringify({check:"one-writer",exit:ownership.exitCode,stdout:ownership.stdout.toString(),stderr:ownership.stderr.toString()}));
if (ownership.exitCode !== 0 || ownership.error) throw new Error("one-writer failed");
```

## Limits and housekeeping

The helper scans at most 1,048,576 UTF-16 code units, returns at most 100
findings, and reports columns in UTF-16 code units. This is a bounded prefix,
not a guarantee that the entire response was checked. Its Markdown subset
supports top-level fences and inline backtick spans; it is not a full
CommonMark parser for indented code or list/blockquote container blocks.
Only paired legacy delimiters are reported. Therefore this check does not
prove strict style enforcement for every Markdown or TeX construction.

A native Stop block requests continuation and the retry guard permits it to
finish; it cannot pre-hide already rendered text. Desktop and fresh native
event coverage, hook-environment Bun availability, rendered home contents,
and actual loaded session hooks remain unverified.

No version, CHANGELOG, changeset, source fix, committed test fixture, home
configuration, service, model turn, commit, push, or landing is part of this
verification-only change. Temporary isolation directories are left in the
system temporary area; no user hook history or logs are written by the
adapter or this program.

## Foreground results

`mise run lint:ts -- agents/codex/hooks/enforce-math-delimiters.ts agents/codex/hooks/math-delimiters.ts`
exited 0. The task ran its Bun-runtime, no-sync and no-disable prerequisites,
then `bunx --bun oxlint --type-aware` on the two named files without findings.

The verification program exited 0. Every adapter invocation exited 0:

| Case | stdout | stderr |
| --- | --- | --- |
| Legacy inline and display prose | One valid block JSON line | Empty |
| Fenced code only | Empty | Empty |
| Inline code only | Empty | Empty |
| Dollar delimiters | Empty | Empty |
| Retry guard with legacy prose | Empty | Empty |
| Malformed JSON | Empty | One bounded malformed-payload diagnostic |
| Missing response | Empty | One bounded missing/non-string diagnostic |
| Non-null wrong-type response | Empty | One bounded missing/non-string diagnostic |
| Null response | Empty | One bounded missing/non-string diagnostic |

The exact block stdout was the following JSON followed by a newline:

```json
{"decision":"block","reason":"[dotfiles:codex-math-delimiters] 直前の返答のコード外にある数式区切りだけを修正してください。インライン数式の \\\\( ... \\\\) を $...$ に、ディスプレイ数式の \\\\[ ... \\\\] を $$...$$ に置き換えてください。数式の内容、すべてのコード、その他の文章や内容はそのまま保持してください。"}
```

The exact diagnostic lines, each newline-terminated, were:

```text
[dotfiles:codex-math-delimiters] check failed open: malformed hook payload
[dotfiles:codex-math-delimiters] check failed open: missing or non-string last_assistant_message
```

Manifest validation reported:
`manifest: valid; one vendor identity; one wired math Stop; no central math entry`.
The actual `scripts/one-writer-check.ts` process, under the same isolated HOME,
exited 0 with stdout `one writer: every checked file has exactly one` followed
by a newline, and empty stderr. This checks source ownership and an isolated
home; it makes no assertion about live home files.

The exact successful program-extraction command was:

```sh
bun -e 'const text = await Bun.file("tools/shared/evidence/codex-math-hook-integration-20261021.md").text(); const code = text.split("```typescript\n")[1]?.split("\n```\n")[0]; if (!code) throw new Error("missing verification program"); const child = Bun.spawnSync([process.execPath,"run","-"],{stdin:Buffer.from(code),stdout:"inherit",stderr:"inherit",timeout:20000}); process.exit(child.exitCode);'
```

An initial extraction attempt used `.split("```")` instead of
`.split("\n```\n")`. It exited 1 with `Unterminated string literal` at the
fenced-code fixture before executing the adapter. Correcting only extraction
boundaries produced the successful run above; no implementation failure was
observed and no source was patched.

`rumdl check tools/shared/evidence/codex-math-hook-integration-20261021.md`
exited 0 with no issues found.
