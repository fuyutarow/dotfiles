# Observable cues → traits — the Layer-1 evidence tables

Grades: **ROBUST** (replicated/meta-analytic) · **MODERATE** (consistent direction, small effect,
limited replication) · **FRAGILE** (single-study/low-n/contested) · **FOLKLORE** (popularly
asserted, no support or failed replication).

> **MASTER CAVEAT — applies to every row.** Effect sizes across this whole domain are SMALL:
> individual cues rarely exceed r≈.15–.25; full-model text prediction of Big Five tops out at
> **r≈.40–.45** even with rich data. **No single cue is diagnostic.** You AGGREGATE many weak
> signals and report confidence bands (calibration-and-ethics.md) — you never point-estimate a
> trait from one cue. State-vs-trait confounding is pervasive; it is flagged per row and enforced
> by Gate G2.

## §1 Function words (LIWC / Pennebaker) — real program, small & moderated effects

The headline "function words reveal personality" is directionally supported but each downstream
claim is small (r≈.10–.25) and heavily moderated. **LIWC closed-vocabulary dictionaries are weak
signal** — 52 categories explain ~5 % of trait variance; open-vocabulary ML beats LIWC on every
outcome (Schwartz 2013). Prefer open-vocabulary reasoning over dictionary word-counts.

| Cue | Reads toward | Dir | Grade | Note |
|---|---|---|---|---|
| 1st-person singular (I/me) | **NOT depression** | — | **FRAGILE / OVER-CITED** | The single most over-cited claim. Effect shrinks to ~null once neuroticism is controlled (Tackman 2019 [A], N=4,754, r≈.10). I-talk is a diffuse distress-proneness marker at best — **do not read "I → depressed."** |
| 1st-person singular | lower status/power | − | MODERATE | high-status people use fewer "I" (Kacewicz 2014) |
| 1st-person singular | age | − | ROBUST | self-focus declines with age (Pennebaker & Stone 2003) |
| 1st-person plural (we) | group identity / also high status | + | MODERATE | pop coverage conflates the two |
| 2nd-person (you) | receptiveness in *collaborative* register | + | ROBUST but register-flipped | "you = aggression" is folklore; direction FLIPS — adversarial→accusatory, collaborative→engaging |
| articles + prepositions (Analytic Thinking) | cognitive complexity / status | + | ROBUST (factor) | correlates with GPA/SAT; the narrative pole (pronouns+auxiliaries+negations) is the opposite end |
| cognitive-process words (because/know/think) | (liars use *fewer*) | − | FRAGILE for deception | opposite of the "elaborate lie" folklore; not courtroom-ready |
| affect words (pos/neg emotion) | actual emotional state | + | ROBUST dir / FRAGILE magnitude | ~10 % variance in long text, ~3 % short; "lol/lmao" scores positive but correlates NEGATIVELY with happiness — platform-dependent |

**"Secret Life of Pronouns" verdict:** trade-press synthesis predating the 2019 replication wave.
Status and aging chapters hold up (multi-corpus); the headline I-talk→depression claim is the one
the big preregistered replication weakened. Treat book-level confidence as popular-science
compression of modest, heavily-moderated effects.

## §2 Computational prediction — accuracy ceilings (predicted vs self-report r)

| Trait | Best text-model r | Easiest? |
|---|---|---|
| Openness | ~.43 | **easiest** |
| Extraversion | ~.42 | **easiest** |
| Conscientiousness | ~.37 | moderate |
| Agreeableness | ~.35 | **hardest** (most concealed/evaluative) |
| Neuroticism | ~.35 | hard (but see below — internal) |

- Credible **upper limit r≈0.42–0.48** for text-only-vs-self-report (Novikov 2021 review of ~220
  papers — the best single "ceiling" cite). r>.5 outliers are speech/multimodal or observer-rated,
  not text-only. Between-questionnaire r for the *same* trait is .6–.9 — the criterion itself is
  the bottleneck.
- **Model size does not help; data quality does** (an 11.8M-param model ≈ a 125M one). LLM
  zero/few-shot is in the same r≈.27–.40 band, with extra failure modes: **prompt-order
  sensitivity, sycophancy/social-desirability skew toward "average," demographic bias.** Aggregate
  multiple runs; distrust extremity; never use MBTI framing.
- **Shared-data illusion:** the four famous computational studies (Kosinski / Youyou / Park /
  Schwartz) all reuse ONE opt-in US-skewed dataset (myPersonality) — treat as **one** line of
  evidence, not four replications.
- **Word-clouds (WWBP open-vocab, illustrative, not a lookup table):** high-E "party / cant wait /
  love you"; low-E "computer / internet / reading"; high-O "music / art / dream / universe / soul";
  high-N "hate / sick of / depressed"; low-N "blessed / vacation / beach / team." Use as texture,
  never as a classifier.

## §3 Text-behavioral (non-lexical) cues

