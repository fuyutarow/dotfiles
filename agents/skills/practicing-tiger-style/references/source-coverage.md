# Complete source navigation

Generated from the unchanged pinned guide. Headings include narrative policies and the final section.
Every list item, including nested assertion and function-shape guidance, has a row.
Read each item's continuation and examples in [the full guide](upstream-tiger-style.md).
This index does not replace, weaken, or add a rule.

Coverage: 15 headings; 69 list items; 511 source lines retained.

| Source line | Section | Source item or heading |
|---|---|---|
| 1 | Section | [TigerStyle](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L1) |
| 3 | Section | [The Essence Of Style](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L3) |
| 14 | Section | [Why Have Style?](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L14) |
| 35 | Section | [On Simplicity And Elegance](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L35) |
| 62 | Section | [Technical Debt](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L62) |
| 81 | Section | [Safety](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L81) |
| 90 | Safety | [Use **only very simple, explicit control flow** for clarity. **Do not use recursion** to ensure](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L90) |
| 96 | Safety | [**Put a limit on everything** because, in reality, this is what we expect—everything has a limit.](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L96) |
| 102 | Safety | [Use explicitly-sized types like `u32` for everything, avoid architecture-specific `usize`.](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L102) |
| 104 | Safety | [**Assertions detect programmer errors. Unlike operating errors, which are expected and which must](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L104) |
| 109 | Safety | [**Assert all function arguments and return values, pre/postconditions and invariants.** A](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L109) |
| 115 | Safety | [**[Pair assertions](https://tigerbeetle.com/blog/2023-12-27-it-takes-two-to-contract).** For](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L115) |
| 120 | Safety | [On occasion, you may use a blatantly true assertion instead of a comment as stronger](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L120) |
| 123 | Safety | [Split compound assertions: prefer `assert(a); assert(b);` over `assert(a and b);`.](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L123) |
| 126 | Safety | [Use single-line `if` to assert an implication: `if (a) assert(b)`.](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L126) |
| 128 | Safety | [**Assert the relationships of compile-time constants** as a sanity check, and also to document](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L128) |
| 136 | Safety | [**The golden rule of assertions is to assert the _positive space_ that you do expect AND to](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L136) |
| 142 | Safety | [Assertions are a safety net, not a substitute for human understanding. With simulation testing,](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L142) |
| 145 | Safety | [Build a precise mental model of the code first,](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L145) |
| 146 | Safety | [encode your understanding in the form of assertions,](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L146) |
| 147 | Safety | [write the code and comments to explain and justify the mental model to your reviewer,](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L147) |
| 148 | Safety | [and use VOPR as the final line of defense, to find bugs in your and reviewer's understanding](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L148) |
| 151 | Safety | [All memory must be statically allocated at startup. **No memory may be dynamically allocated (or](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L151) |
| 158 | Safety | [Declare variables at the **smallest possible scope**, and **minimize the number of variables in](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L158) |
| 161 | Safety | [There's a sharp discontinuity between a function fitting on a screen, and having to scroll to](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L161) |
| 166 | Safety | [Good function shape is often the inverse of an hourglass: a few parameters, a simple return](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L166) |
| 168 | Safety | [Centralize control flow. When splitting a large function, try to keep all switch/if](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L168) |
| 173 | Safety | [Similarly, centralize state manipulation. Let the parent function keep all relevant state in](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L173) |
| 177 | Safety | [Appreciate, from day one, **all compiler warnings at the compiler's strictest setting**.](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L177) |
| 179 | Safety | [Whenever your program has to interact with external entities, **don't do things directly in](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L179) |
| 187 | Safety | [Compound conditions that evaluate multiple booleans make it difficult for the reader to verify](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L187) |
| 193 | Safety | [Negations are not easy! State invariants positively. When working with lengths and indexes, this](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L193) |
| 213 | Safety | [All errors must be handled. An [analysis of production failures in distributed data-intensive](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L213) |
| 221 | Safety | [**Always motivate, always say why**. Never forget to say why. Because if you explain the rationale](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L221) |
| 226 | Safety | [**Explicitly pass options to library functions at the call site, instead of relying on the](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L226) |
| 231 | Section | [Performance](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L231) |
| 236 | Performance | [Think about performance from the outset, from the beginning. **The best time to solve performance,](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L236) |
| 241 | Performance | [**Perform back-of-the-envelope sketches with respect to the four resources (network, disk, memory,](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L241) |
| 245 | Performance | [Optimize for the slowest resources first (network, disk, memory, CPU) in that order, after](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L245) |
| 249 | Performance | [Distinguish between the control plane and data plane. A clear delineation between control plane](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L249) |
| 254 | Performance | [Amortize network, disk, memory and CPU costs by batching accesses.](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L254) |
| 256 | Performance | [Let the CPU be a sprinter doing the 100m. Be predictable. Don't force the CPU to zig zag and](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L256) |
| 259 | Performance | [Be explicit. Minimize dependence on the compiler to do the right thing for you.](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L259) |
| 266 | Section | [Developer Experience](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L266) |
| 271 | Section | [Naming Things](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L271) |
| 273 | Naming Things | [**Get the nouns and verbs just right.** Great names are the essence of great code, they capture](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L273) |
| 278 | Naming Things | [Use `snake_case` for function, variable, and file names. The underscore is the closest thing we](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L278) |
| 283 | Naming Things | [Do not abbreviate variable names, unless the variable is a primitive integer type used as an](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L283) |
| 287 | Naming Things | [Use proper capitalization for acronyms (`VSRState`, not `VsrState`).](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L287) |
| 289 | Naming Things | [For the rest, follow the Zig style guide.](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L289) |
| 291 | Naming Things | [Add units or qualifiers to variable names, and put the units or qualifiers last, sorted by](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L291) |
| 297 | Naming Things | [Infuse names with meaning. For example, `allocator: Allocator` is a good, if boring name,](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L297) |
| 301 | Naming Things | [When choosing related names, try hard to find names with the same number of characters so that](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L301) |
| 308 | Naming Things | [When a single function calls out to a helper function or callback, prefix the name of the helper](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L308) |
| 312 | Naming Things | [Callbacks go last in the list of parameters. This mirrors control flow: callbacks are also](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L312) |
| 315 | Naming Things | [_Order_ matters for readability (even if it doesn't affect semantics). On the first read, a file](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L315) |
| 337 | Naming Things | [Don't overload names with multiple meanings that are context-dependent. For example, TigerBeetle](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L337) |
| 342 | Naming Things | [Think of how names will be used outside the code, in documentation or communication. For example,](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L342) |
| 349 | Naming Things | [Zig has named arguments through the `options: struct` pattern. Use it when arguments can be](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L349) |
| 356 | Naming Things | [**Write descriptive commit messages** that inform and delight the reader, because your commit](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L356) |
| 360 | Naming Things | [Don't forget to say why. Code alone is not documentation. Use comments to explain why you wrote](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L360) |
| 363 | Naming Things | [Don't forget to say how. For example, when writing a test, think of writing a description at the](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L363) |
| 367 | Naming Things | [Comments are sentences, with a space after the slash, with a capital letter and a full stop, or a](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L367) |
| 372 | Section | [Cache Invalidation](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L372) |
| 374 | Cache Invalidation | [Don't duplicate variables or take aliases to them. This will reduce the probability that state](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L374) |
| 377 | Cache Invalidation | [If you don't mean a function argument to be copied when passed by value, and if the argument type](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L377) |
| 381 | Cache Invalidation | [Construct larger structs _in-place_ by passing an _out pointer_ during initialization.](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L381) |
| 416 | Cache Invalidation | [**Shrink the scope** to minimize the number of variables at play and reduce the probability that](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L416) |
| 419 | Cache Invalidation | [Calculate or check variables close to where/when they are used. **Don't introduce variables before](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L419) |
| 426 | Cache Invalidation | [Use simpler function signatures and return types to reduce dimensionality at the call site, the](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L426) |
| 431 | Cache Invalidation | [Ensure that functions run to completion without suspending, so that precondition assertions are](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L431) |
| 435 | Cache Invalidation | [Be on your guard for **[buffer bleeds](https://en.wikipedia.org/wiki/Heartbleed)**. This is a](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L435) |
| 440 | Cache Invalidation | [Use newlines to **group resource allocation and deallocation**, i.e. before the resource](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L440) |
| 443 | Section | [Off-By-One Errors](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L443) |
| 445 | Off-By-One Errors | [**The usual suspects for off-by-one errors are casual interactions between an `index`, a `count`](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L445) |
| 452 | Off-By-One Errors | [Show your intent with respect to division. For example, use `@divExact()`, `@divFloor()` or](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L452) |
| 456 | Section | [Style By The Numbers](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L456) |
| 458 | Style By The Numbers | [Run `zig fmt`.](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L458) |
| 460 | Style By The Numbers | [Use 4 spaces of indentation, rather than 2 spaces, as that is more obvious to the eye at a](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L460) |
| 463 | Style By The Numbers | [Hard limit all line lengths, without exception, to at most 100 columns for a good typographic](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L463) |
| 471 | Style By The Numbers | [Add braces to the `if` statement unless it fits on a single line for consistency and defense in](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L471) |
| 474 | Section | [Dependencies](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L474) |
| 481 | Section | [Tooling](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L481) |
| 502 | Section | [The Last Stage](https://github.com/tigerbeetle/tigerbeetle/blob/0450c32b2c3c3ab6114f3402cc601341cc8192aa/docs/TIGER_STYLE.md#L502) |
