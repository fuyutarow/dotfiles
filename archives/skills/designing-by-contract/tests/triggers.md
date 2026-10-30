# Selection and behavior cases

These are review cases; they do not claim that a prompt alone proves enforcement.

## Selection

| Request | Expected owner |
|---|---|
| Design API preconditions, postconditions, and invariants | designing-by-contract |
| Enforce negative space through types and runtime controls | designing-by-contract |
| Apply parse, don't validate to this boundary | designing-by-contract plus the language owner for implementation |
| Prevent a stale permission from authorizing an effect | designing-by-contract |
| Decide schema authority and generated-client compatibility | designing-by-contract; configuration authority remains with its owner |
| Review TigerStyle variable names and formatter rules | practicing-tiger-style |
| Design CLI exit codes and JSON output | designing-command-line-interfaces |
| Draft a legal agreement or design a token's business model | Domain owner; not this skill |

## Behavior

| Case | Required observation | Failure |
|---|---|---|
| Transfer(from: UserId, to: UserId, amount: Money) | Same-typed roles can swap; named fields or role types are proportionate choices, neither proves intended recipient | The compiler verifies user intent |
| Decoder returns AuthorizedOrder with mutable aliases and a permission snapshot | Separate shape from mutation and expiring authority; trace reload and aliases | A successful parse removes all future checks |
| Parser returns SafeToDelete; a worker acquires the workspace before unlink | Couple permission to effect under shared ownership/exclusion and test that interleaving | A typed label or a separate recheck prevents the race |
| Another supported writer bypasses the lock | Identify incomplete mediation; leave prevention unsupported | Naming a lock proves safety |
| Internal invariant versus invalid user input or revoked authority | Internal contradiction gets assertion/containment; expected errors get explicit handling | Assertion-crash on routine invalid input |
| Postcondition checks after irreversible payment | Separate detection, prevention, and reconciliation | Assertion undoes a charge |
| Pure function returns PaidOrder and SendReceipt | Establish payment evidence, executor, crash window, and deduplication independently | Purity or Result means exactly-once |
| New schema generates both clients successfully; old client remains deployed | Check compatibility in actual deployment directions | Current compilation proves old client works |
| Subtype strengthens a required input range | Preserve substitutability; reject the stronger precondition for existing callers | The override may demand more because its implementation prefers it |
| Enabled contract declaration but deployed assertions disabled | Inspect the actual enforcer configuration and residual | A declaration guarantees checks run |
| A nonterminating liveness property is assigned to a stopping execution monitor | Expose the monitor's property/control limits | Runtime Enforcement proves any eventual outcome |
| In-house package contains agents/openai.yaml | Repository gate and copy/deploy boundary refuse the package before live installation | Documenting the ban alone counts as enforcement |

Allowed controls accompany rejected cases.
Design-only outputs label checks as planned; implementation claims require observed checks.
