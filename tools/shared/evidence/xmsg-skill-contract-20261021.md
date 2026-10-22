> Project identifiers in this historical record have been generalized; consumer paths below are illustrative, not exact retrieval locations.

# xmsg shared-skill contract receipt

Snapshot inspected: `e0dcb72f1da87995487deb6fc331df99bb200bbf` (frozen sources named in the brief). Local executable observed: `xmsg v0.2.1`. This receipt records contract facts for skill authors; it is not a delivery test.

## Supported CLI surface

```sh
xmsg list [--json] [--timeout-ms N]
xmsg send --to [codex:|claude:]<UUID|UUID-prefix|exact-name> --message TEXT [--timeout-ms N]
xmsg send --to codex:<thread-id-or-exact-name> --message 'Can you check this?'
xmsg send --to claude:<session-id-or-exact-name> --message 'Can you check this?'
xmsg send --to 01a15424 --message 'Can you check this?'
xmsg send --to 'review (v2)' --message 'Can you check this?'
```

These examples are supported in the frozen README (lines 7–12, 56–60); current local `--help` was also checked. Flags are strict. `--to` and `--message` are send-only; `--json` is list-only. Unknown vendor qualifiers, unsupported flags, malformed/missing values and ambiguous selectors are usage failures (exit 2); do not document guessed aliases, `--dry-run`, wildcard, fuzzy, or substring addressing. Help lists the CLI flags and timeout default. (README 20–28, 107–108; `src/xmsg.ts` 105–139, 142–181.)

## Discovery is not sendability

`xmsg list` returns native inventory, not a delivery check. Human rows use a currently unique short UUID prefix (minimum 8 hex digits); JSON keeps full `address`/`id` and also `shortAddress`. The count is unique addresses returned by successful inventories. A listed session may no longer be available when used. Listing exit 0 means both inventories completed (including empty); exit 3 means at least one failed, timed out, exceeded limits, or had unsupported schema, with successful inventory retained as partial output. (README 62–68, 85–108.)

Inventory is deliberately narrow: Claude `claude agents --json` active registrations; Codex loaded threads visible through the already-running shared local app-server control socket. It excludes unloaded saved/resumable Codex threads, other endpoints (including separate Windows Desktop backend from WSL), historical transcripts, and Herdr/fleet records as reachability evidence. The list path sends no messages and starts no Codex daemon. Limits are 1,000 records and 4 MiB per backend; unsupported fragmented WebSocket frames make Codex discovery unavailable rather than silently omitting records. (README 85–93, 110–114; `src/inventory.ts` 13–14, 72–82, 116–122, 187–198, 227–243.)

## Addressing and outcome meanings

Qualified addresses query only that vendor. UUID prefixes need at least 4 hex digits (canonical hyphens optional); exact native names are literal, including spaces/punctuation. Unqualified selectors require complete available inventories from both vendors to prove global uniqueness, even for a full UUID. Full UUIDs take precedence; then exact names; then prefixes. Exact opaque names preserve the native send path without discovery. Ambiguous results show sorted qualified candidates; incomplete discovery refuses an unqualified send with exit 3. A stale listing is not trusted: resolution is repeated before send. (README 14–28, 70–83.)

| Exit | Contract |
|---|---|
| list 0 / 3 | Complete inventories / incomplete or unavailable inventory; partial success can be shown on 3. |
| send 0 | Accepted/enqueued by Codex queue or confirmed Claude SendMessage tool result. Not read, delivered, or replied. |
| send 1 | Transport reported rejection/error. |
| send 2 | Usage, invalid selector, missing target, or ambiguity; no send. |
| send 3 | Transport CLI unavailable or required discovery unavailable/incomplete. |
| send 4 | Acceptance unknown (timeout, failed Claude run, or missing confirmed tool result); do not retry automatically. Check with recipient before any manual resend. |

A timeout can follow successful acceptance. No automatic retries. The Codex receipt is successful `codex queue` exit; Claude requires a correlated structured SendMessage result confirming `success: true` and `msg_id`; model prose alone is not a receipt. (README 30–52; `src/xmsg.ts` 14–18, 30–98; `src/claude-receipt.ts` receipt validation.)

## Current transport inventory gaps / cautions

- Frozen-source contract supports existing local native endpoints only; listing does not cover every saved, remote, or separately hosted session (above).
- Known peer report (not independently reproduced here): native interactive Claude `agents --json` inventory and headless relay `ListAgents` inventory differ; some listed Claude recipients fail before `SendMessage` and return exit 4. Exact Claude name `example-repo-agt_xj15` worked in that peer session, not a universal guarantee.
- Known peer report: exact Codex queue thread name/ID was accepted as queued, not delivered. Treat both transports' success as accepted/enqueued, never delivery or reply.
- This run executed only local `xmsg --help` and `xmsg --version`; it did not run a real list or send. Thus no present inventory completeness or live transport reachability is asserted.

Source locator: frozen `tools/xmsg/README.md`; `tools/xmsg/src/xmsg.ts`; `tools/xmsg/src/inventory.ts`; `tools/xmsg/src/recipient-prefix.ts`; `tools/xmsg/src/claude-receipt.ts`. The local help output was `xmsg v0.2.1`, with list exits 0/3 and send exits 0/1/2/3/4.
