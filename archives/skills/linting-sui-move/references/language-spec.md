# Syntax, manifest and error contracts

Scope: M2024-*, NAME-* and ATTR-*.
Primary-source loci and the survey position are linked from
[sources-and-adoption.md](sources-and-adoption.md).

## Manifest and syntax

- **M2024-001:** Move 2024 requires explicit `public struct`.
  Fields, packing and unpacking remain internal to the defining module.
- **M2024-002:** bindings reassigned or mutably borrowed need the appropriate `mut`.
  Let the installed compiler diagnose the specific case.
- **M2024-003:** prefer the module label `module app::counter;`.
  Brace form is valid; report a style issue only when a relevant convention applies.
- **M2024-004:** reserved identifiers must follow the target language's escaping rules.
  Do not invent a blanket ban on names without checking the compiler.
- **M2024-005:** avoid redundant imports of default aliases.
  Do not classify a redundant import as a build failure without a diagnostic.

A current minimal manifest is:

```toml
[package]
name = "my_package"
edition = "2024"
```

Modern Sui tooling supplies framework dependencies implicitly.
Inspect the resolver version and declared external/local dependencies before migration.
Do not add a legacy framework Git dependency or remove addresses/lock/published metadata
by rote. Keep the package's identity and published compatibility contract intact.

## Naming is a convention

- **NAME-001:** follow package/module naming in the project; PascalCase package names are
  not mandatory. Official examples use `my_package`.
- **NAME-002:** use `EPascalCase` for error names.
- **NAME-003–004:** ordinary constants use `UPPER_SNAKE_CASE`; functions use `snake_case`.
- **NAME-005:** prefer field-name getters and `field_mut`, rather than redundant `get_`.
- **NAME-006:** choose constructors and return/transfer wrappers by behavior;
  do not force every constructor into a fixed name set.
- Capabilities conventionally end in `Cap`; positional dynamic-field keys can end in `Key`.
  Avoid `Potato` in hot-potato names.
- Event guidance differs: Move Book recommends past tense; Sui best practices recommends
  an `Event` suffix. Preserve the project's documented convention.

## Error values and test attributes

**ATTR-001:** use `#[test]`, `#[test_only]` and scoped `#[expected_failure(...)]`
as supported by the package's toolchain. Attribute placement is formatting advice.

**ATTR-002 / NAME-002:** distinguish:
1. explicit `u64` constants, whose assigned values form their numeric contract;
2. clever errors using `#[error]`, whose generated raw value includes source information;
3. `#[error(code = n)]`, which adds a developer-chosen 8-bit code on supporting versions.

Clever-error values can change after edits or formatting.
An explicit code is separate from the line component and does not freeze the whole raw value.
Do not infer numbering from declaration order or forbid explicit codes.
Before changing or removing an error, inspect client/test decoding and compatibility expectations.
A message-valued `vector<u8>` error constant is an example, not the only possible constant type.
