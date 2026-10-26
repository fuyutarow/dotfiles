# TigerStyle selection and application cases

These cases test observable decisions against the pinned guide.
Desk review does not establish live invocation accuracy or downstream code quality.

## Selection

| Request | Expected route |
|---|---|
| Review this ordinary helper using Tiger Style, including variable names | Tiger; not restricted to costly or durable systems. |
| Apply TigerStyle to a queue implementation | Tiger across all applicable source sections; DbC for detailed enforcement choices. |
| Review only TigerStyle naming in this file | Tiger Naming Things, with a scoped result. |
| Choose types versus runtime guards for stale permissions | designing-by-contract; Tiger only for an additional requested style review. |
| Add a routine TypeScript annotation | writing-typescript/direct edit. |
| Explain TigerStyle history | Explanation with source attribution; no invented compliance ceremony. |
| Reorganize the Tiger skill | forging-skills. |
| Decide whether a benchmark comparison leaks labels | validating-experimental-evidence. |

## Source-fidelity regressions

| Case | Required result | Reject |
|---|---|---|
| Full audit of code with abbreviated, unitless variable names | Cover Naming Things and other source sections, even without a high-risk label | Resource/lease review alone counts as full TigerStyle. |
| Related names: max_latency_ms and min_latency_ms | Explain the source's units/qualifiers-last ordering and latency_ms_max/min examples | Naming advice omitted or reduced to generic readability. |
| Source states assertion density | Preserve average minimum two per function, with actual useful assertions | Two in every function, or omission of the source prescription. |
| Zig code recurses or allocates after startup | Report the literal no-recursion/startup-only rules and deviation | Rewrite them as merely optional capacity preferences. |
| Project requires managed allocation or Rust usize | State the original rule and explicit language/project adaptation | Claim literal conformance or impose impossible syntax. |
| Full DX review | Include naming, cache invalidation, off-by-one, formatting, dependencies, tooling | Stop after names, bounds, and assertions. |
| Aliases, large struct copy, and out-pointer construction | Inspect duplicate state, >16-byte pointer guidance, in-place container propagation | Reduce cache invalidation to TTLs. |
| index/count/size and division | Preserve conversion and rounding intent | Treat all integer quantities as interchangeable. |
| Suspension after precondition check | Identify invalidated preconditions and the source's run-to-completion guidance | A preflight assertion proves the later effect safe. |
| Padding not initialized | Identify buffer underutilization, data leak, and determinism risks | Check only overflow. |
| Full source application | Check 70-line functions, 100 columns, four spaces, zig fmt, braces, explicit library options, comments, commits, and source ordering | Replace these with a local risk ledger. |
| Performance discussion | Estimate four resources and frequency-adjusted costs; preserve batching/control-data separation/hot-loop guidance | Invent 1000x measured acceptance or ban all I/O concurrency. |
| Zero dependencies and Zig scripts | Preserve source policies and label an authorized project's different toolchain | Install Zig globally or conceal the departure. |
| Fuzzer passes | Retain mental model, assertions, and review; fuzzing finds counterexamples | Claim absence of bugs. |
| Read-only review | Findings/source and code loci; planned tests labeled unrun | Edit the target or fabricate execution results. |

## Boundary with DbC

Tiger retains its original contract/assertion teaching.
Detailed enforcement design has one home in designing-by-contract.
A combined task can cite the same contract; it must not create a second invariant/enforcer authority.
