# Changelog

## 0.5.10 — 2026-11-10

- Show confirmed Remote Control on the first sidebar row.

## 0.5.9 — 2026-11-10

- Row 3's grey token separates memory from counts with the statusline bar (│), so a live row loses its shell count at 31 columns when the bar no longer fits; the bar drops with the last count part.

## 0.5.8 — 2026-11-10

- Row 3 fit width defaults to the measured 31-column sidebar (ROW3_FIT_WIDTH), so live rows keep their sh count.

## 0.5.7 — 2026-11-10

- Move worker and shell counts onto row 3 as wkr/sh parts of the grey resources token, space-separated with vram last and dropped first; a zero vram reading is not reported; retire the separate counts token for the three-row sidebar.

## 0.5.6 — 2026-11-09

- Show a bound Codex native title as the projected tab label and sidebar fullname; the fleet name stays the session identity and the fallback when no title is bound. Claude projection is unchanged.

## 0.5.5 — 2026-11-09

- Show the agent resource row as two sidebar rows: cpu with ram and vram, then workers and plain shell panes in the agent's tab; unknown counts read ? workers and ? shells.

## 0.5.4 — 2026-11-08

- Leave non-vendor agent tab labels unchanged.

## 0.5.3 — 2026-11-06

- Show Codex context usage from the session rollout.

## 0.5.2 — 2026-11-06

- Use middle dot separators in agent detail

## 0.5.1 — 2026-11-06

- Show session context and restore native Claude remote control detection

## 0.5.0 — 2026-11-05

- Show roster identity and observed context in agent sidebar rows

## 0.4.0 — 2026-11-03

- sidebar reports cpu as its own cpu_lo/cpu_mid/cpu_hi token by load level so herdr colors it; the rest stays one grey resources token

## 0.3.5 — 2026-11-03

- sidebar resource row prints ram and vram always in GiB with two significant figures

## 0.3.4 — 2026-11-02

- Format resource memory with two significant figures

## 0.3.3 — 2026-10-31

- Show worker count and width-bounded resource usage in the agent sidebar.

## 0.3.2 — 2026-10-31

- Resolve nested Claude pane resource ambiguity

## 0.3.1 — 2026-10-31

- Attribute pane resources by foreground process tree.

## 0.3.0 — 2026-10-30

- Project per-session RAM and VRAM resource tokens

## 0.2.0 — 2026-10-29

- Project agent CPU and worker usage from the shared snapshot.

## 0.1.20 — 2026-10-28

- Project running agx workers per matched fleet session

## 0.1.19 — 2026-10-26

- Prefer the fleet name over Codex's native thread title in pane projection

## 0.1.18 — 2026-10-24

- Narrow the projector agent fixture before mutating session and tab data

## 0.1.17 — 2026-10-24

- Hide inapplicable Codex remote control on WSL and distinguish unknown status without a link glyph

## 0.1.16 — 2026-10-24

- Show compact applicable remote-control markers and recover registered Codex rollout metadata

## 0.1.15 — 2026-10-24

- Recover live sidebar identities from current native footers and append-index titles, project observed remote-control state, and add a read-only dry run

## 0.1.14 — 2026-10-23

- Use neutral repository names in projector fixtures

## 0.1.13 — 2026-10-21

- Project native Codex titles after verified footer binding

## 0.1.12 — 2026-10-21

- Keep footer-unavailable registrations unavailable and prevent fleet refresh.

## 0.1.11 — 2026-10-20

- Coalesce fleet update bursts before projection while retaining systemd start limits

## 0.1.10 — 2026-10-20

- Recognize native selection controls with or without Earlier messages available

## 0.1.9 — 2026-10-20

- Report verified native Codex identity under herdr:codex authority and retain current footer cwd

## 0.1.8 — 2026-10-20

- Validate visible native Codex footer IDs against exact rollout metadata before projecting existing panes

## 0.1.7 — 2026-10-19

- Trigger projection on fleet session directory changes and poll Herdr panes every 60 seconds

## 0.1.6 — 2026-10-19

- Match Codex panes by their reported session id

## 0.1.5 — 2026-10-19

- Use the shared CLI conformance surface

## 0.1.4 — 2026-10-19

- Skip unchanged projection cycles and read only Codex rollout identity metadata

## 0.1.3 — 2026-10-19

- Clear stale pane identity tokens

## 0.1.2 — 2026-10-19

- Require vendor-matched Herdr session identities and shorten unknown labels

## 0.1.1 — 2026-10-19

- Add Herdr fleet session projector

## 0.1.0 — 2026-10-19

- Project fleet session identities onto Herdr tab names and pane metadata.
