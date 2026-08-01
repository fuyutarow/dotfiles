import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../scripts/research-check.ts");
const temporaryDirectories: string[] = [];

type RunResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

const run = (arguments_: string[], stdin: string | undefined): RunResult => {
  const result = Bun.spawnSync({
    cmd: ["bun", script, ...arguments_],
    stderr: "pipe",
    stdin: stdin === undefined ? "ignore" : Buffer.from(stdin),
    stdout: "pipe",
    timeout: 10_000,
  });

  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
};

const validSpec = `# RESEARCH JUDGMENT SPEC

- Stage diagnosis: problem-underconstructed
- Blind-spot packet: locus=research/blind-spots.md; load-bearing premise=A1; open-set residual=OPEN; stop reason=no additional answer changes the frame
- Exploration allocation: Blind-spot packet=research/blind-spots.md; excavation=SBS Search budget; cross-frame probe cap=2 frames × 2 candidates
- Problem-frame slate: Frame A [CONTROL; slot=RELATION; holds premise A1; discriminator=order invariance]; Frame B [PREMISE-BREAK; slot=OBJECT; breaks premise A1; discriminator=unit split]; Frame C [ORTHOGONAL; slot=OBSERVATION; breaks premise A2; discriminator=proxy reversal]
- Selection axes: consequence=high; discriminability=one observation separates frames; feasibility=one-day probe; novelty=delta against nearest prior; bounded loss=one day of compute
- Cheap victory: improve the proxy while the held-out scientific claim remains false
- Optimize/trust firewall: optimize the development metric; trust only an untouched held-out witness
- Diversity-collapse rule: after semantic dedup/collapse, if premise, target, or discriminator is shared, send exactly one coverage-gap regeneration to forging-novel-theses; final stop after that pass
- Prediction-registry policy: write every prediction to research/prediction-ledger.md before observing its result
- Denominator policy: record and report every attempted candidate, run, and failure
- Independent-audit requirement: generator and auditor passes remain separate; evidence surface=frozen candidate packets; acceptance condition=reject unresolved provenance; actor assignment=orchestrating-agents
- Portfolio update: Bet A continues; Bet B is shelved pending a new instrument
- Reopen rule: an unexpected result may reopen the problem frame and update the diagnosed stage
`;

