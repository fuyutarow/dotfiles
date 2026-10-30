# Sources and scope

## Design by Contract

[Eiffel tutorial: Design by Contract, Assertions and Exceptions](https://www.eiffel.org/doc/eiffel/ET-_Design_by_Contract_%28tm%29%2C_Assertions_and_Exceptions).
Read the contract basics, preconditions, postconditions, class invariants, runtime assertion monitoring,
and exceptions before attributing a DbC-specific rule.

DbC specifies mutual caller/supplier obligations and the state maintained at public boundaries.
A violated precondition indicates a caller defect; a violated postcondition or invariant indicates a supplier defect.
The tutorial distinguishes such internal correctness contracts from ordinary external input handling.
Runtime assertion monitoring is configurable; the existence of a contract does not establish that deployed checks are enabled.
If inheritance/subtyping matters, preserve caller promises rather than strengthening accepted preconditions
or weakening guaranteed postconditions in an override.

## Types and parsing

The inherited corpus position `urn:uuid:01a0cd74-0db5-7631-a93d-b6a4a73e1b19` covers static types,
parsers, typestate, schema authority, and effect residuals.
[Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
motivates carrying established facts in returned representations.
The operational construction-path audit is this skill's design method, not a guarantee supplied by every language.

## Runtime Enforcement

[Schneider: Enforceable Security Policies, course explanation](https://www.cs.cornell.edu/courses/cs513/2002SP/NL18.html)
describes execution monitors that stop a security-policy violation before it happens.
The account concerns monitorable execution properties; it does not establish enforcement of every invariant,
unbounded liveness, or arbitrary information-flow property.

Here, transactions, reservations, fencing, and authoritative transitions are application design choices.
For each choice, inspect the actual dependency/runtime contract and competing writers.
Do not claim that classic DbC itself provides a transaction, or that observing a condition freezes it.

## TigerBeetle contract programming

[It Takes Two to Contract](https://tigerbeetle.com/blog/2023-12-27-it-takes-two-to-contract/)
motivates paired assertions at producer/consumer or caller/supplier boundaries.
Types plus assertions do not imply atomic external effects.
TigerStyle's full Safety/Performance/DX prescriptions remain with practicing-tiger-style.

## Synthesis and evidence limits

“Type safety for preserved predicates, runtime enforcement for the residual” is this skill's engineering synthesis.
The invariant/enforcer/coverage/failure/check record is an application method, not a claimed original definition of DbC.
No universal defect-prevention percentage, automatic proof of safety, or new mandatory reporting schema is claimed.
