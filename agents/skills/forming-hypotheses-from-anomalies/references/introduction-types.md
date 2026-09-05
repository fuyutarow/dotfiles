# Introduction types — the extra requirement each one carries

> **Scope**: step 6 of SKILL.md's procedure. The `Introduction type` row is not a label. Each type
> carries a DIFFERENT additional obligation, because each fails differently. `OTHER` without a name
> fails the floor — the open set exists so the list does not become a closed theory of invention.

| Type | You are claiming | Extra requirement in the packet | The failure it is prone to |
|---|---|---|---|
| `NONE` | the closed route explained it | nothing — packet is terminal, no handoff | claiming NONE while the explanation quietly uses a term you never supplied; run the introduced-terms check |
| `COMMON-CAUSE` | several correlated regularities share one hidden upstream cause | name every regularity the single cause must explain, and one that would break it | naming a summary rather than an upstream term — a common cause must be causally prior, not a relabelling of the correlation |
| `TRANSFER` | a relation from another domain maps onto this one | source relation with its locus, at least two correspondence pairs, ONE concrete non-correspondence, and the break condition | mapping objects rather than relations; treating source-domain success as target evidence |
| `NEW-PREDICATE` | a term not in the supplied vocabulary is required | the term's intended extension, and what would show the distinction it draws is spurious | the invented term's arity/boundary is left open, which is exactly what the mechanised literature could not automate (VOC-002) |
| `EXPANSIVE-PARTITION` | a property is added that the object's known identity does not carry | which known identity is being revised, and what it costs if it is | slipping a restrictive partition through as expansive — the test is whether the added property is already known of these entities (VOC-007) |
| `OTHER — <name>` | none of the above fits | the name, plus what obligation you are taking on in place of the rows above | using `OTHER` to skip an obligation |

## Why TRANSFER carries the heaviest row

Mapping is the one operation the corpus shows to be genuinely constructive once both structures are
given. It is still NP-hard to do optimally (TRF-002). The expensive step is enumerating globally
consistent interpretations, not finding correspondences (TRF-003).
What is NOT constructive is choosing the source. Retrieval uses a cheap non-structural filter.
Structural matching cannot run against a whole memory (TRF-005). No complexity
result for source selection was found at all (TRF-Y002). So the packet demands the
non-correspondence and the break condition — the parts a fluent mapping hides.

## Why the list is open, and what that costs

Every formalisation reaching candidate generation supplies a non-canonical preference from
outside the construction. Least general generalisations stop being unique once you
leave first-order terms (TRF-007 vs TRF-008). The categorical construction drops uniqueness
deliberately (TRF-009). One implemented blend enumerates 736 candidates, of which 48 preserve
every axiom. Picking one needs a weighted score added on top (TRF-012). A closed taxonomy would repeat that mistake in the other direction. It asserts a canonical
carve-up where the literature has none. Hence `OTHER — <named>`. The cost of the open set is that it cannot be exhaustively checked. The
floor can only require that the name exists.

## Restrictive vs expansive — the one mechanical test in the set

The design-theory formalisation makes this decidable in its own setting. A partition is restrictive if the signature of the
added knowledge intersects the existing signature. Otherwise it is expansive (VOC-007). That is a lexical test. It is the closest thing the corpus offers to a computable
"is this inside my vocabulary" check. The packet's `Introduced terms` row is its practical
shadow: words in your hypothesis absent from what you cited. Treat it as a REPORT. The same undecidability that governs A3 governs this (VOC-003). A word you
did not cite may be ordinary. A word you did cite may be doing new work.