const fixture = (contents: string): string => {
  const directory = mkdtempSync(join(tmpdir(), "research-check-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "research-spec.md");
  writeFileSync(path, contents);
  return path;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("research-check", () => {
  test("accepts a structurally complete RESEARCH JUDGMENT SPEC from a path", () => {
    const result = run([fixture(validSpec)], undefined);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("FAIL=0");
    expect(result.stdout).toContain("Stage diagnosis");
    expect(result.stderr).toBe("");
  });

  test("accepts the same spec on stdin", () => {
    const result = run(["-"], validSpec);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("FAIL=0");
    expect(result.stderr).toBe("");
  });

  test("does not mistake a timestamped per-test threshold for registry policy", () => {
    const invalid = validSpec.replace(
      "write every prediction to research/prediction-ledger.md before observing its result",
      "2026-07-30 09:00; kill when p < 0.05",
    );
    const result = run([fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("registry/ledger locus");
    expect(result.stdout).toContain("before/prior rule");
  });

  test("rejects collapsing the selection axes into one scalar product", () => {
    const invalid = validSpec.replace(
      "consequence=high; discriminability=one observation separates frames; feasibility=one-day probe; novelty=delta against nearest prior; bounded loss=one day of compute",
      "score = consequence × discriminability × feasibility × novelty × bounded loss",
    );
    const result = run([fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("scalar product");
  });

  test("requires bounded loss as a separate selection axis", () => {
    const invalid = validSpec.replace(
      "; bounded loss=one day of compute",
      "",
    );
    const result = run([fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("bounded loss");
  });

  test("makes every other required mechanism fire on a bad value", () => {
    const invalidCases = [
      {
        from: "problem-underconstructed",
        to: "idea-generation",
        finding: "stage must identify",
      },
      {
        from: "locus=research/blind-spots.md; load-bearing premise=A1; open-set residual=OPEN; stop reason=no additional answer changes the frame",
        to: "locus=research/blind-spots.md; load-bearing premise=A1",
        finding: "open-set residual",
      },
      {
        from: "Blind-spot packet=research/blind-spots.md; excavation=SBS Search budget; cross-frame probe cap=2 frames × 2 candidates",
        to: "breadth sweep=OBJECT through OPEN once; depth allocation=2 premises; decision-sensitive stop=no new relation",
        finding: "duplicates SBS-owned",
      },
      {
        from: "Frame A [CONTROL; slot=RELATION; holds premise A1; discriminator=order invariance]; Frame B [PREMISE-BREAK; slot=OBJECT; breaks premise A1; discriminator=unit split]; Frame C [ORTHOGONAL; slot=OBSERVATION; breaks premise A2; discriminator=proxy reversal]",
        to: "Frame A [CONTROL; slot=RELATION; holds premise A1; discriminator=order invariance]; Frame B [PREMISE-BREAK; slot=OBJECT; breaks premise A1; discriminator=unit split]",
        finding: "functional roles",
      },
      {
        from: "improve the proxy while the held-out scientific claim remains false",
        to: "TBD",
        finding: "blank or a placeholder",
      },
      {
        from: "optimize the development metric; trust only an untouched held-out witness",
        to: "optimize the development metric using all available observations",
        finding: "held-out witness",
      },
      {
        from: "after semantic dedup/collapse, if premise, target, or discriminator is shared, send exactly one coverage-gap regeneration to forging-novel-theses; final stop after that pass",
        to: "after semantic dedup, generate more ideas",
        finding: "collapsed dimension",
      },
      {
        from: "record and report every attempted candidate, run, and failure",
        to: "TBD",
        finding: "blank or a placeholder",
      },
      {
        from: "generator and auditor passes remain separate; evidence surface=frozen candidate packets; acceptance condition=reject unresolved provenance; actor assignment=orchestrating-agents",
        to: "generator=Alice; auditor=Bob; independent review",
        finding: "evidence surface",
      },
      {
        from: "Bet A continues; Bet B is shelved pending a new instrument",
        to: "Bet A continues",
        finding: ">=2 bets",
      },
      {
        from: "an unexpected result may reopen the problem frame and update the diagnosed stage",
        to: "an unexpected result leaves the problem frame and stage unchanged",
        finding: "unexpected result update",
      },
    ];

    for (const invalidCase of invalidCases) {
      const result = run(
        [fixture(validSpec.replace(invalidCase.from, invalidCase.to))],
        undefined,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(invalidCase.finding);
    }
  });

  test("accepts an explicit handoff when the portfolio has one selected bet", () => {
    const handoff = validSpec.replace(
      "Bet A continues; Bet B is shelved pending a new instrument",
      "single-bet handoff: send the expensive load-bearing one selected bet to acting-on-hypotheses",
    );
    const result = run([fixture(handoff)], undefined);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("single-bet handoff");
  });

  test("does not mistake indifferent for an independent auditor", () => {
    const invalid = validSpec.replace(
      "generator and auditor passes remain separate; evidence surface=frozen candidate packets; acceptance condition=reject unresolved provenance; actor assignment=orchestrating-agents",
      "generator=Alice; auditor=Alice; indifferent review in the same context",
    );
    const result = run([fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("required separation");
  });

  test("rejects three synonymous robustness frames without functional roles", () => {
    const invalid = validSpec.replace(
      "Frame A [CONTROL; slot=RELATION; holds premise A1; discriminator=order invariance]; Frame B [PREMISE-BREAK; slot=OBJECT; breaks premise A1; discriminator=unit split]; Frame C [ORTHOGONAL; slot=OBSERVATION; breaks premise A2; discriminator=proxy reversal]",
      "Frame A — improve robustness; Frame B — make the method more robust; Frame C — increase system robustness",
    );
    const result = run([fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("functional roles");
  });

  test("accepts an honest frame coverage gap with an impossibility witness", () => {
    const constrained = validSpec.replace(
      "Frame C [ORTHOGONAL; slot=OBSERVATION; breaks premise A2; discriminator=proxy reversal]",
      "ORTHOGONAL COVERAGE GAP [attempted transformation=change OBSERVATION; fixed constraint=formal invariant fixes the only admissible observation; illegitimate=an invented third observation would be invalid]",
    );
    const result = run([fixture(constrained)], undefined);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("FAIL=0");
  });

  test("rejects a vague frame coverage-gap escape hatch", () => {
    const invalid = validSpec.replace(
      "Frame C [ORTHOGONAL; slot=OBSERVATION; breaks premise A2; discriminator=proxy reversal]",
      "ORTHOGONAL COVERAGE GAP [could not think of one]",
    );
    const result = run([fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("attempted transformation");
  });

  test("rejects an ungated cheap one-bet handoff to acting-on-hypotheses", () => {
    const invalid = validSpec.replace(
      "Bet A continues; Bet B is shelved pending a new instrument",
      "single-bet handoff: send the cheap reversible probe to acting-on-hypotheses",
    );
    const result = run([fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(">=2 bets");
  });

  test("returns exit 2 for CLI misuse", () => {
    const result = run(["--unknown"], undefined);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("unknown option");
  });
});
