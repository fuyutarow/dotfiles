# Dotfiles oxlint plugin

`prefer-bun-api` enforces Bun replacements for asynchronous `child_process.exec`,
`execFile`, and `spawn`, and `crypto.createHash`. It resolves imported bindings,
including aliases, namespace/default imports, and CommonJS require bindings.
Shadowed locals and unrelated objects are left alone.

Synchronous calls belong to oxlint 1.82.0's built-in `node/no-sync`, enabled as an
error with `allowAtRootLevel: true`. Module-load calls are startup work. The custom
plugin has no sync-call detector or exemption handling.

`oxlint-policy.toml` is the only policy source. Its `io_allowlist` maps each exact
production path to `rules = ["no-sync", "prefer-bun-api"]` (only the applicable
rules) and a reason. The approved adoption baseline includes previously exempt
paths and the 18 paths newly exposed by the built-in rule. The list can shrink;
subsequent new path/rule exemptions fail against the parent policy.

`render-oxlintrc` generates a test-pattern override and exact-path overrides in
`.oxlintrc.json`. Tests are exempt from both I/O rules; other lint rules still
apply. Consumer repositories receive the test-pattern override but never inherit
this checkout's production exemptions. Generated status is determined by exact
comparison with the renderer, rather than a forgeable marker on each override.

`lint:ts-ratchet` rejects hand-written overrides and probes both rules without
production overrides. Every allowlisted path/rule pair must still produce a
diagnostic; missing files and stale rule memberships fail. New production
violations fail the normal lint run. Edit the TOML and run `mise run oxlint:render`.

Verify with `bun test scripts/tests tools/oxlint-plugin-dotfiles` and
`mise run lint:ts`.
