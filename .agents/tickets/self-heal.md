+++
schema = 2
name = "self-heal"
outcome = "the guest root (/) and /tmp recover autonomously, with no human shell and no agent permission classifier in the path: when the storage-headroom hook measures guest / or a tmpfs below its warn line (and again below deny), it queues a declared systemd user service (like wsl-capacity-recover.service does for the host) that runs disk-reclaim's safe targets in a fixed, fast-first order (stale owned tmpfs dirs, expired graveyard entries, declared build caches such as cargo targets of repos that declare them reclaimable) until the drive is back above the warn line; a timer covers pressure that builds without tool calls; every action is journaled"
writes = ["agents/hooks/enforce-storage-headroom.ts", "agents/hooks/storage-headroom.toml", "agents/hooks/storage-headroom.contract.md", "agents/hooks/tests/**", "scripts/guest-capacity-recover.ts", "scripts/tests/guest-capacity-recover.test.ts", "wsl/guest-capacity-recover.*", "scripts/config-registry.ts", "tools/shared/src/storage-headroom.ts", "tools/*/.changes/*.md"]
verify = ["bun test agents/hooks/tests", "bun test scripts/tests/guest-capacity-recover.test.ts", "mise run gate:land"]
timeout_s = 3600
premises = ["file:agents/hooks/storage-headroom.contract.md", "file:scripts/wsl-capacity-recover.ts"]

[proposition]
id = "GUEST-SELF-HEAL"
claim = "fixtures: guest / below its warn line queues the recovery service exactly once per pressure episode; the service reclaims in the declared order and stops as soon as the drive is above warn; /tmp inode use above warn triggers the same; nothing in the path requires a human or a Claude tool permission; a live dry-run on this host lists what it would reclaim"
refuted_by = "pressure that does not queue the service, a recovery that needs a human or an agent tool call, a run that deletes something outside the declared safe targets, or one that keeps deleting after the drive is above warn"
+++

Postmortem: /home/fuyu/Workspace/retrospectives/2026-10-15-disk-tmp-exhaustion-postmortem.md (N2 is this ticket).
Owner rule (2026-10-15): the owner normally has no shell; recovery that needs a human is not acceptable.
Facts: agents/hooks/storage-headroom.contract.md:14 — the hook already queues wsl-capacity-recover.service below the
HOST deny line and a timer covers running work; for guest / and tmpfs it only warns/denies. Today guest / sat below
deny ~2 h; `disk-reclaim run tmpfs rip-expire --yes` and `disk-reclaim delete` were refused by the Claude classifier
or by disk-reclaim's configured roots; recovery finally came from an allow-listed `cargo clean` of a declared
reclaimable build dir. Reuse wsl-capacity-recover's structure and its declared reclaimable list (Unix: one home per
value); do not reimplement disk-reclaim's safety checks — call disk-reclaim. Ticket reclaim-fix changes disk-reclaim
itself in parallel (graveyard as a delete root, fast-first order, per-stage measurement): call its CLI, do not edit
tools/disk-reclaim. Never remove anything in a live dry-run on this host. Changesets via `mise run changeset`
(MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d)). Do not commit or push.

## Current state (coordinator, 10:1x — single current version)
Your change passes lint/type checks, but land's commit gate now includes lint:no-sync (landed 3008e6be) and refused it:
"991 site(s), baseline 981 — FAIL": your change adds 10 synchronous fs/child_process calls (likely in
scripts/guest-capacity-recover.ts and tools/shared/src/storage-headroom.ts). Rebase onto alpha (`jj rebase -r @ -d alpha`),
make each call async (the recover script runs as a systemd service; nothing forces it to be synchronous), and use
`// sync-ok: <reason>` only where a hook protocol truly requires a synchronous call. Definition of done: `mise run
hook:pre-commit` exits 0 in this workspace; paste its last 5 lines in your return. Test data outside the workspace.
Do not commit or push.
You cannot rebase inside the sandbox (the shared jj store is read-only there) and you need not: land rebases.
If `mise run lint:no-sync` does not exist in your workspace, make every sync fs/child_process call you added async
(or mark it `// sync-ok: <reason>`); land's gate will confirm the count.
