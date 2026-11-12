# Data schema

Reader: developers. Document kind: normative reference. This is not an authorization to implement
new behavior. Baseline: 2026-11-12, before-reorganization commit 04f88fce. This text adds no new
requirements. It records the existing schema contract.

Accepted values must match the current approved schema; reject mismatches before writing. Generated
static types and runtime validators must use that same schema identity. Use LibraryZ.convertSchema
for runtime parsing and TypesFromSchema for declarations. Never use an `as` assertion to make an
unvalidated value appear to have a specific type. This matches our linter's restricted syntax rule.
Do not create an independently maintained duplicate of the business constraints. When the schema
hash differs from that of the generated types, return SchemaMismatch and perform no writes.

The adapter checks value structure. The domain separately checks authorization. The service does
not parse the schema. These responsibilities must not be conflated.
