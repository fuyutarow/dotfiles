# Sources — creative-research evidence ledger

> **Review type**: rapid, bounded primary-source review completed 2026-07-30.
> **Scope**: problem construction, hidden-premise excavation, fixation/structured imagination,
> question-led human elicitation, hypothesis/experiment search, real-lab discovery, analogy and
> recombination, problem-solution co-evolution, idea selection, research risk, incubation, and
> human–LLM research ideation.
> **Limits**: not a systematic review; English sources dominate; designs and outcomes are heterogeneous;
> no pooled effect estimate; several classic records were available only at abstract level. Claims below
> retain their study scope. The user-supplied Gemini conversation was treated as a proposal/failure trace,
> not as evidence.

## Search log

Route: web search -> DOI/publisher/official proceedings -> author-hosted PDF/arXiv -> locator check.
Backward chaining was used only to adjudicate scoped disagreements such as incubation effects.

```text
"problem construction creativity Mumford 1996 primary study DOI"
"Kevin Dunbar How scientists really reason real-world laboratories 1995 full text"
"Klahr Dunbar 1988 dual space search scientific reasoning DOI full text"
"Dorst Cross 2001 creativity design process co-evolution problem solution DOI"
"Uzzi Mukherjee Stringer Jones 2013 atypical combinations scientific impact Science DOI"
"Foster Rzhetsky Evans 2015 tradition and innovation scientists research strategies DOI full text"
"Boudreau Guinan Lakhani Riedl Looking Across Looking Beyond Knowledge Frontier 2016 novelty resource allocation science DOI"
"Gick Holyoak 1983 schema induction analogical transfer DOI"
"Sio Ormerod 2009 incubation creativity meta-analysis DOI abstract"
"Baird Smallwood Mrazek Kam Schooler 2012 inspired by distraction mind wandering creativity DOI full text"
"incubation creativity no effect counterevidence experiment DOI"
"LLM scientific idea generation human expert evaluation Si Yang Hashimoto ICLR 2025"
"The Ideation-Execution Gap execution outcomes LLM-generated human research ideas arXiv 2506.20803"
"ACL 2026 single-agent generation surpasses multi-agent systems semantic diversity scientific ideas"
"diversity collapse multi-agent LLM scientific proposal generation ACL 2026"
"problem finding creative achievement scientific research empirical study primary"
"Reiter-Palmon Mumford problem construction performance 1997 primary study DOI"
"Ward 1994 structured imagination category structure exemplar generation DOI"
"Smith Ward Schumacher 1993 constraining examples creative generation DOI"
"Reiter-Palmon Murugavel 2018 team problem construction creativity DOI"
"question asking complexity open ended problem solving 2024 DOI"
"generative AI individual creativity collective diversity Doshi Hauser 2024 DOI"
```

## Primary-source ledger

