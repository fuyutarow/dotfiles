# Herdr native title view evidence

Date: 2026-10-21

## Intended outcome

Project a native Codex thread title as a Herdr tab and `fullname` view label only
after the current pane's native footer has been validated and bound to its exact
Codex session ID. The fleet session name and address routing remain canonical.

## Source basis

The supplied `codex-native-title-projection-contract-20261021.md` specifies the
reader boundary, exact-ID title validation, per-pane ephemeral projection map,
cache fingerprint inputs, and fail-closed behavior. In the frozen projector
source, `bindNativeCodexFooters` validates the native footer, reads and validates
the native session, rechecks the footer around Herdr identity reporting, then
writes the fleet record. `projectAgents` currently chooses the fleet name for
both tab and `fullname`; it also contains a disk fallback when its fleet lookup
misses. The cache fingerprint currently includes pane input and fleet identity
fields.

## Change boundary

The implementation reads a title only after the existing successful native
footer binding path, retains the result in a per-pass pane map, and passes that
map explicitly into projection. Known titles replace only the Herdr view label;
unavailable title reads use the existing fleet-name/unavailable-label fallback.
The collector fingerprint includes pane ID, bound ID, title outcome and source
update time, while excluding collector observation time. Rendering consumes
supplied values and performs no disk reads. No statusline writer or runtime
validation is included.

## Evidence status

The projector imports the actual reader from `codex-native-title.ts`. It reads
the native title after session validation and Herdr identity reporting, then
rechecks the footer before writing fleet state and publishing the pane-map entry.
Projection checks the pane, exact bound ID, Codex vendor, and valid fleet
identity before using a known title for the Herdr tab and `fullname` labels.
Unavailable reads use the existing fleet-name/unavailable-label fallback.
`projectAgents` preserves its three-argument call form; the title map is an
optional fourth argument. Cache input includes pane, bound ID, title outcome and
source update time, and excludes observation time. The renderer disk fallback
was removed; fleet session name and address routing were not changed.

Focused tests use the real reader with a temporary native index and exercise
Unicode titles, registration-only binding, footer changes during title I/O,
unavailable-title fallback, and cache-input behavior. The final scoped
type-aware lint passed for the projector, shared reader, and projector tests;
the focused suite passed 30 tests and 247 assertions. A subsequent full
TypeScript compiler run found that the fixture reader's required `env`
parameter was narrower than the reader API's optional `env`; the earlier lint
and test passes had not certified callback assignability. The fixture callback
now defaults `env` to `process.env`, while native fixtures still pass their
temporary environment explicitly. `bun check` then passed with no type errors
in 871 files. These checks do not establish that a running Herdr sidebar or
pane rendered the title; no native, focused-pane, or runtime probe was
performed.
