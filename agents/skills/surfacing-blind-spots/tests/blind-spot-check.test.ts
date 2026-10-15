import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../scripts/blind-spot-check.ts");
const temporaryDirectories: string[] = [];

type RunResult = Readonly<{
  exitCode: number;
  stderr: string;
  stdout: string;
}>;

async function run(
  arguments_: readonly (string | Promise<string>)[],
  stdin?: string,
): Promise<RunResult> {
  const resolvedArguments = await Promise.all(
    arguments_.map((argument) => Promise.resolve(argument)),
  );
  const process = Bun.spawn({
    cmd: ["bun", script, ...resolvedArguments],
    stdin: stdin === undefined ? "ignore" : Bun.file(await fixture(stdin)),
    stderr: "pipe",
    stdout: "pipe",
    signal: AbortSignal.timeout(10_000),
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return {
    exitCode,
    stderr,
    stdout,
  };
}

async function fixture(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "blind-spot-packet-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "packet.md");
  await writeFile(path, `${content.trim()}\n`);
  return path;
}

const completePacket = `
## Object under review
Decision memo at plan.md:1-90.

## Decision at stake
Whether the team should freeze the current launch scope.

## Search budget
Three human questions and one source pass.

## Assumption ledger
| ID | Primary slot | Assumption | Cross-tags | Evidence | Uncertainty | Frame damage | Search cost | Selection |
|---|---|---|---|---|---|---|---|---|
| A1 | OBJECT | The paying administrator is the only affected actor. | VALUE | ARTIFACT:plan.md:12 | UNKNOWN | FRAME | BOUNDED | LOAD-BEARING |
| A2 | RELATION | Faster onboarding causes higher retention. | OBSERVATION | ARTIFACT:plan.md:24 | CONTESTED | DECISION | BOUNDED | LOAD-BEARING |
| A3 | OBSERVATION | Support-ticket silence means setup is understood. | RELATION | INFERENCE | UNKNOWN | DISCRIMINATOR | NOW | NOT-SELECTED |
| A4 | REGIME | The pilot usage pattern persists at ten times the tenant count. | NONE | INFERENCE | UNKNOWN | FRAME | EXTERNAL | NOT-SELECTED |
| A5 | VALUE | Launch date matters more than reversible administrator errors. | ACTION | ARTIFACT:plan.md:7 | SUPPORTED | DECISION | NOW | NOT-SELECTED |
| A6 | ACTION | Scope must be frozen before the migration rehearsal. | REGIME | ARTIFACT:plan.md:51 | CONTESTED | LOCAL | BOUNDED | NOT-SELECTED |
| A7 | OPEN | OPEN — institutional incentives may interact with unobserved user workarounds. | NONE | INFERENCE | UNKNOWN | FRAME | INACCESSIBLE | NOT-SELECTED |

## Open-set residual
OPEN — NON-EXHAUSTIVE: the sweep cannot cover tacit practices outside the represented teams.

## Tacit-knowledge probes
| Probe | Target | Contrastive question | Provenance | Answer | Decision change |
|---|---|---|---|---|---|
| P1 | EXPERT-WORKAROUND | If operators bypass onboarding rather than complete it, does scope freeze still follow? | HUMAN:research-lead@conversation:user-turn-7 | Two pilot operators use an undocumented CSV path. | Reopens the object and action assumptions. |

## Depth trace
- Root assumption: A1
- Level 1: HUMAN:research-lead@conversation:user-turn-7 — operators, not administrators, absorb setup failure.
- Level 2: HUMAN:research-lead@conversation:user-turn-7 — operator workarounds hide errors from the ticket metric.

## Discoveries
| Discovery | Source | Consequence |
|---|---|---|
| Two pilot operators bypass the documented path. | HUMAN:research-lead@conversation:user-turn-7 | The represented actor and observation proxy both need review. |

## Handoff
raising-resolution should inspect A3 using the support and CSV audit locators.

## Stop reason
DECISION-INSENSITIVE — another general question cannot change the frame without inspecting A3.
`;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("blind-spot-check", () => {
  test("accepts a complete packet with typed assumptions and human provenance", async () => {
    const result = await run([fixture(completePacket)]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("B2  PASS");
    expect(result.stdout).toContain("B6  PASS");
    expect(result.stdout).toContain("FAIL=0");
    expect(result.stderr).toBe("");
  });

  test("accepts stdin and transparent UNELICITED depth when the human is unavailable", async () => {
    const packet = completePacket
      .replace(
        "| P1 | EXPERT-WORKAROUND | If operators bypass onboarding rather than complete it, does scope freeze still follow? | HUMAN:research-lead@conversation:user-turn-7 | Two pilot operators use an undocumented CSV path. | Reopens the object and action assumptions. |",
        "| P1 | EXPERT-WORKAROUND | If operators bypass onboarding rather than complete it, does scope freeze still follow? | UNELICITED | UNELICITED | Reopens the object and action assumptions. |",
      )
      .replace(
        "- Level 1: HUMAN:research-lead@conversation:user-turn-7 — operators, not administrators, absorb setup failure.",
        "- Level 1: UNELICITED — the answer requires an absent operations owner.",
      )
      .replace(
        "- Level 2: HUMAN:research-lead@conversation:user-turn-7 — operator workarounds hide errors from the ticket metric.",
        "- Level 2: UNELICITED — the second premise cannot be followed without Level 1.",
      )
      .replace(
        "| Two pilot operators bypass the documented path. | HUMAN:research-lead@conversation:user-turn-7 | The represented actor and observation proxy both need review. |",
        "| The operator-workaround branch remains unresolved. | INFERENCE | Preserve it as a known unknown. |",
      )
      .replace(
        "DECISION-INSENSITIVE — another general question cannot change the frame without inspecting A3.",
        "HUMAN-UNAVAILABLE — the next load-bearing answer belongs to the absent operations owner.",
      );
    const result = await run([], packet);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("B5  WARN");
    expect(result.stdout).toContain("HUMAN-UNAVAILABLE");
    expect(result.stderr).toBe("");
  });

  test("rejects a shallow checklist that merely mentions the vocabulary", async () => {
    const result = await run([
      fixture(`
# Blind-spot checklist
- Object under review: plan.md
- Decision at stake: launch
- Search budget: three questions
- Assumption ledger: OBJECT RELATION OBSERVATION REGIME VALUE ACTION OPEN
- Tacit-knowledge probes: ask a person
- Depth trace: go deeper
- Open-set residual: OPEN
- Stop reason: stop eventually
`),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("B1  FAIL");
    expect(result.stdout).toContain("B2  FAIL");
    expect(result.stdout).toContain("B6  FAIL");
    expect(result.stdout).toContain("B8  FAIL");
  });

  test("rejects a ledger that omits one typed primary slot", async () => {
    const packet = completePacket.replace(
      "| A7 | OPEN | OPEN — institutional incentives may interact with unobserved user workarounds. | NONE | INFERENCE | UNKNOWN | FRAME | INACCESSIBLE | NOT-SELECTED |\n",
      "",
    );
    const result = await run([fixture(packet)]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("typed sweep omitted: OPEN");
  });

  test("rejects multiple values in one Primary slot while allowing cross-tags", async () => {
    const packet = completePacket.replace(
      "| A1 | OBJECT |",
      "| A1 | OBJECT, VALUE |",
    );
    const result = await run([fixture(packet)]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "Primary slot must be exactly one canonical slot",
    );
  });

  test("rejects a scalar score even when all four axes remain present", async () => {
    const packet = completePacket
      .replace(
        "| ID | Primary slot | Assumption | Cross-tags | Evidence | Uncertainty | Frame damage | Search cost | Selection |",
        "| ID | Primary slot | Assumption | Cross-tags | Evidence | Uncertainty | Frame damage | Search cost | Selection | Score |",
      )
      .replace(
        "|---|---|---|---|---|---|---|---|---|",
        "|---|---|---|---|---|---|---|---|---|---|",
      )
      .replaceAll("| LOAD-BEARING |", "| LOAD-BEARING | 9 |")
      .replaceAll("| NOT-SELECTED |", "| NOT-SELECTED | 3 |");
    const result = await run([fixture(packet)]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("B3  FAIL");
    expect(result.stdout).toContain("scalar Score column is forbidden");
  });

  test("rejects model-simulated human provenance", async () => {
    const packet = completePacket.replaceAll(
      "HUMAN:research-lead@conversation:user-turn-7",
      "MODEL:simulated-owner",
    );
    const result = await run([fixture(packet)]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("B5  FAIL");
    expect(result.stdout).toContain(
      "Provenance must be HUMAN:<owner>@<attestation-locus> or UNELICITED",
    );
  });

  test("rejects a one-level trace", async () => {
    const packet = completePacket.replace(
      "- Level 2: HUMAN:research-lead@conversation:user-turn-7 — operator workarounds hide errors from the ticket metric.\n",
      "",
    );
    const result = await run([fixture(packet)]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("B6  FAIL");
    expect(result.stdout).toContain("Level 2");
  });

  test("does not mistake an ordinary OPEN mention for an open-set residual", async () => {
    const packet = completePacket.replace(
      "OPEN — NON-EXHAUSTIVE: the sweep cannot cover tacit practices outside the represented teams.",
      "The word OPEN appears in the source plan.",
    );
    const result = await run([fixture(packet)]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("B7  FAIL");
    expect(result.stdout).toContain("NON-EXHAUSTIVE");
  });

  test("rejects a non-strategic stop and a generated-thesis section", async () => {
    const packet = completePacket
      .replace(
        "DECISION-INSENSITIVE — another general question cannot change the frame without inspecting A3.",
        "Continue until every topic has been discussed.",
      )
      .concat("\n## Thesis candidates\nA model-generated answer.\n");
    const result = await run([fixture(packet)]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("B8  FAIL");
    expect(result.stdout).toContain("B10  FAIL");
    expect(result.stdout).toContain("forbidden headings: Thesis candidates");
  });

  test("rejects an explicitly simulated answer behind a valid HUMAN locator", async () => {
    const packet = completePacket.replace(
      "Two pilot operators use an undocumented CSV path.",
      "MODEL-SIMULATED: two pilot operators use an undocumented CSV path.",
    );
    const result = await run([fixture(packet)]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("B5  FAIL");
    expect(result.stdout).toContain("explicitly synthetic");
  });

  test("rejects forbidden headings regardless of case", async () => {
    const result = await run([
      fixture(`${completePacket}\n## thesis candidates\nA generated answer.\n`),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("B10  FAIL");
    expect(result.stdout).toContain("forbidden headings: thesis candidates");
  });

  test("rejects completeness claims but permits an explicit non-coverage claim", async () => {
    const closed = await run([
      fixture(
        completePacket.replace(
          "OPEN — NON-EXHAUSTIVE: the sweep cannot cover tacit practices outside the represented teams.",
          "OPEN — NON-EXHAUSTIVE: No material blind spots remain; this inventory is complete.",
        ),
      ),
    ]);
    const open = await run([
      fixture(`${completePacket}\nNot all blind spots were found.\n`),
    ]);

    expect(closed.exitCode).toBe(1);
    expect(closed.stdout).toContain("exhaustive blind-spot coverage claim");
    expect(open.exitCode).toBe(0);
  });

  test("allows transparent UNELICITED depth when a finite budget is binding", async () => {
    const packet = completePacket
      .replace(
        "| P1 | EXPERT-WORKAROUND | If operators bypass onboarding rather than complete it, does scope freeze still follow? | HUMAN:research-lead@conversation:user-turn-7 | Two pilot operators use an undocumented CSV path. | Reopens the object and action assumptions. |",
        "| P1 | EXPERT-WORKAROUND | If operators bypass onboarding rather than complete it, does scope freeze still follow? | UNELICITED | UNELICITED | Reopens the object and action assumptions. |",
      )
      .replace(
        "- Level 1: HUMAN:research-lead@conversation:user-turn-7 — operators, not administrators, absorb setup failure.",
        "- Level 1: UNELICITED — the first premise needs a human answer.",
      )
      .replace(
        "- Level 2: HUMAN:research-lead@conversation:user-turn-7 — operator workarounds hide errors from the ticket metric.",
        "- Level 2: UNELICITED — the second premise depends on Level 1.",
      )
      .replace(
        "| Two pilot operators bypass the documented path. | HUMAN:research-lead@conversation:user-turn-7 | The represented actor and observation proxy both need review. |",
        "| The operator-workaround branch remains unresolved. | INFERENCE | Preserve it as a known unknown. |",
      )
      .replace(
        "DECISION-INSENSITIVE — another general question cannot change the frame without inspecting A3.",
        "BUDGET-SPENT — the declared question budget was exhausted at three questions.",
      );
    const result = await run([fixture(packet)]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("B5  WARN");
    expect(result.stdout).toContain("stop code: BUDGET-SPENT");
  });

  test("rejects a non-contrastive probe, inert decision branch, and shallow depth", async () => {
    const packet = completePacket
      .replace(
        "If operators bypass onboarding rather than complete it, does scope freeze still follow?",
        "Tell me anything about onboarding.",
      )
      .replace("Reopens the object and action assumptions.", "Nothing changes.")
      .replace(
        "operators, not administrators, absorb setup failure.",
        "shallow",
      );
    const result = await run([fixture(packet)]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("B5  FAIL");
    expect(result.stdout).toContain("contrast between answer branches");
    expect(result.stdout).toContain("B6  FAIL");
  });

  test("rejects an unbounded search budget and a packet-level scalar score", async () => {
    const packet = completePacket
      .replace(
        "Three human questions and one source pass.",
        "Unlimited questions until everything is covered.",
      )
      .concat("\nOverall priority score: 9\n");
    const result = await run([fixture(packet)]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("B1  FAIL");
    expect(result.stdout).toContain("unbounded");
    expect(result.stdout).toContain("B3  FAIL");
    expect(result.stdout).toContain("packet-level scalar score");
  });

  test("rejects questions-before-reading and an ownerless decision handoff", async () => {
    const packet = completePacket
      .replace(
        "Decision memo at plan.md:1-90.",
        "Decision memo at plan.md:1-90; asked first before reading the artifact.",
      )
      .replace(
        "raising-resolution should inspect A3 using the support and CSV audit locators.",
        "Choose the thesis and implement it.",
      );
    const result = await run([fixture(packet)]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("B10  FAIL");
    expect(result.stdout).toContain("questions preceded reading");
    expect(result.stdout).toContain("does not name an owner");
    expect(result.stdout).toContain("solution/selection/commit verdict");
  });

  test("uses Cleye's unknown-option exit", async () => {
    const result = await run(["--unexpected"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown flag: --unexpected");
    expect(result.stdout).toBe("");
  });

  test("uses exit 2 for a missing input path", async () => {
    const result = await run(["/definitely/not/a/blind-spot-packet.md"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("blind-spot-check: file not found");
    expect(result.stdout).toBe("");
  });
});