| ID | Source / locator | Supported scoped claim | Limitations |
|---|---|---|---|
| C01 | Mumford et al. (1996), [DOI](https://doi.org/10.1207/s15326934crj0901_6), abstract | Problem-construction measures correlated with performance on bounded creative problem-solving tasks and explained variance beyond ability/divergent thinking. | Correlational; general tasks, not practicing scientists; abstract-level access. |
| C02 | Klahr & Dunbar (1988), [DOI](https://doi.org/10.1207/s15516709cog1201_1), abstract | Scientific reasoning in a simulated task involved search in hypothesis and experiment spaces; participants used both prior-knowledge and result-generalization strategies. | Small adult samples (`N=20`, `N=10`); simulated electronic device; abstract-level access. |
| C03 | Dunbar (1995), [author-hosted record](https://www.researchgate.net/publication/243774176_How_scientists_really_reason_Scientific_reasoning_in_real-world_laboratories), Methods and “Surprising findings” | In observed molecular-biology labs, unexpected control results sometimes seeded discovery when controls, live alternatives, and follow-up made them interpretable. | Four labs over one year; observational; no universal causal effect. |
| C04 | Dunbar (1995), “Long-distance analogies” and “Local and regional analogies” | Local/regional analogies were observed in lab problem solving; the observed discoveries were not directly caused by long-distance analogies. | Naturalistic observation; does not prove distant analogy never helps. |
| C05 | Gick & Holyoak (1983), [DOI](https://doi.org/10.1016/0010-0285(83)90002-6), abstract and general discussion | Comparing two analogs could support schema abstraction and transfer; one analog alone did not reliably produce transfer. | Story/radiation laboratory tasks, not scientific discovery. |
| C06 | Dorst & Cross (2001), [DOI](https://doi.org/10.1016/S0142-694X(01)00009-6), abstract and §3 | Experienced designers refined problem and solution representations together rather than fixing the problem once. | Nine industrial designers; direct design evidence, only analogical support for science. |
| C07 | Uzzi et al. (2013), [DOI](https://doi.org/10.1126/science.1240474), abstract and Fig. 4 | In a large bibliometric dataset, conventionally grounded papers containing a minority of atypical combinations were associated with higher citation impact. | Observational; co-citation novelty and citations are proxies, not truth or social value. |
| C08 | Foster, Rzhetsky & Evans (2015), [DOI](https://doi.org/10.1177/0003122415601618), abstract/results | Risky biomedical research strategies were uncommon and often discounted, while successful risky work could have high impact/recognition. | Observational network and recognition proxies; intended strategy not directly observed. |
| C09 | Rietzschel et al. (2010), [DOI](https://doi.org/10.1348/000712609X414204), abstract | Participants selecting their own ideas favored feasibility/desirability at an originality cost; an originality instruction changed selection. | Laboratory idea-selection task, not real research; abstract-level access. |
| C10 | Boudreau et al. (2016), [DOI](https://doi.org/10.1287/mnsc.2015.2285), pp. 1–3, 7, 12, 15 | In randomized evaluator-proposal assignments, evaluators nearer the topic scored proposals lower; highly novel proposals also received lower scores and the novelty-score relation was non-monotonic. | One disease domain; proposal novelty not randomized; no ground-truth proposal quality. |
| C11 | Baird et al. (2012), [DOI](https://doi.org/10.1177/0956797612446024), abstract/discussion | A low-demand break improved performance on previously encountered alternate-uses tasks relative to several comparison activities. | Divergent-thinking task; mechanism and transfer to scientific discovery are uncertain. |
| C12 | Kazemian et al. (2024), [DOI](https://doi.org/10.1177/02762374231217638), abstract/introduction | A within-subject study (`N=64`) detected no effect of four incubation activities on five creativity scores. | One cultural setting and task family; scoped null, not proof that incubation never helps. |
| C13 | Si, Yang & Hashimoto (ICLR 2025), [paper](https://proceedings.iclr.cc/paper_files/paper/2025/file/ea94957d81b1c1caf87ef5319fa6b467-Paper-Conference.pdf), pp. 5, 7–9 | In a bounded NLP study, LLM proposals were rated more novel and slightly less feasible; many generated seeds collapsed to far fewer nonduplicates; self-ranking was near random. | Short NLP proposals, subjective review, limited human baseline; no execution outcome. |
| C14 | Si, Hashimoto & Yang (ICLR 2026), [arXiv](https://arxiv.org/abs/2506.20803), abstract and pp. 2, 5–6 | After experts executed assigned ideas, perceived novelty/excitement/effectiveness of AI ideas declined more than at proposal time, exposing an ideation-execution gap. | Small sample, seven NLP topics; direct post-execution human-vs-AI difference was not robust. |
| C15 | Chen et al. (ACL Findings 2026), [DOI](https://doi.org/10.18653/v1/2026.findings-acl.13), abstract, §6, limitations | In a large proposal-generation study, interacting agents could converge and reduce semantic diversity; blind initial generation or subgroup structures preserved more diversity. | Model/judge/embedding/round dependent; diversity is not correctness or value. |
| C16 | Ward (1994), [DOI](https://doi.org/10.1006/cogp.1994.1010), abstract/Experiments 1–5 | In alien-animal generation tasks, outputs commonly inherited typical Earth-animal properties; instructions and constraints changed which knowledge structures were used. This supports an accessible-default/fixation risk and explicit representation perturbation. | `N=385` undergraduates in bounded imagination tasks; not research discovery and not proof that any perturbation yields value. |
| C17 | Smith, Ward & Schumacher (1993), [DOI](https://doi.org/10.3758/BF03202751), abstract | Across three creative-generation experiments, exposure to examples increased incorporation of example features, including after a delay. | Laboratory category-design tasks; example conformity is not identical to scientific-frame fixation. |
| C18 | Reiter-Palmon & Murugavel (2018), [full text](https://doi.org/10.3389/fpsyg.2018.02098), methods/results | In `65` student teams, instructed problem construction preceded lower conflict/higher satisfaction; the originality contrast was only marginal (`p=.078`) and quality did not differ. | Student-team task; small control condition; supports active problem construction only weakly for originality. |
| C19 | Raz et al. (2024), [DOI](https://doi.org/10.1016/j.tsc.2024.101598), abstract | Question creativity/complexity was positively related to open-ended problem-solving measures, not closed-ended performance. | Association does not establish that a `/dig`-style interview causes better research or reveals unknown unknowns. |
| C20 | Doshi & Hauser (2024), [full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC11244532/), abstract/methods | In a preregistered online short-story experiment (`N=293` writers), access to LLM ideas improved evaluated individual outputs, especially for lower-DAT writers, while AI-assisted stories were more similar to one another. | Eight-sentence fiction, opt-in idea access, non-interactive LLM; collective similarity is not scientific-thesis quality. |
| C21 | Gentner (1983), [DOI](https://doi.org/10.1207/s15516709cog0702_3), pp. 155–170 | Structure-mapping theory distinguishes relational systems from object attributes; connected relational structure is central to an analogy account. | Cognitive theory, not a test of this Skill's fields or a causal study of scientific discovery. |
| C22 | Gick & Holyoak (1983), [DOI](https://doi.org/10.1016/0010-0285(83)90002-6), abstract/general discussion | Comparing more than one analog could support schema abstraction and transfer; a single analog did not reliably yield transfer. | Story/radiation task; not a transfer intervention in research practice. |
| C23 | Gentner, Loewenstein & Thompson (2003), [DOI](https://doi.org/10.1037/0022-0663.95.2.393), pp. 399–402 | In bounded negotiation-learning experiments, comparison improved transfer relative to the reported no-comparison condition. | Classroom/laboratory negotiation context; no estimate for scientific research or an LLM workflow. |
| C24 | Hargadon & Sutton (1997), [DOI](https://doi.org/10.2307/2393655), pp. 716–749 | An ethnographic account describes a product-development firm's use of prior ideas across domains as a technology-brokering practice. | One firm's retrospective/observational account; not evidence that greater distance or brokerage causes useful target claims. |
| C25 | Star & Griesemer (1989), [DOI](https://doi.org/10.1177/030631289019003001), abstract/p. 387 | Boundary objects can coordinate work across social worlds while retaining different local meanings. | Historical case analysis; does not show that a wiki or a shared document resolves disagreement. |
| C26 | Carlile (2002), [DOI](https://doi.org/10.1287/orsc.13.4.442.2953), and Bechky (2003), [DOI](https://doi.org/10.1287/orsc.14.3.312.15162), abstracts | Knowledge boundaries can require syntax, semantic translation, and pragmatic transformation; artifacts and practice mediate but do not erase those differences. | Organizational field studies; no direct test of LLM documentation or this Skill's artifact contract. |
| C27 | Dunbar & Schunn (1990), [record](https://escholarship.org/uc/item/57c1f8xx), and Schunn & Dunbar (1996), [DOI](https://doi.org/10.3758/BF03213292) | Priming and analogy can be alternative routes in experimental scientific-discovery tasks. | Narrow experimental paradigms; a later idea or a reported origin does not establish the causal provenance of a target claim. |

## Design inputs — not empirical proof

- Kume, [`dig.md` v3.0.1](https://github.com/fumiya-kume/claude-code/blob/693d9b5027a15eeb9ab1c8d3670d6e60d33888a6/dig/commands/dig.md):
  an operational design specimen that reads context, maps/risk-orders assumptions, asks `2–3`
  contrastive questions per round, follows newly exposed assumptions at least two levels, integrates
  discoveries, and checks completeness. Its own principle is **deep, not wide**; it does not implement
  lateral thesis generation or an information-value stop rule.
- Serverworks (2026), [one `/dig` experiment](https://blog.serverworks.co.jp/claude-code-dig-discovery-experiment):
  a human reported shifting from a fact-only frame to fact-plus-metaphor during dialogue. The author
  explicitly identifies `N=1`, subjective judgment, order confounding, no reproducibility, and likely
  movement of an Unknown Known/tacit idea—not demonstrated discovery of an Unknown Unknown. The same
  article warns that indiscriminate digging creates spurious work and requires a human decision axis.

These inputs justify testing a bounded assumption-excavation function. They do not establish that the
function reliably discovers blind spots or produces creative research.

## Adjudication sources

- Sio & Ormerod (2009), [meta-analysis](https://doi.org/10.1037/a0014212): an average incubation
  benefit with strong moderation by task, preparation, and intervening activity. This supports a
  conditional human intervention, not a mandatory stage.
- Beaty et al. (2015), [DOI](https://doi.org/10.1038/srep10964): creative idea production in one small
  imaging study involved dynamic network coupling, not a simple “default-mode network alone” story.
  It does not license “be idle to become creative.”
- Encheng et al. (ACL Findings 2026), [DOI](https://doi.org/10.18653/v1/2026.findings-acl.1894):
  matched-prompt comparisons found single-agent/multi-output generation could exceed multi-agent
  semantic diversity. This further blocks the monotonic “more agents means more diversity” claim.

## What the evidence can support operationally

The following is a synthesis across sources, not a direct finding of one paper:

1. Surface the received frame's typed assumptions and retain an explicit open-set residual; never claim
   unknown-unknown completeness (C16–C19 plus the design inputs).
2. When a real human owner has load-bearing tacit context, ask bounded contrastive questions and retain
   `UNELICITED` when unavailable; do not simulate the answer (design inference, not a validated causal
   intervention).
3. Construct several problem representations rather than inheriting one wording (C01, C02, C06, C18).
4. Externalize current explanations, alternatives, anomalies, and artifact accounts (C02, C03).
5. Generate through more than one transformation coordinate, not merely multiple wordings or recipe
   labels (C02, C05, C16, C17).
6. Preserve independent human/model seeds or blind initial generation where anchoring/homogenization is
   material (C15, C17, C20).
7. Compare multiple analogs when using schema transfer (C05).
8. Keep conventional grounding with bounded atypical connections; distance itself is not quality
   (C04, C07).
9. Freeze/deduplicate candidates before evaluating consequence, discriminability, feasibility, novelty,
   and loss separately (C09, C10, C13, C15).
10. Maintain stable progress plus bounded high-risk probes; do not infer an all-in rule (C03, C08).
11. For each expensive/irreversible selected tree, prewrite a discriminating
    experiment/control/update rule through `acting-on-hypotheses`; run cheap deterministic reversible
    probes through the domain/plain executor (C02, C03).
12. Let controlled results update hypotheses and problem representations (C03, C06).
13. Evaluate execution artifacts, not proposal prose alone (C10, C13, C14).
14. Treat human incubation as optional after preparation/impasse; it has no established agent analogue
    (C11, C12 and the meta-analysis).
15. Keep a transfer route in three owned moves: target-agnostic donor discovery, source-to-target mapping
    or `MAPPING-BREAK`, then target-side disposition. Comparison and relational structure motivate the
    first two moves (C05, C21–C23); boundary studies caution that translation remains situated (C24–C27).
    The `DONOR SET`, digest, and target-evidence requirements are house controls, not measured effects of
    these papers.

## Rejected universal claims

| Claim | Verdict |
|---|---|
| “Problem setting is 80% of creative research.” | Unsupported percentage. |
| “Creation is difficult; criticism/evaluation is easy.” | Unsupported and inconsistent with documented selection bias and ranking failure. |
| “More ideas or more agents monotonically improve diversity and quality.” | Rejected; duplication, self-ranking failure, and diversity collapse are observed. |
| “Distant analogy is the primary cause of discovery.” | Too broad; real-lab observations emphasize local/regional analogy and other mechanisms. |
| “An anomaly automatically contains a discovery.” | Rejected; controls, alternatives, and follow-up are required. |
| “Incubation or default-mode activity reliably creates insight.” | Rejected as universal; human-task effects are heterogeneous and mechanisms uncertain. |
| “Novelty equals value.” | Rejected; novelty proxies, evaluator penalties, and execution outcomes differ. |
| “Feasibility identifies the best idea.” | Rejected; feasibility preference may reduce originality. |
| “Problem, idea, and evaluation form a one-way pipeline.” | Rejected; dual-space search and co-evolution support feedback. |
| `impact × solvability × originality` is a general ranking law. | No validating study found; axes are heterogeneous and relations may be non-monotonic. |
| “AI is more creative than humans at research.” | Too broad; bounded proposal novelty does not establish execution superiority. |
| “High-risk research should receive all resources.” | Not supported by observational risk/impact evidence. |
| “A checklist or `/dig` reliably discovers Unknown Unknowns.” | Unsupported. Typed scans and interviews can surface candidates/Unknown Knowns; reality remains open-set. |
| “Different generation-route labels prove diverse ideas.” | Rejected as a design inference; overlapping recipes can preserve the same premise, relation, and discriminator. |
| “A successful donor-domain mechanism validates the target claim.” | Rejected; source-side success can motivate a test, while adoption/retirement needs target-side evidence. |
| “The farther the analogy, broker, or combination, the better the research idea.” | Unsupported; the cited evidence does not establish a monotone distance effect. |
| “A wiki, jargon removal, or shared vocabulary itself solves a knowledge boundary.” | Rejected; boundary studies describe continuing translation and practice differences, not a truth-engine intervention. |
| “A later insight proves it came from the named analogy.” | Rejected; reported provenance and felt origin are not causal proof. |

## Known gaps

- Few longitudinal studies follow practicing scientists from problem construction through execution and
  long-term outcome.
- Causal tests of analogy/recombination interventions in real scientific discovery are scarce.
- No controlled study located here validates the exact `DONOR SET` → transfer-bundle →
  `TRANSFER DISPOSITION` contract, a generic `repo-read` bundle, or constrained repository application.
- Review score, citation, and prize outcomes are imperfect proxies for truth, reproducibility, and social
  value.
- The long-term, stage-specific role of human incubation remains unresolved.
- LLM evidence is concentrated in NLP and is sensitive to model, judge, prompt, and deduplication method.
- Better evidence would be preregistered, cross-domain, execution-inclusive, preserve provenance and
  negative results, and follow outcomes beyond proposal review.
- No controlled study located here validates a `/dig`-style, human-in-the-loop assumption interview for
  real scientific program outcomes.
- There is no complete taxonomy of blind spots. Operational categories must retain an `OPEN` residual
  and be treated as declared search coordinates, not reality's exhaustive partition.
