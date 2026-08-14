# Genre record — what this document type actually regulates, with loci

> **SOLE home** for every dated citation and every claim-strength judgment this skill leans on.
> A claim asserted in `SKILL.md` without a row here is a bug. Verified 2026-08-10 against the
> primary scans and the current published norms; §4 is the durability-quarantined section — those
> documents get revised, so re-fetch on reforge and update the dates.
>
> Corpus provenance: the claim ids (`TMC-0NN`) resolve to a signed corpus position whose ledger
> carries each claim's verdict, backing capture, inversion condition, and limits. This file is the
> skill-side digest, not a second arguing home for the evidence.

## §1 The archival cover — what was regulated, in detail

Two specimens, six years apart, plus the one contemporaneous published account of the technique.

| Fact | Locus | Strength |
|---|---|---|
| Printed cover fields: title, date, document number(s), other keywords, author/location/extension, charging case, filing case, abstract, pages text+other+total, no. figures, no. tables, no. refs, form code, pointer to the distribution list overleaf | `TM-80-1270-1`, Condon/Kernighan/Thompson, 1980-01-06, p.1 — https://www.cs.princeton.edu/~bwk/202/summer.reconstructed.pdf | author-confirmed (verbatim from the scan) · `TMC-001` |
| Same field set on a document six years earlier | `TM-74-1352-7`, Lycklama, 1974-06-14, p.1 — https://www.tuhs.org/Archive/Documentation/TechReports/Heinz_Tech_Memos/TM-74-1352-7_Plotting_Facilities_for_Mini-Computer_Systems_19740614.pdf | author-confirmed · `TMC-002` |
| Charging case and filing case are SEPARATE fields; filing = charging + `-11` in both specimens (`39199`/`39199-11`, `39394`/`39394-11`) | both scans, p.1 | author-confirmed, 2 specimens · `TMC-003` |
| Release notice printed on the cover, pointing at a numbered internal instruction: *"The information contained herein is for the use of employees of Bell Laboratories and is not for publication. (See GEI 13.9-3)"* | both scans, p.1 | author-confirmed · `TMC-004` |
| That numbered instruction is an ADMINISTRATIVE manual, not a writing standard: *"a thick book, called the General Executive Instructions (GEI), which described the administrative procedures"* | Noll, *Memories*, 2015, p.43 — https://worrydream.com/refs/Noll_2015_-_Memories,_A_Personal_History_of_Bell_Telephone_Laboratories.pdf | memoir, near-primary · `TMC-005` |
| Abstract sits below routing/filing info, and the stated REASON is scanning by supervisors: *"Below the routing and filing information on the cover sheet there is a brief abstract stating the substance of the memorandum. This is of especial interest to supervisors and department heads."* | R. C. Mathes, "Cover Sheet for Technical Memoranda—A Technique in Information Exchange," *Proc. I.R.E.* 37(8):912–913, Aug 1949, printed p.912 col.3 — https://www.worldradiohistory.com/Archive-IRE/40s/IRE-1949-08.pdf | author-confirmed · `TMC-006` |
| Five stated objectives of the technique: rapid dissemination · encouraging direct engineer-to-engineer contact · avoiding duplicated effort · avoiding vested interests / undue isolation of fields · speeding reviews of past work | Mathes 1949, p.912 col.2 | author-confirmed |
| **Personal authority**: *"They are regarded as the technical expositions of his work by the individual engineer and carry only his personal authority. Thus, a supervisor may approve them for file and circulation, even when not in full accord with some of the ideas expressed. They are only made a part of interdepartmental policy and action when transmitted with covering letters signed by supervision."* | Mathes 1949, p.913 col.1 | author-confirmed · `TMC-008`, `TMC-009` |
| The form VARIED by department and era — a 1945 research-department cover carries a numbered ROUTING list, an `INDEX NO.` field, and classification markings, and lacks the later size counts | Shannon 1945 declassified cover sheet, p.2 — https://www.iacr.org/museum/shannon/shannon45.pdf | author-confirmed; number field reads `MM- 45-110-92` on the scan against a widely-repeated `MM 45-110-02` in secondary citation — unresolved, do not cite the number · `TMC-007` |

