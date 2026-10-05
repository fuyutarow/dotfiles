# Forge verification ledger — renting-cloud-gpus

## §0 Admission (forging-skills F2/F4)

- Need: the owner asked to rent GPUs for experiments while R99's GPU was down (2026-10-05), with
  one hard constraint in their words: 「ソースコードの放置だけはしたくない」, budget ≈ 500 円/24 h.
- Ownership void: literal search of agents/skills for `vast` found one incidental word
  (proving-theorems, "vastly"); `runpod` none. The semantic battery returned NO_INDEX (stale ccc
  index), so absence rests on the literal search only — recorded as a residual.
- Incumbent considered: the vendor ships its own `vastai/SKILL.md` (CLI syntax, ~4,500 words). It
  covers commands, not the house constraints (destroy discipline, secrecy tiers, key storage,
  budget). Vendoring it was rejected for listing cost; this skill links its facts in
  `references/vast-recipe.md` and owns only the house layer.

## §1 Sources (2026-10-05)

| Fact | Source |
|---|---|
| CLI commands, search syntax, `new_contract`, destroy `-y`, bid pitfall, copy paths, poll warning | github.com/vast-ai/vast-cli `vastai/SKILL.md`, `_autodocs/` (via Context7) |
| Storage bills while stopped; bandwidth any state; per-second billing; $0 → stop → deletion after grace | docs.vast.ai/guides/reference/billing, /guides/instances/rental-types |
| Unprivileged Docker isolation; "provider security varies"; Secure Cloud = ISO 27001, Tier 3/4; no disk-wipe statement | docs.vast.ai/guides/reference/faq/security |
| Docker only, no DinD | docs.vast.ai/guides/instances/managing-instances |
| `VAST_API_KEY` read before the key file; `set api-key` writes a file | vast-cli `_autodocs/configuration.md`, `errors.md` |
| RunPod / Lambda prices | runpod.io/pricing, lambda.ai/pricing (fetched 2026-10-05) |
| Fly.io GPUs ended 2026-07-31 | community.fly.io deprecation thread |

## §2 Live checks

- `uvx --from vastai==1.8.3 vastai --version` → 1.8.3 (not in Homebrew: `brew info vastai` → no formula).
- `search offers` with `verified=true` and with `verified=true datacenter=true` both return offers
  without an API key; numbers in `references/providers.md`.

## §3 Not yet verified (open)

- No rental was made (no account key on the machines yet): create, wait, ship, retrieve, destroy,
  and the post-destroy listing are documented, not observed. First real run must confirm them and
  update this ledger.
- `datacenter=true` is the CLI's virtual column for hosting type; equating it with the website's
  "Secure Cloud" checkbox is inferred from the docs, not confirmed field-by-field.
