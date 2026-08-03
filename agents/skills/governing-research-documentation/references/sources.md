# Sources and claim grades

> **SOLE owner of external lineage.** Re-verify URLs when reforging. The profile's local rules are
> engineering choices; upstream sources constrain terminology and illuminate trade-offs, but do not silently
> turn into mandates.

## Normative for this profile

| Source | Grade | What it governs here |
|---|---|---|
| [Open Knowledge Format v0.2 specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) | author-confirmed, primary | The meaning of standard OKF concepts: Markdown concepts, YAML frontmatter, `type`, `sources`, `generated`, `verified`, `status`, `stale_after`, indexes, and extension fields. The local profile may tighten these rules, but must label the tightening. |
| [okf-rd-profile.md](okf-rd-profile.md) | constructed, local normative | The four role taxonomy, authority-key uniqueness, append-only evidence policy, generated-view prohibition, and local `rd_` extension schema. These are this skill's policy choices, not claims of OKF conformance beyond the upstream spec. |

## Informative inputs, not mandates

| Source | Grade | Narrow use in this skill |
|---|---|---|
| [W3C PROV-DM](https://www.w3.org/TR/prov-dm/) | author-confirmed, primary | Supports keeping provenance as structured relationships rather than prose recollection. It does not prescribe this profile's field names. |
| [Rust RFC template](https://rust-lang.github.io/rfcs/0000-template.html) and [RFC process](https://rust-lang.github.io/rfcs/) | author-confirmed, primary | Illustrate reviewable proposals with motivation, alternatives, and an explicit decision path. They do not make every research note an RFC. |
| [Google Engineering Practices: code review](https://google.github.io/eng-practices/review/reviewer/) | author-confirmed, primary | Supports bounded, actionable review feedback rather than unscoped requests. It is an analogy for review contracts, not a research-validity standard. |
| [Michael Nygard, Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) | author-confirmed, primary author essay | Informs the retained decision/lifecycle record; the R&D profile deliberately does not import ADR status vocabulary wholesale. |
| [Andrej Karpathy, LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | author-confirmed, primary informal | Motivates compiled, linked Markdown knowledge. It is not a specification, security model, or proof that autonomous updates preserve truth. |
| [LangChain OpenWiki README](https://github.com/langchain-ai/openwiki/blob/main/README.md#open-knowledge-format) | author-confirmed, primary project docs | Confirms that the current tool emits OKF v0.1. It may generate a wiki, but it is not this v0.2 profile validator. |
| [LLM Wiki plugin failure modes](https://github.com/praneybehl/llm-wiki-plugin/blob/main/skills/llm-wiki/SKILL.md#failure-modes-to-guard-against) | author-confirmed, primary project docs | Names silent corruption, wiki-self-reference drift, and maintenance ratchet. It motivates raw re-checks and deterministic lint, not autonomous authority. |
| [POSIX.1-2024 portable filename character set](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap03.html) | author-confirmed, primary standard | Lists both `_` and `-` as portable filename characters but specifies no delimiter semantics. It does not prescribe this profile's hierarchy. |
| [RFC 3986 URI generic syntax](https://www.rfc-editor.org/rfc/rfc3986.html) | author-confirmed, primary standard | Defines both `_` and `-` as unreserved URI characters. URI syntax does not determine a local research-filename grammar. |
| [Google URL structure guidance](https://developers.google.com/search/docs/crawling-indexing/url-structure) | author-confirmed, primary vendor docs | Recommends hyphens for words in public URLs. This is deliberately not generalized into an SEO claim about repository-local filenames. |
| [Google C++ file naming](https://google.github.io/styleguide/cppguide#File_Names) | author-confirmed, primary project style guide | Allows underscores or dashes and says to follow local convention, preferring underscore only when no pattern exists. It illustrates ecosystem dependence, not a universal separator rule. |

## Distillation boundary

The central rule — **decide admission before generating another durable document** — is constructed from
the local incident shape: duplicated prose became an authority collision because it lacked role, lifecycle,
and review contract. It is not attributed to OKF, a wiki tool, or an LLM vendor. The tool-changing result
is the profile and checker: they expose fields and collisions that prose instructions alone leave optional.

The document-ID and filename grammar is likewise constructed house policy. POSIX portability, URL style,
or programming-language identifier customs do not prescribe its delimiter hierarchy. Its justification is
local and operational: one machine-checked identity, one visible ID/title boundary, stable paths on update,
and no silent number reuse. Exact rules live only in [naming.md](naming.md).
