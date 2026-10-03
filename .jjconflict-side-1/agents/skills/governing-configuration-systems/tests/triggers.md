# Fire / no-fire desk-check — governing-configuration-systems

Read only the name and description of this skill and plausible siblings. A race is a description
or cut defect.

## FIRES

| Ask | Why here |
|---|---|
| “Should this signed policy be TOML or JSON, and what exactly do we hash?” | Consumer/trust classification and byte boundary are the owned transition. |
| 「JSONC のコメントに例外を書いて gate へ読ませてよい？」 | Machine-enforced exception versus decision record boundary. |
| “Our formatter breaks signatures on equivalent JSON. Design the canonicalization contract.” | Raw-byte versus canonical semantic integrity. |
| 「TOML の設定を複数ファイルから読む。どの値が有効か監査できる契約にしたい」 | Precedence, merge, authority, and acceptance receipt. |
| “Turn this generated lockfile and its manifest into a reproducible, verified configuration contract.” | Generated writer and exact-resolution role. |
| “We need a schema, duplicate-key policy, and negative fixture for this gate input.” | C4–C5 contract and target acceptance. |

## MUST NOT FIRE

| Ask | Route |
|---|---|
| “What TOML syntax writes an array of tables?” | Direct explanation; no configuration-system decision. |
| “Add a new property to our Rust serde config struct.” | implementing-and-debugging plus writing-rust. |
| “Set up a Claude Code permission rule and hook.” | operating-the-harness. |
| “Add the correct configuration layers and mise tasks to this new repo.” | wiring-repositories, then this skill only for a selected layer's contract. |
| “Which pyproject.toml dependency declaration is valid?” | writing-python. |
| “Make this deployment release safe under a costly rollback risk.” | practicing-tiger-style; co-fire here only when config representation is central. |

## Ordered co-fire

| Braided ask | Order |
|---|---|
| “Wire a repository and define its policy-config contract.” | wiring-repositories selects/wires layers → HERE defines the selected configuration contract. |
| “Harden a high-consequence signed policy release.” | practicing-tiger-style selects the risk ledger → HERE names representation/canonicalization/validator evidence. |
| “Add a .claude permission setting that needs an auditable effective input.” | operating-the-harness owns mechanics → HERE may define the generic configuration contract. |

## Regression predicate

The description must expose: consumer/trust classification; TOML/JSON/JSONC and canonicalization
tokens; signing/digest/gating/schema/layering terms; the named sibling cuts; and SOLO final
acceptance. It must not fire for syntax explanation, a language-specific manifest edit, or
.claude mechanics alone.
