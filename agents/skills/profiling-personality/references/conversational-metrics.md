# conversational-metrics.md — countable L1 features for dialogue corpora

> **Purpose.** Forces Layer-1 observation of any chat/talk corpus to START from counts, not
> impressions. Counts are EVIDENCE feeding G1 (this person's baseline) and G2 (aggregate) —
> never verdicts. Added 2026-07-11 after a live failure: a generic rule ("don't lecture in
> their weak zone") was applied without counting that the person had OPENED the partner's
> territory at self-cost and explicitly claimed a listener role — the formal count inverts the
> conclusion. Distill from structure first; interpret second.

## §1 Topic dynamics

| Metric | How to count |
|---|---|
| Topic-initiation share | Per person: new topics opened / total topics. Classify origin: self-initiated / partner-initiated / **external import** (news, weather, trend, environment) |
| Initiation territory | Each initiated topic lands in: own territory / partner's territory / shared / neutral. **Other-oriented initiation at self-cost** (opening PARTNER's territory while confessing incompetence) is a high-signal accommodation marker — count it separately, never average it away |
| Transition type | Bridged (builds a link from own knowledge to the other's topic — e.g., games→history via 信長の野望) vs abrupt. Count per person |
| Topic lifespan | Turns each topic survives; who extends, who kills |
| Callbacks | References to earlier material (jokes, facts, promises), per person |

## §2 Turn dynamics

| Metric | How to count |
|---|---|
| Question rate | Questions / messages, per person. Type: info-seeking / opinion / invitation / meta. (Reference cases: なつみ 0/62 over 3 weeks; さや and イワクラ ≥1 in first session) |
| Unsolicited specifics | Concrete facts volunteered without being asked, per message |
| Logistics response format | instant-accept / conditional-accept / counter-proposal / clarifying-question (distribution over all scheduling events) |
| Volume & bursts | Message-count ratio between the two; multi-send (連投) rate per turn-slot |
| Reply latency | Distribution → per-person baseline → flag deviations. The content of the SLOWEST reply is disproportionately informative |

## §3 Style & accommodation (LSM-adjacent)

| Metric | How to count |
|---|---|
| Register | です/ます ratio over time; who de-formalizes first |
| Marker density & convergence | Emoji / stamps / 笑・w per message, per person; measure the DIRECTION of convergence over time (who moves toward whom = accommodation vector) |
| Emotion lexicon | Explicit feeling words (嬉しい・楽しみ・不安…) count per person |
| Format mirroring | Does one party copy the other's message structure (e.g., two-topic bundles answered as two-topic bundles)? |

## §4 Relational-move events

Count occurrences AND note who did it first: dyad-future references (今度/また/行きたい) · self-disclosure depth steps (fact → experience → feeling → vulnerability) and the reciprocity ratio · acceptance-bids (「引かれてない？」型) · repair moves (apology, clarification) · humor mode split: tsukkomi events vs self-deprecation events (they are different styles, not presence/absence of humor).

## §5 Discipline

- **Denominators mandatory**: every count reported as count / n-messages / time-window.
- **One day of counts = a STATE observation** (G2). Trait claims need ≥2 separated windows.
- Counts feed the gates; they do not bypass them. A distinctive count (e.g., 0 questions in 3 weeks) still needs G5 competing hypotheses (declared style vs low interest vs norm).
- Japanese cautions: register shifts are relationship-stage markers, not traits; stamp-heavy ≠ low engagement; low initiation may be DECLARED style (self-manual cases exist — check for an explicit self-description before scoring initiative).
- Report format per metric: metric / count / denominator / baseline comparison / tier.
