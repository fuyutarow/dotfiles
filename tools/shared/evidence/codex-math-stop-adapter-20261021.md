# Codex math Stop adapter

## Result and scope

Implemented `agents/codex/hooks/enforce-math-delimiters.ts` and registered it
only in Codex's handwritten Stop source, with one `[[vendor_hook]]` identity.
The coordinator corrected the previous write-set restriction: vendor-specific
source entries are authorized; duplicating centrally wired `[[hook]]` entries
remains forbidden. The earlier central-grammar blocker is resolved by using
the existing vendor-specific registration pattern, without extending grammar.

Source registration and static validation do not establish live enforcement.
No generated home file, renderer, registry implementation, shared bridge,
wrapper, other hook entry, or permissions declaration was edited.

## Adapter contract

The existing Codex reply-language adapter is the reference:
`agents/codex/hooks/enforce-reply-language.ts` uses `parseJson`, `at`, `strAt`,
and `hookJson`. `agents/codex/hooks/lib.ts` really re-exports `hookJson` and
`hookStderr` from `agents/hooks/lib.ts`; these are not invented helper names.

The new adapter parses stdin with `parseJson(await Bun.stdin.text())` and
returns exit 0 before inspecting the reply when `stop_hook_active` is `true`.
It reads only the string `last_assistant_message`. Missing or non-string
responses and malformed JSON produce one stderr diagnostic and exit 0, with
no stdout decision and no retry request. Unexpected inspection failures also
fail open with one diagnostic. Diagnostic content is normalized and capped at
240 characters before the fixed prefix is added; no payload or exception
content is disclosed.

The adapter imports the coordinator-supplied future helper
`findLegacyMathDelimiters` from `./math-delimiters.ts`. Its frozen return
contract is readonly `MathDelimiterViolation` values containing `kind`
(`inline` or `display`), `line`, and `column`. No helper or stub was created.
The adapter uses only whether the returned list is empty; code exclusion is
the helper's responsibility and requires integration verification.

On a finding the adapter writes exactly one newline-terminated JSON object
using `hookJson({ decision: "block", reason: ... })`, then exits 0. This
matches the existing Codex Stop output contract rather than guessing Claude
protocol. The Japanese reason requests only replacing legacy inline math
backslash delimiters with `$...$` and display delimiters with `$$...$$`
outside code, preserving all mathematics, code, wording, and other content.
A continuation carrying `stop_hook_active: true` is allowed immediately.

## Exact declarations and deployment

The added `agents/hooks/hooks.toml` identity is:

```toml
[[vendor_hook]]
slug = "codex-math-delimiters"
script = "codex/hooks/enforce-math-delimiters.ts"
commands = ["bun ~/.codex/hooks/enforce-math-delimiters.ts"]
```

The added `agents/codex/hooks.json` Stop group contains one command:

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "HOOK_SLUG=dotfiles:codex-math-delimiters bun ~/.codex/hooks/enforce-math-delimiters.ts",
      "timeout": 5
    }
  ]
}
```

Direct Bun invocation is handled by the existing renderer's command-target
validation and avoids a new Bash wrapper. It depends on Bun being reachable
in the hook environment; no launcher fallback or runtime verification is
claimed. The five-second timeout bounds the declared hook execution.

`agents/codex/hooks.json` supplies the vendor-specific event registration;
`[[vendor_hook]]` supplies identity and command ownership, not event wiring.
There is no new central `[[hook]]` entry to duplicate. Existing hook groups
remain in their original order, with the math group appended to Stop.

The declaration flow remains handwritten `agents/codex/hooks.json` plus
`agents/hooks/hooks.toml` through `scripts/render-home.ts` to generated
`~/.codex/hooks.json`. Existing `scripts/config-registry.ts` rows already
cover these render inputs and the linked hook directories, so no registry
change is needed. The sole home writer remains the renderer. The coordinator
must integrate the helper and accepted source before deploying with
`mise run link:dots`; this worker did not deploy.

## Verification

Foreground checks completed successfully:

- `bun scripts/one-writer-check.ts`: exit 0; every checked file has one writer.
- The following nonexecuting manifest/config validation: exit 0; one vendor
  math identity and one preserved Stop entry, with no shared math hook.
- `rumdl check tools/shared/evidence/codex-math-stop-adapter-20261021.md`:
  exit 0; no issues found.

```sh
bun -e 'import { loadRegistry, HooksConfigSchema, wire } from "./scripts/hook-registry.ts"; import { loadSlugs } from "./agents/hooks/slugs.ts"; const registry = loadRegistry("agents/hooks"); if (registry.errors.length) throw new Error(registry.errors.join("; ")); const slugs = loadSlugs("agents/hooks/hooks.toml"); if (slugs instanceof Error) throw slugs; const identity = slugs.identities.filter(h => h.slug === "codex-math-delimiters"); if (identity.length !== 1 || identity[0].commands[0] !== "bun ~/.codex/hooks/enforce-math-delimiters.ts") throw new Error("invalid math identity"); const config = await Bun.file("agents/codex/hooks.json").json(); const hooks = HooksConfigSchema.parse(config.hooks); const wired = wire(hooks, registry.specs, "codex"); const math = wired.Stop.flatMap(g => g.hooks).filter(h => h.command === "HOOK_SLUG=dotfiles:codex-math-delimiters bun ~/.codex/hooks/enforce-math-delimiters.ts"); if (math.length !== 1) throw new Error("expected one math Stop command"); if (registry.specs.some(s => s.script.includes("math-delimiters"))) throw new Error("unexpected shared math hook"); console.log("manifest valid; one vendor math identity and one preserved Stop entry; no shared math hook");'
```

## Integration limits and housekeeping

The helper import is intentionally unresolved until coordinator integration.
No full TypeScript check, tests, hook execution, model turn, home write,
service action, commit, push, or landing was performed. The coordinator owns
helper integration, scoped lint, normal gates, rendering, and acceptance.
A Stop block requests continuation; it cannot guarantee hiding already
rendered text. Desktop runtime coverage remains unverified.

This is agent configuration rather than a tool release. No version,
CHANGELOG, release changeset, or fixture was added. The validated count of
one refers to the math command in the statically wired Codex Stop groups,
not to observed runtime invocations.