**Name discipline note.** The 1949 author is **R. C. Mathes**, a Bell Labs engineer — NOT J. C.
Mathes (b. 1931), co-author of the 1976 textbook *Designing Technical Reports*. Different people.
Conflating them launders a 1976 pedagogy into a 1949 institutional record.

## §2 The one measured claim — distribution reach

Everything else in this record is documentary. This row is a measurement, and it is the empirical
basis for gate T3.

> *"Brown and McMahon have carried out a comparative study of authors' and MERCURY distribution…
> They found that: 1. The average non-MERCURY author believes that his initial coverage is about
> 80% but in fact it is less than 50%. MERCURY's initial coverage is approximately double the
> author's. 2. The average non-MERCURY author believes correctly that he achieves an initial
> relevance of about 80%."*
> — Brown & Traub, "MERCURY: A System for the Computer-Aided Distribution of Technical Reports,"
> *J. ACM* 16(1):13–25, 1969, pp.11–13 —
> https://iiif.library.cmu.edu/file/Traub_box00027_fld00052_bdl0002_doc0001/Traub_box00027_fld00052_bdl0002_doc0001.pdf

Strength: peer-reviewed, **but** the underlying comparative study is an unpublished internal
report cited at reference [2]; the original was not read. `TMC-019`, `TMC-020`.

Two corollaries that change what you do:

- The bias is **asymmetric**: reach is badly overestimated, *relevance* is estimated correctly.
  So the fix is a wider or mechanically-routed `to:`, not a more carefully filtered one.
- Addressee declaration was placed at DRAFT time, not at issue time: *"When an author submits a
  preliminary draft of a memorandum to his supervisor for review, he should include a preliminary
  draft of the distribution form."* — MERCURY Bulletin No. 1: Instructions for Authors, Brown &
  Traub, 1966-03-07, extracted lines 28–31 —
  https://iiif.library.cmu.edu/file/Traub_box00001_fld00017_bdl0011_doc0001/Traub_box00001_fld00017_bdl0011_doc0001.pdf
  (`TMC-018`)

**Do NOT extend this to research output.** No source connects this document type or its
distribution machinery to invention or research productivity. What was measured is delivery
coverage. `TMC-023`.

## §2.5 Writing instruction DID exist — added 2026-08-10, correcting §3

This section exists because an earlier version of this file got it wrong. Read the correction, not
just the facts: the old verdict inferred absence from an eyewitness memoir's silence. It should
have named where such a thing would survive and looked there.

| Fact | Locus | Strength |
|---|---|---|
| A **Technical Writing** course sat in the third-year list of an in-house programme, among courses "organized and taught by Bell Laboratories instructors" | J. N. Shive, "The CDT-NYU Program," *Bell Laboratories Record* 38(11):408–411, Nov 1960 — https://www.worldradiohistory.com/Archive-Bell-Laboratories-Record/60s/Bell-Laboratories-Record-1960-11.pdf | author-confirmed, the company's own house magazine · `TMC-012` |
| A full programme by 1986: two courses, two manager workshops, writing centres, one textbook and a second in progress; a 10-week effective-writing course taught by "writing specialists familiar with Bell Labs' documents, the documentation process itself" | Wilma Davidson (a programme instructor), NYT op-ed, 1986-07-27 — https://www.nytimes.com/1986/07/27/nyregion/new-jersey-opinion-ps-it-s-not-just-what-you-write-but-how-you-write-it.html | near-primary; **read from the free preview only**, the rest is paywalled · `TMC-012` |
| Two internal textbooks registered as works for hire: *The Bell Labs Writer* (Trenner, 1985, 135pp, reg. TX0001644689) and *The Bell Labs Editor* (Davidson & Trenner, 1986, 72pp, reg. TX0002003015, "prepared by Kelly Education and Training Center") | US Copyright Office registration records | catalogue record only — **neither book has been read** · `TMC-031` |
| A machine style checker whose **default** comparison corpus was memoranda vetted by management: *"-tm  Compare input text to Bell Labs Technical Memoranda judged good by department heads in the research area. (This is the default.)"* | Writer's Workbench manual page, Documentation Technologies Group — https://mirrors.nycbug.org/pub/The_Unix_Archive/Unix_Usenet/comp.unix/1984-December/008317.html | author-confirmed · `TMC-030` |
| The house typesetting macros treat the body as one undifferentiated segment: *"Body—This segment is the actual text of the document… The existence and size of these four segments varies widely among different document types."* | PWB/MM User's Manual §1.3 — https://archive.computerhistory.org/resources/access/text/2024/05/102734484-05-0009-acc.pdf | author-confirmed · `TMC-032` |

