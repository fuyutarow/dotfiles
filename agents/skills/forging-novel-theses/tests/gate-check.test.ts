import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../scripts/gate-check.ts");
const temporaryDirectories: string[] = [];
const recoveryRule =
  "ONE targeted regeneration in an unoccupied legitimate cell; then COVERAGE GAP";

type RunResult = Readonly<{
  exitCode: number;
  stderr: string;
  stdout: string;
}>;

type CandidateOptions = Readonly<{
  discriminator?: string;
  frameUpdate?: string;
  id?: string;
  noveltyDelta?: string;
  operation?: string;
  premise?: string;
  prediction?: string;
  recipe?: string;
  seed?: string;
  status?: string;
  target?: string;
  thesis?: string;
  trace?: string;
}>;

const spawn = (arguments_: readonly string[], stdin?: string): RunResult => {
  const result = Bun.spawnSync({
    cmd: ["bun", script, ...arguments_],
    stderr: "pipe",
    stdin: stdin === undefined ? undefined : new Blob([stdin]),
    stdout: "pipe",
    timeout: 10_000,
  });

  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
};

const run = (...arguments_: string[]): RunResult => spawn(arguments_);

const fixture = (content: string): string => {
  const directory = mkdtempSync(join(tmpdir(), "novel-thesis-packet-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "thesis.md");
  writeFileSync(path, `${content.trim()}\n`);
  return path;
};

const candidate = (options: CandidateOptions = {}): string => `
## Candidate ${options.id ?? "C1"}

- Input problem/frame: Existing protein screens miss transient interactions.
- Generation recipe (optional): ${options.recipe ?? "representation change"}
- Seed provenance: ${options.seed ?? "OBSERVATION — cited endpoint/trace mismatch"}
- Transformation target: ${options.target ?? "REPRESENTATION"}
- Operation: ${options.operation ?? "SUBSTITUTE"}
- Premise challenged: ${options.premise ?? "NONE — grounded control"}
- Transformation trace: ${options.trace ?? "static endpoint state -> SUBSTITUTE with a time-indexed transition log -> recover transient relations"}
- Thesis claim: ${options.thesis ?? "Time-indexed interaction traces expose transient protein complexes absent from endpoint assays."}
- New testable prediction: ${options.prediction ?? "Trace reconstruction recovers a reproducible class of complexes absent from matched endpoint assays."}
- New discriminator: ${options.discriminator ?? "Under matched samples, the trace account predicts transient recovery while the endpoint account predicts no recovery."}
- Nearest prior / novelty delta: ${options.noveltyDelta ?? "Endpoint assays / adds reconstruction from time-indexed events."}
- Frame update flag: ${options.frameUpdate ?? "YES — the object changes from states to transitions."}
- Status: ${options.status ?? "CANDIDATE"}
`;

const validBatch = (): string => `
## Batch contract
- Requested candidate count: 3
- Grounded control candidate: C1
- Premise-breaking anti-default candidate: C2
- Collapse recovery: ${recoveryRule}

${candidate({ id: "C1" })}

${candidate({
  discriminator:
    "Under order-matched loads, the coupled account predicts sequence effects while the cumulative-load account predicts none.",
  id: "C2",
  operation: "COUPLE",
  premise: "Equal cumulative load implies equivalent degradation behavior.",
  prediction:
    "Permuting identical load events changes degradation when controller relaxation is coupled to the material.",
  recipe: "competing-account synthesis",
  seed: "CONSTRAINT — cumulative load is treated as sufficient",
  target: "RELATION",
  thesis:
    "Controller relaxation and material recovery jointly determine sequence-sensitive degradation.",
  trace:
    "independent controller and material states -> COUPLE their relaxation dynamics -> create order-sensitive degradation",
})}

${candidate({
  discriminator:
    "At equal mean porosity, the topology account predicts path-specific tails while the mean-field account predicts equivalence.",
  id: "C3",
  operation: "DECOMPOSE",
  premise: "Equal mean porosity implies equivalent transport topology.",
  prediction:
    "Electrodes with equal mean porosity but different path tails show different intermittent acceleration.",
  recipe: "constraint inversion",
  seed: "NEGATIVE-SPACE — endpoint images omit connectivity tails",
  target: "EVIDENCE",
  thesis:
    "Connectivity-tail evidence explains degradation differences hidden by equal mean porosity.",
  trace:
    "mean porosity summary -> DECOMPOSE into path connectivity and tail evidence -> expose intermittent transport bottlenecks",
})}
`;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("gate-check", () => {
  test("accepts a complete coordinate-bearing packet by path", () => {
    const result = run(fixture(candidate()));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("candidate packet: FAIL=0");
    expect(result.stderr).toBe("");
  });

  test("accepts the same packet from stdin", () => {
    const result = spawn(["-"], candidate());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("candidate packet: FAIL=0");
    expect(result.stderr).toBe("");
  });

  test("accepts a covered batch and emits its derived matrix", () => {
    const result = run(fixture(validBatch()));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("candidate batch: FAIL=0");
    expect(result.stdout).toContain("MATRIX  C1");
    expect(result.stdout).toContain("MATRIX  C2");
    expect(result.stdout).toContain("MATRIX  C3");
  });

  test("rejects a mechanically collapsed batch after checking every candidate", () => {
    const shared = {
      discriminator:
        "Under matched samples, the trace account predicts transient recovery while the endpoint account predicts no recovery.",
      operation: "SUBSTITUTE",
      target: "REPRESENTATION",
    };
    const result = run(
      fixture(`
## Batch contract
- Requested candidate count: 3
- Grounded control candidate: C1
- Anti-default EXEMPT: EXEMPT — the selected frame fixes all premises by a proved conservation constraint.
- Collapse recovery: ${recoveryRule}

${candidate({ ...shared, id: "C1" })}
${candidate({ ...shared, id: "C2" })}
${candidate({ ...shared, id: "C3" })}
`),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("C1/C12");
    expect(result.stdout).toContain("C2/C12");
    expect(result.stdout).toContain("C3/C12");
    expect(result.stdout).toContain("All candidates share one transformation target");
    expect(result.stdout).toContain("All candidates share one discriminator");
    expect(result.stdout).toContain("Coverage has 1 unique cells; minimum is 3");
  });

  test("rejects the demonstrated vague brainstorming false positive", () => {
    const result = run(
      fixture(
        candidate({
          discriminator: "Results will be different.",
          operation: "OTHER — BRAINSTORM",
          prediction: "Research results will improve.",
          recipe: "brainstorming",
          seed: "OTHER — FREE-FORM-BRAINSTORM",
          thesis:
            "A more innovative approach will produce stronger research results.",
          trace: "use a more innovative and holistic approach",
        }),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "Transformation trace contains only novelty adjectives",
    );
    expect(result.stdout).toContain(
      "New testable prediction states generic improvement",
    );
    expect(result.stdout).toContain(
      "New discriminator states only difference or improvement",
    );
  });

  test("rejects an unnamed OTHER coordinate", () => {
    const result = run(
      fixture(candidate({ seed: "OTHER" })),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "Seed provenance: OTHER must name the open-set value",
    );
  });

  test("rejects a bare seed-provenance label without a specific seed", () => {
    const result = run(fixture(candidate({ seed: "OBSERVATION" })));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "Seed provenance must name the specific seed or source",
    );
  });

  test("requires an attested Blind-spot packet row for a TACIT seed", () => {
    const invalid = run(
      fixture(candidate({ seed: "TACIT — plausible practitioner intuition" })),
    );
    const ownerOnly = run(
      fixture(
        candidate({
          seed:
            "TACIT — Blind-spot packet research/blind-spots.md, Probe P1, HUMAN:operator",
        }),
      ),
    );
    const emptyLocus = run(
      fixture(
        candidate({
          seed:
            "TACIT — Blind-spot packet research/blind-spots.md, Probe P1, HUMAN:operator@",
        }),
      ),
    );
    const valid = run(
      fixture(
        candidate({
          seed:
            "TACIT — Blind-spot packet research/blind-spots.md, Probe P1, HUMAN:operator@conversation:user-turn-7",
        }),
      ),
    );

    expect(invalid.exitCode).toBe(1);
    expect(invalid.stdout).toContain(
      "exactly HUMAN:<owner>@<attestation-locus>",
    );
    expect(ownerOnly.exitCode).toBe(1);
    expect(ownerOnly.stdout).toContain(
      "exactly HUMAN:<owner>@<attestation-locus>",
    );
    expect(emptyLocus.exitCode).toBe(1);
    expect(emptyLocus.stdout).toContain(
      "exactly HUMAN:<owner>@<attestation-locus>",
    );
    expect(valid.exitCode).toBe(0);
  });

  test("does not let a one-candidate file bypass its batch contract", () => {
    const result = run(
      fixture(`
## Batch contract
- Requested candidate count: 3
- Grounded control candidate: C1
- Premise-breaking anti-default candidate: C2
- Collapse recovery: ${recoveryRule}

${candidate({ id: "C1" })}
`),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "Batch returned 1 candidates for 3 requested",
    );
    expect(result.stdout).toContain("Anti-default candidate C2 not found");
  });

  test("rejects an old kill-and-withdrawal packet", () => {
    const result = run(
      fixture(`
制約を装った慣習: Assays must capture stable states.
転移した構造: Event sourcing → temporal reconstruction.
最も安い反証実験: Recovery below 10% kills the thesis.
撤退基準: Stop after two failed runs.
Why now: Sensors are cheaper.
Capital fit: One-quarter budget.
`),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Input problem/frame");
    expect(result.stdout).toContain("Seed provenance");
    expect(result.stdout).toContain("Status");
  });

  test("rejects a blank novelty delta", () => {
    const result = run(
      fixture(candidate({ noveltyDelta: "" })),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Nearest prior / novelty delta");
    expect(result.stdout).toContain("placeholder");
  });

  test("accepts explicit UNVERIFIED with a warning", () => {
    const result = run(
      fixture(
        candidate({
          noveltyDelta:
            "UNVERIFIED — nearest-prior search is still pending.",
        }),
      ),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("WARN");
    expect(result.stdout).toContain("UNVERIFIED");
  });

  test("rejects a non-candidate status", () => {
    const result = run(
      fixture(candidate({ status: "VALIDATED" })),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Status must be exactly CANDIDATE");
  });

  test("uses exit 2 for an unknown option", () => {
    const result = run("--unexpected");

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("unknown option '--unexpected'");
    expect(result.stdout).toBe("");
  });
});
