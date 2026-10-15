+++
schema = 2
name = "land-follow"
outcome = "after every successful land, the main checkout (the default workspace, which ~/.bun/bin tools and hooks run from) follows alpha: land rebases the main checkout's working-copy commit onto the new alpha (keeping its uncommitted edits) and runs hook:post-merge; if that rebase would conflict, land reports the main checkout as NOT LIVE with the conflicting paths instead of claiming success; the land summary says LIVE only when the main checkout contains the landed commit"
writes = ["scripts/land.ts", "scripts/land-*.ts", "scripts/tests/land*.test.ts", "tools/*/.changes/*.md"]
verify = ["bun test scripts/tests/land.test.ts", "mise run gate:land"]
timeout_s = 2400
premises = ["file:scripts/land.ts"]

[proposition]
id = "LAND-MAIN-FOLLOWS"
claim = "a fixture land leaves the main checkout's @- equal to the new alpha with its uncommitted edit intact, runs post-merge once, and reports LIVE; a fixture whose main checkout edit conflicts reports NOT LIVE with the path and leaves alpha landed"
refuted_by = "a successful land after which the main checkout does not contain the landed commit while the summary says ok/LIVE"
+++

Observed 2026-10-15 22:20: after land-isolation (land commits in its own tree), ~/dotfiles stayed on 063daead (17:09)
while alpha moved 22 commits ahead (9a303b7a). Every land since then printed "landed and pushed" but agx, hooks and
the test preload kept running the old code, until the coordinator ran `mise run pull`. Land's own report (one land
said NOT LIVE, the rest ok) did not reflect this. Test data under TMPDIR only. Do not commit or push.
