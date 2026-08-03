# Harness integration

> **SOLE owner of integration scope.** The profile checker is a reusable deterministic floor. A target
> research repository owns when to run it, its bundle path, exceptions, and any hook. Do not install a
> global hook for one repository's documentation policy.

## Start with a repository-local command

Add a narrow task in the research repository, pointing at its bundle. For a local installation of this
skill, a `mise` task can use the portable home-relative path below:

```toml
[tasks."docs:research-check"]
description = "Check the R&D knowledge bundle profile."
run = 'bun "$HOME/.agents/skills/governing-research-documentation/scripts/research-docs-check.ts" --root research/knowledge --raw-root research/raw --base "${DOCS_BASE:-HEAD}"'
```

The local default, `DOCS_BASE=HEAD`, intentionally compares an uncommitted working tree with its
current commit. Run that task before requesting review and in the repository's existing validation
command. Do not copy this command into a user-wide config or create a user-wide hook guarded by a
repository pathname: that still runs in unrelated repositories and violates the narrow-scope rule.

For CI, make the checker available *inside the CI environment* through an explicit, versioned repository
dependency, vendored release, or checkout bootstrap. A developer's `$HOME/.agents` installation is useful
for local feedback but is not a reproducible CI dependency. Pin the source revision and run the same
arguments that developers run. CI must set `DOCS_BASE` to the merge-base with its protected target:

```bash
git fetch origin main
DOCS_BASE="$(git merge-base HEAD origin/main)" mise run docs:research-check
```

Replace `main` with the repository's protected target. Never use `--base HEAD` after CI has checked
out the candidate commit: that compares the candidate to itself and hides committed rewrites of raw
or evidence. The merge-base makes the integrity comparison meaningful for both committed and
uncommitted candidate changes.

## Optional project hook, never a default

Only after the command is stable and the repository has agreed on its enforcement moment may it be wired
as a project-local hook under that repository's `.claude/` or equivalent harness directory. Scope the
matcher to writes under the knowledge-bundle path. The hook must invoke the repository task, report a
failing finding with the next repair command, and fail open on runner/tool failures rather than pretending
the documentation is valid.

Do **not** add a global `Stop`, `PostToolUse`, or session hook from this skill. The checker is not a
universal policy, and an always-running hook would make every repository pay for this one. Read
`operating-the-harness` before any hook or settings change; it owns mechanism choice and scope.

## Enforcement ladder

1. **Advisory:** the skill makes an admission decision and runs the checker before review.
2. **Repository task:** a local `docs:research-check` command is documented by the project and run in
   ordinary validation.
3. **CI:** a reproducible checkout runs the checker against the change base.
4. **Narrow hook (only if repeated omission remains):** the project, not this personal skill bundle,
   configures it and owns its retirement condition.

Skipping directly to a hook hides an unresolved semantic problem behind friction. A hook can enforce that
a command ran; it cannot determine whether “create a new document” was the right admission decision.

## Checker boundary

The checker is expected to enforce only deterministic properties: YAML/frontmatter parsing, required
standard and `rd_` fields, the bundle-local type-code registry, filename/ID grammar, live ID and active
authority uniqueness, status/role combinations, local-reference resolution, raw SHA-256, index
registration, generated-view expiry, and Git-base preservation of raw/evidence plus admitted
ID/type/role/path. It also rejects base-visible ID reuse at another path and reassignment of a mapping
used by a base concept. New IDs must extend each base code/month maximum contiguously, leaving prior
gaps untouched. It returns 1 for findings and 2 for invocation/environment failures.

It must not claim to validate scientific truth, source entailment, semantic duplication under different
keys or IDs, whether a content type/title is apt, human identity, completeness of raw capture, or
usefulness of a review. These are admission and review gates performed by accountable people with the
skill's aid. Keep raw-material hashing, access control, retention law, and secret scanning in their owning
repository controls; an OKF checker is not a data-governance system.

An existing corpus needs an explicitly reviewed one-time migration before strict naming enforcement.
Ordinary `--base` checking correctly rejects durable renames; do not add a permanent exemption or weaken
the gate. Migrate references and IDs together, establish the migrated commit as the new baseline, then
run the same local and CI commands above.

## Residual: discovery is not an authority-preserving read, and write must stay constrained

`repo-search` is a discovery surface: it locates candidate files and text. It does not freeze which
authority was read, what coverage was achieved, or which bytes later reasoning consumed. Do not relabel
that discovery as a repository truth API.

If repeated, evidenced omissions show that discovery plus ordinary file reads lose authority, coverage,
or provenance, a future **read-only** `repo-read` may produce a frozen `READ BUNDLE`: declared question,
authority paths, exact locators, content digests, coverage boundary, and conflicts. It would consume
search internally but would neither synthesize a conclusion nor authorize adoption. This is an OPEN
residual, not a tool to implement in this forge.

Do not create a generic `repo-write`. A broad write surface would bypass admission and make a fluent
model's interpretation look authorized. If a repeated, measured need remains after the read boundary is
proven, consider only a constrained `repo-apply`: it must consume a domain-signed artifact, verify a base
digest, restrict writes to an explicit allowlist, and run named acceptance commands. `operating-the-harness`
owns mechanism choice; this Skill owns the admission/lineage constraints. These are house controls, not
claims established by OKF or by any LLM-wiki literature.
