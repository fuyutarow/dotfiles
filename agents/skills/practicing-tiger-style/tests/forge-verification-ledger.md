# Revision evidence — practicing-tiger-style

## 2026-10-26 full source-fidelity reorganization, v2610.2.0

Observed drift: the predecessor emphasized its own risk tiers and T0–T4 conformance workflow,
while omitting much of the original Developer Experience guidance.
The user required the complete TigerStyle and a distinct, useful Design by Contract skill.

### Responsibility and treatment

- TigerStyle: the full pinned source, all Safety/Performance/DX sections, exact prescriptions and explicit adaptation rules.
- base-usecase-first: detailed precondition/postcondition/invariant enforcement across static and runtime boundaries.
- Language/domain owners retain implementation, project policy, and required behavior.
- The former Tiger risk/conformance package is preserved at
  `archives/skills/practicing-tiger-style-ledger/`, indexed by the archive catalog.
  It is historical, not an active enforcement or conformance contract.
- Optional vendor UI agents/ directories were removed by explicit user instruction.
  Repository and copy/deployment boundaries now reject that layout.

### Source coverage

Read all 511 lines at upstream commit `0450c32b2c3c3ab6114f3402cc601341cc8192aa`.
The local guide and Apache-2.0 license are unchanged captures with recorded hashes.
The complete navigation contains 15 headings and 69 list items, including nested items.
Narrative sections, examples, dependencies/tooling policies, and the final section remain in the full capture.

Serial review covered all source sections and the behavior cases.
This includes naming/units/order, comments/commits, aliases and copy/in-place rules,
suspension and check/use locality, padding, index/count/size, rounding, formatting,
dependencies/tooling, and every assertion subrule.
The source's average assertion quota is not a per-function quota.
Literal strict policies remain visible; other-language/project adaptations must be disclosed.
These are scoped same-author checks, not independent agent trials or measured productivity gains.

### Verification

- `mise run lint:skills-wiring`: exit 0 after source cleanup.
- Target skill-check: exit 0; original-source long-sentence warnings are retained rather than modifying the capture.
- Target rumdl check: exit 0.
- `bun test scripts/tests/skills-doctor.test.ts scripts/tests/skills-sync.test.ts scripts/tests/skills-copy.test.ts`:
  20 pass, zero fail. Includes forbidden directory, metadata, symlink, and no-install/no-plugin-mutation fixtures.
- `mise run lint:skills-index` and `mise run lint:skills-floor`: exit 0; 54 skills, 48,308 listing characters.
- `mise run gate:changed`: exit 0 for format, TS lint, no-sync, and type checking of the changed code.
- Both Codex skill-creator validators: exit 0, Skill is valid.
- `mise run skills:sync -- --in-house-only`: exit 0; Claude and Codex copies deployed, old active names removed.
- `SKILLS_DOCTOR_MACHINE=1 bun scripts/skills-doctor.ts`: exit 0; both tool homes match the declarations.
- The old designing-type-contracts paths are absent in both homes; direct cmp confirmed the source capture and DbC guide.
- Corpus supplement: nine documents committed locally at `4c7f9aa83773ac11ba4f933eb897fdd8a0bc717f`.
  The first index attempt used an out-of-scope okf shim; indexing was retried with the corpus's mise tool scope.
- Prior-version observations in the archived ledger do not certify this rewrite.