| Cue | Reads toward | Dir | Grade | Note |
|---|---|---|---|---|
| **swearing / profanity** | honesty | +? | **MODERATE / CONTESTED** | Feldman 2017 found profanity↔honesty across 3 levels (lab r=.34, FB N=73k r=.20, state r=.35) — BUT a published rebuttal (de Vries et al., PMC6113711) using HEXACO **Honesty-Humility** (this skill's own backbone trait) found the **opposite sign**: profanity related *negatively* to H and *positively* to actual cheating. The sign depends on whether you measure Feldman's "Lie Scale" or true HEXACO H. **Do not treat profanity as a clean honesty cue** — flag it as contested |
| emoji frequency | female gender | + | **ROBUST** | strongest/most-replicated emoji effect — check you're not reading gender as a trait |
| emoji frequency | Extraversion; Agreeableness | + | MODERATE | sign context-dependent; heart-emoji↑ for A |
| self-disclosure rate | intimacy/liking loop; discloser E/O | + | ROBUST (meta) | Collins & Miller 1994; heavy state confound — relationship stage/norms drive it |
| exclamation marks | positive affect (posemo proxy) | + | MODERATE | small; via posemo r≈.07 |
| message length / verbosity | E / A / O (weakly) | + | **FRAGILE** | r≈.09–.12, sign flips by subsample |
| post/activity volume | Extraversion | + | MODERATE | ρ≈.11 |
| hedging ("maybe / I think / sort of") | gender (women>); low power; N(+), E(−) | mixed | ROBUST (gender only) | **reframed**: interpersonal sensitivity, NOT Lakoff's "deficit"; power > sex (O'Barr 1980). d≈.23 |
| period at end of a text message | reader reads it as *curt/insincere* | — | MODERATE (perception) | this is a **reader-inference effect, NOT a writer trait** — do not assign the sender a trait |
| response latency / reply speed | attachment | ? | **FRAGILE** | HEAVY state confound (busyness/timezone/notifications). Most "reply-time→personality" claims are pop-psych, not peer-reviewed |
| topic initiation / control | dominance / E / O | + | FRAGILE | folded into "dominance" composites; role-dependent |
| question-asking | likability (curvilinear; over-asking reverses) | + | MIXED | manipulated in studies = state, not trait; the speed-dating effect vanished on reanalysis |

## §4 Quarantine — do NOT use these

- **I-talk → depression** (specificity failed replication).
- **Capitalization (ALL-CAPS / lowercase) → any trait** — FOLKLORE, zero peer-reviewed Big Five
  link. "Caps = shouting" is a netiquette convention, not a personality cue.
- **Microexpression / nonverbal → lie-detection** — DEBUNKED (calibration-and-ethics.md §5).
- **This §4 is the SOLE HOME of TEXT folklore only.** Perceptual folklore — body-language cue
  dictionaries, gaze aversion, physiognomy / 人相, fWHR, power posing, mirroring, 7-38-55, NLP
  eye-accessing cues, 血液型, PUA "indicators of interest" — is owned by the `reading-people-in-person`
  skill (`references/quarantine.md`). Point there; do not grow a second list here.
- **MBTI-from-text** — the construct is invalid; any accuracy claim is fragile-by-construction.
- **PAN cross-platform personality numbers** — do not generalize across platforms (2016 cross-genre
  transfer collapsed to baseline).
- **Reader-perception effects as writer traits** (period-as-curt, exclamation-as-sincere,
  questions-as-likable) — these are inferences in the *receiver*, not dispositions of the sender.

## §5 Japanese / cross-linguistic guard — MANDATORY before profiling non-English text

The English function-word method **does not port to Japanese**, and several defaults actively
mislead. This section is first-class because the primary user profiles in Japanese.

- **Never count 私 / 一人称 frequency as self-focus.** Japanese drops ~37 % of arguments (pro-drop);
  it realizes ~0.6M pronouns where English uses ~1.7M — a naive I-count **undercounts self-reference
  by half or more**, worse than any person-marking language. The English "high-I ↔ self-focus/
  distress" finding is **untested in Japanese — do not assume it transfers.** [ROBUST that it breaks]
- **The Japanese-specific signal is first-person CHOICE** (私 / 僕 / 俺 / 自分 / あたし), a robust
  *sociolinguistic* index of gender, formality, assertiveness, and in-group status that shifts by
  interlocutor within one speaker. But **no computational personality model quantifies it** — treat
  it as a weak contextual cue, not a scored trait. [ROBUST sociolinguistics / FRAGILE as a feature]
- **A J-LIWC2015 dictionary exists** (Igarashi 2022) and its *emotion* categories are validated —
  but the depression/self-reference correlation was **not** tested. Do not cite a Japanese
  text-prediction accuracy number; none is confirmed. TIPI-J (self-report) is validated, but that
  is a questionnaire, not a text-inference result.
- **Reference-group effect** (Heine 2002): Japanese respondents self-rate against a *local*
  reference group, so apparent trait "levels" are not cross-culturally comparable — a low score may
  be response style, not disposition.
- **Interdependent self-construal** (Markus & Kitayama 1991): the Japanese self is more
  relational/context-dependent; "it depends"/modest responding reads as low-trait but is
  self-presentation norm, not low disposition.
- **Emic gap:** Big Five may miss a dimension that matters in Japanese/East-Asian samples
  (Interpersonal Relatedness — harmony/renqing/人情; Cheung 2001 found it beyond NEO Openness, and it
  replicates even in Euro-American samples). HEXACO's Honesty-Humility recovers part of the
  interpersonal-morality space Big Five omits — another reason the backbone is HEXACO, not Big Five.

**Bottom line for Japanese:** a low I-count conflates three things English profiling never has to
separate — grammatical pro-drop, cultural high-context norms, and individual self-focus. Lean on
*content and behavior across contexts* (what they engage with, praise, avoid; L4 values), not on
function-word counts.
