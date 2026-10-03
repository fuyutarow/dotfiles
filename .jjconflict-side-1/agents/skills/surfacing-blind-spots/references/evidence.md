# Evidence — source observations versus design inference

> **Scope and SOLE claim ledger**: this file is the only home for claims used to justify the
> skill's design. A source observation reports what a cited artifact or study contains. A design
> inference reports what this skill chooses to do with it. The second never inherits the first's
> evidential strength.

## Evidence grammar

| Label | Meaning |
|---|---|
| **SOURCE OBSERVATION** | directly supported by the cited source within its stated task and sample |
| **DESIGN INFERENCE** | a house choice motivated by, but not established by, the source |
| **LIMIT** | what must not be generalized from the source |

## Source-to-rule ledger

### `/dig` command source

- **Source**: [`dig.md` at commit
  `693d9b5`](https://github.com/fumiya-kume/claude-code/blob/693d9b5027a15eeb9ab1c8d3670d6e60d33888a6/dig/commands/dig.md),
  version 3.0.1. The commit is the stable source; `master` is not.
- **SOURCE OBSERVATION**: the command reads the plan and project context before questions,
  maps assumptions, asks two or three questions per round, follows major topics at least two
  levels, and integrates discoveries into the plan.
- **DESIGN INFERENCE**: retain context-first reading, bounded questions, explicit assumption
  mapping, and a two-level depth trace.
- **LIMIT**: this is an authored command, not an effectiveness study. Its software-centric
  assumption categories do not establish a complete blind-spot taxonomy.
- **Rejected source rule**: its completeness checklist says all high-risk assumptions can be
  addressed. This skill rejects that closure claim and preserves **OPEN — NON-EXHAUSTIVE**.

### Serverworks `/dig` experiment

- **Source**: [折戸亮太, “/digで「知の四象限」を動かせるか試した話”
  (2026-03-30)](https://blog.serverworks.co.jp/claude-code-dig-discovery-experiment).
- **SOURCE OBSERVATION**: the author reports that premise mapping and follow-up questions
  elicited an association from the author's own thinking during one exploratory puzzle.
- **SOURCE OBSERVATION**: the author explicitly says the undigged run came first, the `/dig`
  run came second with prior exposure, and separate sessions were not used.
- **SOURCE OBSERVATION**: the article explicitly labels the transfer from the puzzle to software
  development as an extrapolation.
- **DESIGN INFERENCE**: make real-human tacit elicitation a bounded, provenance-carrying step.
  Record `UNELICITED` when no owner is available.
- **LIMIT**: this N=1, order-confounded narrative cannot show that `/dig` caused the result,
  works generally, or converts genuine unknown unknowns into known unknowns.

### Structured imagination

- **Source**: Ward (1994), “Structured Imagination: The Role of Category Structure in Exemplar
  Generation,” *Cognitive Psychology*, 27(1), 1–40.
  [doi:10.1006/cogp.1994.1010](https://doi.org/10.1006/cogp.1994.1010).
- **SOURCE OBSERVATION**: in alien-animal generation tasks, many imagined creatures retained
  properties typical of Earth animals, including bilateral symmetry, sensory receptors, and
  appendages.
- **DESIGN INFERENCE**: perturb object, relation, observation, and regime explicitly instead of
  trusting an unconstrained “think differently” instruction to escape default structure.
- **LIMIT**: the study does not test this skill, research planning, human interviews, or the
  seven-slot taxonomy. Typed perturbation is engineered, not measured here.

### Example-induced fixation

- **Source**: Smith, Ward, and Schumacher (1993), “Constraining Effects of Examples in a
  Creative Generation Task,” *Memory & Cognition*, 21, 837–845.
  [doi:10.3758/BF03202751](https://doi.org/10.3758/BF03202751).
- **SOURCE OBSERVATION**: across three experiments, participants shown examples were more likely
  to reproduce example features; an instruction to be very different did not remove the effect.
- **DESIGN INFERENCE**: ask contrastive premise questions without first supplying
  model-generated solution examples. Human answers remain a separate evidence source.
- **LIMIT**: the experiments concern creative exemplar generation, not every question format.
  They do not prove that all examples harm elicitation.

### Problem construction before solution generation

- **Source**: Reiter-Palmon and Murugavel (2018), “The Effect of Problem Construction on Team
  Process and Creativity,” *Frontiers in Psychology*, 9:2098.
  [doi:10.3389/fpsyg.2018.02098](https://doi.org/10.3389/fpsyg.2018.02098).
- **SOURCE OBSERVATION**: 65 three-person student teams were assigned to a control or one of
  three problem-construction instruction conditions before solving one student-workload problem.
- **SOURCE OBSERVATION**: the collapsed problem-construction conditions showed marginally higher
  originality (`p = 0.078`, reported effect size `0.03`) and no detected quality difference.
  Satisfaction and conflict outcomes differed more clearly.
- **DESIGN INFERENCE**: keep premise excavation distinct from solution generation and preserve a
  handoff boundary.
- **LIMIT**: this is initial evidence in one team task with limited control-group power. It does
  not establish a general creativity gain or the efficacy of this packet.

### Generative-AI assistance and output diversity

- **Source**: Doshi and Hauser (2024), “Generative AI Enhances Individual Creativity but Reduces
  the Collective Diversity of Novel Content,” *Science Advances*, 10(28), eadn5290.
  [doi:10.1126/sciadv.adn5290](https://doi.org/10.1126/sciadv.adn5290).
- **SOURCE OBSERVATION**: in an online experiment producing 293 eight-sentence stories, access
  to one or up to five model-generated story ideas improved several individual evaluations,
  while AI-assisted stories were more similar to one another.
- **DESIGN INFERENCE**: do not count multiple agents or multiple model answers as independent
  tacit evidence. Preserve human provenance and **OPEN** instead of claiming coverage from volume.
- **LIMIT**: the task was short-story writing with non-interactive idea prompts. It does not show
  that every model-assisted workflow homogenizes, or that human elicitation guarantees diversity.

## What this evidence does not license

Do not claim that:

- the seven slots enumerate reality or eliminate unknown unknowns;
- two levels of questioning are universally optimal;
- tacit elicitation always produces a useful discovery;
- a structurally valid packet is creative, complete, important, or true;
- human input is automatically correct because it is human;
- typed perturbation alone produces lateral theses.

The skill's defensible claim is narrower: it enforces a traceable procedure that makes some
plausible hidden premises, unresolved human knowledge, and residual openness explicit.
