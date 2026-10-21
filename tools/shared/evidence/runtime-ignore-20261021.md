# Runtime ignore evidence — 2026-10-21

## Classification and rule

AGX's default ticket home is `<repo>/.agents/tickets`. Tickets are plain-file
inputs that `agx ticket` creates. The historical `jj` snapshots below retain
currently tracked ticket history; this ignore rule makes no claim about future
ticket versioning. Tickets are coordinator runtime state rather than agent
declarations.

The observed local coordinator handoff is
`.agents/handoff-coord-20261019.md`. The root-anchored
`.agents/handoff-*.md` rule ignores its direct local handoff family.

The exact ignore declaration is:

```gitignore
/.agents/tickets/
/.agents/handoff-*.md
```

It is root-anchored and names no other `.agents` path. In particular, it does
not ignore agent sources, skills, configuration, templates, or fixtures.

## Snapshot inventory

The parent `alpha` revision `a1318fa9` tracks 214 paths below
`.agents/tickets`. The default workspace snapshot `a9d26561` has 478 ticket
paths. Relative to the parent, its `.agents` summary is 265 additions, eight
modifications, and zero deletions: 264 additions are tickets and one is
`.agents/handoff-coord-20261019.md`.

These counts are snapshot facts, not a request to delete any file. The eight
modified ticket files remain physical runtime inputs and must be preserved.

## Nondestructive `jj` migration

Ignore rules do not stop tracking files already in a working-copy commit. Once
the accepted ignore rule is present in the default workspace, the coordinator
must first leave active workers able to read their current files, then run this
single native-`jj` command from that default workspace:

```sh
jj file untrack .agents/tickets .agents/handoff-coord-20261019.md
```

The exact path set is the ticket-directory prefix plus the one currently
autosnapshotted coordinator handoff. `jj file untrack --help` states that each
path must already be ignored. It changes tracking in the working-copy commit;
it does not unlink, move, discard, reset, or abandon physical files. Thus it
preserves all runtime ticket bytes, including modified tickets, and leaves
active-worker reads intact.

Before accepting the resulting commit, the coordinator should inspect the
working tree and confirm that the physical ticket and handoff files still
exist. A later direct handoff file is already covered by the ignore rule and
can be untracked by its exact path when needed.

No native read-only `jj` command evaluates an ignore match, and a real
`jj file untrack` was intentionally not run in either this isolated workspace
or the default workspace. The rule is therefore reviewed textually here; its
tracking transition is reserved for the root coordinator after acceptance.