**What this does and does not change.** It refutes "nobody taught writing here". It does NOT touch
the body-format question: every artefact above governs surface style (readability, sentence length,
diction), typesetting segments, or the existence of instruction — none prescribes sections. If
anything the position hardens: an organisation with courses, textbooks, writing centres and a
style-checking tool still left the body unregulated.

**The live gap now has an address.** *The Bell Labs Writer* and *The Bell Labs Editor* are unread.
One survives as an access-restricted scan (Internet Archive item `bwb_S0-DHV-388`), and an outside
paper cites a specific page (Goldberg, Safran & Shapiro, "Active Mail," ACM CSCW 1992,
doi:10.1145/143457.143464). If either prescribes body sections, `TMC-015`/`TMC-016` invert and this
skill's NEVER guard must be rewritten.

**On the title that started this.** "Writing a Technical Memorandum" as a Bell Labs document does
**not** exist: archive.org full-text search returns zero, and the only real documents with that
title are 21st-century university course handouts. The claim that reached us carried a fabricated
bibliographic detail AND a true substantive point. Both at once. Rejecting the point because the
citation was fake would have been the larger error. `TMC-033`

## §3 What is NOT regulated — and the two retro-attributed templates

| Popular claim | Verdict | Why |
|---|---|---|
| "Background / hypothesis / data / conclusion structure was enforced" | **UNSUPPORTED** | No primary source regulates the body. The verified cover carries title, author, abstract, counts — nothing about sections. `TMC-015` |
| "Mixing observed facts / working model / speculation was strictly forbidden" | **UNSUPPORTED** | No primary source establishes this three-way split as a rule of the genre. `TMC-016` |
| "Conclusions came first" | **CONTRADICTED by the one readable specimen** | `TM-80-1270-1`'s conclusions section is §8 of 8, immediately before References. Abstract-first ≠ BLUF. `TMC-014` |
| "There was a writing course / an internal style guide" | **SUPPORTED** — this row was UNSUPPORTED until 2026-08-10 and was WRONG; see §2.5 | The correction matters more than the fact: the old verdict rested on an eyewitness memoir not mentioning courses, i.e. it treated a memoir's silence as evidence of absence. Colleague draft review is still attested — *"Colleagues reviewed drafts of Technical Memoranda… Their comments were very important"* (Noll 2015, p.36); *"peer pressure in the research group caused rough places to be smoothed"* (McIlroy, *A Research UNIX Reader*, p.5 — https://www.cs.dartmouth.edu/~doug/reader.pdf) — but it is one mechanism among several, not the only one. `TMC-011`, `TMC-012` |
| "Writing memoranda was mandatory" | **UNSUPPORTED** | Output counted at annual review, but no quota is attested; the contemporaneous testimony runs the other way: *"there was no particular pressure to publish either"* (Kernighan CHM oral history, p.5). `TMC-013` |
| "Feedback in days-to-weeks vs months for journals" | **UNSUPPORTED** | Plausible and unmeasured. No latency figure in any primary source |
| "A memo established legal priority" | **UNSUPPORTED, close to inverted** | The attested gate is a PRE-release patent check on external publication — release control, not priority capture. Noll 2015, p.36 · `TMC-010` |

**The absence is not proof of absence** — and the reason matters. An internal writing standard, had
it existed, would have been filed as administrative procedure and would not survive into technical
archives. The corpus position states this limit explicitly. What follows operationally: do not
assert that no such standard existed; assert that **none is citable**, which is the only thing that
governs whether you may attribute a template to the genre.

## §4 Norms that ARE citable today — durability-quarantined

These documents get revised. Dates verified 2026-08-10; re-fetch on reforge.

> **Every row in this section belongs to a DIFFERENT institution** — RFC/NWG, NASA, the US Army,
> RAND, Amazon, one named individual. None of them is the archival technical-memorandum genre of
> §1. They are kindred document institutions that chose to write their norms down, which is
> precisely why they are citable and §1's genre is not. **Never carry a §4 rule back into §1's
> voice.** Adopting one is legitimate; attributing one is the fabrication §3 forbids.

| Norm | What it actually says | Locus |
|---|---|---|
| Unfinished circulation is legitimate | *"Notes are encouraged to be timely rather than polished… The minimum length for a NWG note is one sentence."* | RFC 3, Crocker, Apr 1969 — https://www.rfc-editor.org/rfc/rfc3.txt · `TMC-024` |
| Abstract is mandatory | *"Every RFC must have an Abstract that provides a concise and comprehensive overview of the purpose and contents of the entire document."* | RFC 7322 §4.3, Sept 2014 — https://www.rfc-editor.org/rfc/rfc7322.txt · `TMC-025` |
| The tier definition of the words "technical memorandum" | *"Scientific and technical findings that are preliminary or of specialized interest, e.g., 'quick-release' reports, working papers… **Does not contain extensive analysis.**"* | NASA Publications Guide for Authors §2.1.1.2 / NPR 2200.2 — https://ntrs.nasa.gov/api/citations/20050189209/downloads/20050189209.pdf · `TMC-026` |
| BLUF, as a written requirement — and NOT from this genre | *"Two essential requirements include putting the main point at the beginning of the correspondence (bottom line up front) and using the active voice"* | AR 25-50, 2020-10-10, para. 1-38 — https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN42124-AR_25-50-007-WEB-13.pdf; lineage back to DA Pam 600-67, **1986-06-02** (not 1988) · `TMC-017` |
| Tiering with peer review as a TIER property | RM series = "working papers meant to report current results"; R series = "principal publication documenting… final research"; P series = "less formal than reports and did not require rigorous peer review" | RAND series pages — https://www.rand.org/pubs/research_memoranda.html · /reports.html · /papers.html · `TMC-027` |
| How a good memo is actually produced | *"The great memos are written and re-written, shared with colleagues who are asked to improve the work, set aside for a couple of days, and then edited again with a fresh mind."* | Amazon 2017 shareholder letter — https://www.aboutamazon.com/news/company-news/2017-letter-to-shareholders · `TMC-028` |
| Presentation effort | *"at least 50% of the time must go for the presentation"* — a claim by the speaker, with no comparison or measurement offered | Hamming, "You and Your Research," 1986 — https://www.cs.virginia.edu/~robins/YouAndYourResearch.pdf · `TMC-029` |

**Not citable, despite ubiquity:** the widely-copied Google design-doc template (Context and scope
/ Goals and non-goals / …) is a personal blog post by a former employee who states design docs
"don't follow a strict guideline" — https://www.industrialempathy.com/posts/design-docs-at-google/.
It is a fine template. It is not an institutional norm, and must not be cited as one.

## §5 Claim-id map

Every `TMC-0NN` in `SKILL.md` and in this file resolves to a row in the corpus claim ledger
`led202608_0021-technical_memorandum_composition`, under the signed position
`sok202608_0021-technical_memorandum_composition`, with its search protocol at
`pro202608_0021-technical_memorandum_composition`. The ledger carries the inversion condition and
the stated limits for each row; this file carries only the loci and the operational consequence.
