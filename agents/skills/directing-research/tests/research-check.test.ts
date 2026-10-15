import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../scripts/research-check.ts");
const temporaryDirectories: string[] = [];

type RunResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

const run = async (
  arguments_: string[],
  stdin: string | undefined,
): Promise<RunResult> => {
  const result = Bun.spawn({
    cmd: ["bun", script, ...arguments_],
    stderr: "pipe",
    stdin: stdin === undefined ? "ignore" : Buffer.from(stdin),
    stdout: "pipe",
    signal: AbortSignal.timeout(10_000),
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    result.exited,
    new Response(result.stderr).text(),
    new Response(result.stdout).text(),
  ]);

  return {
    exitCode,
    stderr,
    stdout,
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

## TRANSFER DISPOSITION
- Transfer bundle: NONE — no transfer route was admitted in this judgment
`;

const donorSet = `
# DONOR SET

- Transfer search question: Which source relations preserve recoverability after aggregation?
- Coverage contract: bounded comparison of two supplied source units; no completeness claim
- Selection rule: select relations and constraints, not surface names, vocabulary, or distance

## Donor records

| Donor ID | Source / locator | Source domain | Source scope | Roles / entities | Relation | Preconditions | Observable consequence | Boundary / failure |
|---|---|---|---|---|---|---|---|---|
| D1 | doi:10.1000/example-a, p. 4 | event histories | retained ordered histories | event; log; replay | replay preserves recoverable order before aggregation | ordered events remain available | distinct histories remain reconstructable | compaction destroys order |
| D2 | reports/control.md:18 | dynamical systems | observable systems | state; observation; smoother | smoothing recovers state relations from ordered observations | dynamics are specified and observable | latent trajectories remain distinguishable | unobservable modes collapse |

## Comparison

- Common relational schema: preserving ordered intermediate relations permits recovery that endpoint aggregation destroys
- Non-common structure: D1 assumes discrete lossless events; D2 permits noisy continuous observations
- Retrieval-only cues: shared words located candidates but do not warrant transfer
- Single-donor limit: NONE — two distinct donor evidence units were compared

## Knowledge state

- Known: both source units state a bounded recoverability relation
- Uncertain: whether that relation survives outside their stated scopes
- Disputed: none found in the bounded corpus
- Missing: target correspondence and target-side evidence

## Handoff

- Handoff: forging-novel-theses — donor IDs D1,D2; no target mapping, no target prediction, no thesis, and no target test verdict
`;

const transferBundle = (path: string, digest: string): string => `
## Candidate C1

- Input problem/frame: Endpoint aggregation hides order-dependent target histories.
- Generation recipe (optional): structural transfer
- Seed provenance: ANALOGY — frozen DONOR SET D1,D2 with source-located relations
- Transformation target: RELATION
- Operation: transfer — ordered recovery relation
- Transfer attempt ID: T1
- Donor set: path=${path}; sha256=${digest}
- Donor IDs: D1, D2
- Source comparison: compared D1 and D2 to extract a common relation while rejecting surface labels
- Source relation / locator: ordered intermediate relations preserve recoverability; D1:doi:10.1000/example-a, p. 4; D2:reports/control.md:18
- Target relation before transfer: target endpoints aggregate transitions before reconstruction
- Correspondence map: source event=target transition; source replay=target reconstruction; source order=target temporal order
- Preserved relation: recoverability depends on retaining ordered intermediate relations before aggregation
- Non-correspondence: source events are discrete and lossless while target observations are noisy and partially observed
- Transfer boundary: mapping breaks when target transition order is unidentifiable or order-invariant
- Precision loss: exact source replay becomes probabilistic target reconstruction
- Target-side evidence: UNTESTED
- Target-side counterexample: distinct target event orders yield indistinguishable reconstructions under matched endpoints
- Premise challenged: Endpoint state is sufficient for target reconstruction.
- Transformation trace: endpoint aggregation -> TRANSFER ordered recovery relation -> target transition reconstruction
- Thesis claim: Ordered target traces recover histories that matched endpoint summaries cannot identify.
- New testable prediction: Matched endpoints with different transition order produce different recoverable target histories.
- New discriminator: The transfer account predicts order-dependent recovery whereas the endpoint account predicts equivalence.
- Nearest prior / novelty delta: UNVERIFIED — nearest-prior search remains pending before selection.
- Frame update flag: YES — the explanatory object changes from endpoints to ordered transitions.
- Status: CANDIDATE

## MAPPING-BREAK T2

- Transfer attempt ID: T2
- Input problem/frame: Endpoint aggregation hides order-dependent target histories.
- Donor set: path=${path}; sha256=${digest}
- Donor IDs: D1
- Source comparison: SINGLE-DONOR LIMIT — hypothesis seed only; no abstract schema established; no target transport established
- Source relation / locator: replay restores a prior ordered state; D1:doi:10.1000/example-a, p. 4
- Target relation before transfer: target observations are irreversible aggregate summaries
- Attempted correspondence: source replay=target recovery; source prior state=target pre-aggregation state
- Non-correspondence axis: RELATION — the target has no inverse transition that identifies a prior state
- Failed invariant: recovery requires an invertible transition but target aggregation is many-to-one
- Transfer boundary: mapping breaks when every admissible target observation remains non-invertible
- Evidence / locator: target mismatch at research/target-frame.md:27 and source relation at doi:10.1000/example-a, p. 4
- Handoff: directing-research — preserve T2 in the TRANSFER DISPOSITION denominator
- Status: MAPPING-BREAK
`;

const mappingBreak = (id: string, path: string, digest: string): string => `
## MAPPING-BREAK ${id}

- Transfer attempt ID: ${id}
- Input problem/frame: Endpoint aggregation hides order-dependent target histories.
- Donor set: path=${path}; sha256=${digest}
- Donor IDs: D1
- Source comparison: SINGLE-DONOR LIMIT — hypothesis seed only; no abstract schema established; no target transport established
- Source relation / locator: replay restores a prior ordered state; D1:doi:10.1000/example-a, p. 4
- Target relation before transfer: target observations are irreversible aggregate summaries
- Attempted correspondence: source replay=target recovery; source prior state=target pre-aggregation state
- Non-correspondence axis: RELATION — the target has no inverse transition that identifies a prior state
- Failed invariant: recovery requires an invertible transition but target aggregation is many-to-one
- Transfer boundary: mapping breaks when every admissible target observation remains non-invertible
- Evidence / locator: target mismatch at research/target-frame.md:27 and source relation at doi:10.1000/example-a, p. 4
- Handoff: directing-research — preserve ${id} in the TRANSFER DISPOSITION denominator
- Status: MAPPING-BREAK
`;

const fixture = async (contents: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "research-check-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "research-spec.md");
  await writeFile(path, contents);
  return path;
};

const sha256 = async (path: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

const frozenTransferFixture = async (): Promise<
  Readonly<{
    donorPath: string;
    transferPath: string;
  }>
> => {
  const donorPath = await fixture(donorSet);
  const transferPath = await fixture(
    transferBundle(donorPath, await sha256(donorPath)),
  );
  return { donorPath, transferPath };
};

const activeArguments = (
  donorPath: string,
  transferPath: string,
  specPath: string,
): string[] => [
  "--donor-set",
  donorPath,
  "--transfer-bundle",
  transferPath,
  specPath,
];

const activeTransferSpec = (digest: string, bundlePath: string): string =>
  validSpec.replace(
    "- Transfer bundle: NONE — no transfer route was admitted in this judgment",
    `- Transfer bundle: path=${bundlePath}; sha256=${digest}
- Attempt denominator: T1, T2
- Candidate disposition: T1=TEST
- Preserved MAPPING-BREAK IDs: T2
- Basis / scope: admit only T1 for a bounded target-side contrast; T2 remains a failed mapping attempt
- Target-side test or result locus: UNTESTED — prediction registry=research/predictions.md; handoff=domain/plain executor
- Integration / retirement action: keep T1 at CANDIDATE and preserve T2; no adoption before target evidence
- Reopen trigger: reopen the donor search or target frame if the registered target contrast is non-discriminating`,
  );

const targetResult = (
  transferPath: string,
  transferDigest: string,
  candidateId = "T1",
): string => `## TARGET RESULT

- Candidate ID: ${candidateId}
- Transfer bundle: path=${transferPath}; sha256=${transferDigest}
- Target-side observation: matched endpoint states with different transition order produced distinct recoverable histories
- Prewritten threshold: PASS when at least 8 of 10 held-out histories are distinguished before inspecting target outcomes
- Observation locus: research/results/target-run.json:42
- Threshold result: PASS — 9 of 10 held-out histories were distinguished
- Mapping assessment request: NONE — the bounded correspondence remains testable
- Handoff: directing-research — update TRANSFER DISPOSITION; preserve all existing MAPPING-BREAK IDs
`;

const adoptTransferSpec = (
  bundleDigest: string,
  bundlePath: string,
  resultDigest: string,
  resultPath: string,
): string =>
  activeTransferSpec(bundleDigest, bundlePath)
    .replace(
      "- Candidate disposition: T1=TEST",
      "- Candidate disposition: T1=ADOPT",
    )
    .replace(
      "- Target-side test or result locus: UNTESTED — prediction registry=research/predictions.md; handoff=domain/plain executor",
      `- Target-side test or result locus: TARGET RESULT — path=${resultPath}; sha256=${resultDigest}`,
    )
    .replace(
      "- Integration / retirement action: keep T1 at CANDIDATE and preserve T2; no adoption before target evidence",
      "- Integration / retirement action: integrate T1 within the tested target scope and preserve T2",
    );

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("research-check", () => {
  test("accepts a structurally complete RESEARCH JUDGMENT SPEC from a path", async () => {
    const result = await run([await fixture(validSpec)], undefined);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("FAIL=0");
    expect(result.stdout).toContain("Stage diagnosis");
    expect(result.stderr).toBe("");
  });

  test("accepts the same spec on stdin", async () => {
    const result = await run(["-"], validSpec);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("FAIL=0");
    expect(result.stderr).toBe("");
  });

  test("does not mistake a timestamped per-test threshold for registry policy", async () => {
    const invalid = validSpec.replace(
      "write every prediction to research/prediction-ledger.md before observing its result",
      "2026-07-30 09:00; kill when p < 0.05",
    );
    const result = await run([await fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("registry/ledger locus");
    expect(result.stdout).toContain("before/prior rule");
  });

  test("rejects collapsing the selection axes into one scalar product", async () => {
    const invalid = validSpec.replace(
      "consequence=high; discriminability=one observation separates frames; feasibility=one-day probe; novelty=delta against nearest prior; bounded loss=one day of compute",
      "score = consequence × discriminability × feasibility × novelty × bounded loss",
    );
    const result = await run([await fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("scalar product");
  });

  test("requires bounded loss as a separate selection axis", async () => {
    const invalid = validSpec.replace("; bounded loss=one day of compute", "");
    const result = await run([await fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("bounded loss");
  });

  test("makes every other required mechanism fire on a bad value", async () => {
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
      const result = await run(
        [await fixture(validSpec.replace(invalidCase.from, invalidCase.to))],
        undefined,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(invalidCase.finding);
    }
  }, 30_000);

  test("accepts an explicit handoff when the portfolio has one selected bet", async () => {
    const handoff = validSpec.replace(
      "Bet A continues; Bet B is shelved pending a new instrument",
      "single-bet handoff: send the expensive load-bearing one selected bet to acting-on-hypotheses",
    );
    const result = await run([await fixture(handoff)], undefined);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("single-bet handoff");
  });

  test("does not mistake indifferent for an independent auditor", async () => {
    const invalid = validSpec.replace(
      "generator and auditor passes remain separate; evidence surface=frozen candidate packets; acceptance condition=reject unresolved provenance; actor assignment=orchestrating-agents",
      "generator=Alice; auditor=Alice; indifferent review in the same context",
    );
    const result = await run([await fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("required separation");
  });

  test("rejects three synonymous robustness frames without functional roles", async () => {
    const invalid = validSpec.replace(
      "Frame A [CONTROL; slot=RELATION; holds premise A1; discriminator=order invariance]; Frame B [PREMISE-BREAK; slot=OBJECT; breaks premise A1; discriminator=unit split]; Frame C [ORTHOGONAL; slot=OBSERVATION; breaks premise A2; discriminator=proxy reversal]",
      "Frame A — improve robustness; Frame B — make the method more robust; Frame C — increase system robustness",
    );
    const result = await run([await fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("functional roles");
  });

  test("accepts an honest frame coverage gap with an impossibility witness", async () => {
    const constrained = validSpec.replace(
      "Frame C [ORTHOGONAL; slot=OBSERVATION; breaks premise A2; discriminator=proxy reversal]",
      "ORTHOGONAL COVERAGE GAP [attempted transformation=change OBSERVATION; fixed constraint=formal invariant fixes the only admissible observation; illegitimate=an invented third observation would be invalid]",
    );
    const result = await run([await fixture(constrained)], undefined);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("FAIL=0");
  });

  test("rejects a vague frame coverage-gap escape hatch", async () => {
    const invalid = validSpec.replace(
      "Frame C [ORTHOGONAL; slot=OBSERVATION; breaks premise A2; discriminator=proxy reversal]",
      "ORTHOGONAL COVERAGE GAP [could not think of one]",
    );
    const result = await run([await fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("attempted transformation");
  });

  test("rejects an ungated cheap one-bet handoff to acting-on-hypotheses", async () => {
    const invalid = validSpec.replace(
      "Bet A continues; Bet B is shelved pending a new instrument",
      "single-bet handoff: send the cheap reversible probe to acting-on-hypotheses",
    );
    const result = await run([await fixture(invalid)], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(">=2 bets");
  });

  test("uses Cleye's strict unknown-flag failure", async () => {
    const result = await run(["--unknown"], undefined);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown flag: --unknown");
  });

  test("accepts a transfer TEST disposition while preserving every MAPPING-BREAK", async () => {
    const { donorPath, transferPath } = await frozenTransferFixture();
    const specPath = await fixture(
      activeTransferSpec(await sha256(transferPath), transferPath),
    );
    const result = await run(
      activeArguments(donorPath, transferPath, specPath),
      undefined,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("TRANSFER DISPOSITION");
    expect(result.stdout).toContain("attempts=2");
    expect(result.stdout).toContain("mapping-breaks=1");
  });

  test("rejects an unaccounted MAPPING-BREAK from the frozen bundle", async () => {
    const { donorPath, transferPath } = await frozenTransferFixture();
    const spec = activeTransferSpec(
      await sha256(transferPath),
      transferPath,
    ).replace("T1, T2", "T1");
    const result = await run(
      activeArguments(donorPath, transferPath, await fixture(spec)),
      undefined,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "transfer disposition omits bundle attempt T2 (MAPPING-BREAK)",
    );
  });

  test("rejects a transfer bundle whose digest differs from the frozen spec", async () => {
    const { donorPath, transferPath } = await frozenTransferFixture();
    const spec = activeTransferSpec("f".repeat(64), transferPath);
    const result = await run(
      activeArguments(donorPath, transferPath, await fixture(spec)),
      undefined,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("transfer bundle SHA-256 does not match");
  });

  test("rejects a declared transfer-bundle path that differs from the verified input", async () => {
    const { donorPath, transferPath } = await frozenTransferFixture();
    const spec = activeTransferSpec(
      await sha256(transferPath),
      "research/a-different-transfer-bundle.md",
    );
    const result = await run(
      activeArguments(donorPath, transferPath, await fixture(spec)),
      undefined,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "Transfer bundle path does not match --transfer-bundle",
    );
  });

  test("accepts a transfer-bundle symlink to the declared frozen artifact", async () => {
    const { donorPath, transferPath } = await frozenTransferFixture();
    const bundleSymlink = `${transferPath}.symlink`;
    await symlink(transferPath, bundleSymlink);
    const spec = activeTransferSpec(await sha256(transferPath), transferPath);
    const result = await run(
      activeArguments(donorPath, bundleSymlink, await fixture(spec)),
      undefined,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("TRANSFER DISPOSITION attempts=2");
  });

  test("rejects ADOPT when the only stated support is donor-side success", async () => {
    const { donorPath, transferPath } = await frozenTransferFixture();
    const spec = activeTransferSpec(await sha256(transferPath), transferPath)
      .replace("T1=TEST", "T1=ADOPT")
      .replace(
        "UNTESTED — prediction registry=research/predictions.md; handoff=domain/plain executor",
        "SOURCE RESULT — both donor systems succeeded",
      );
    const result = await run(
      activeArguments(donorPath, transferPath, await fixture(spec)),
      undefined,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("ADOPT or RETIRE requires TARGET RESULT");
  });

  test("freezes and validates TARGET RESULT before ADOPT", async () => {
    const { donorPath, transferPath } = await frozenTransferFixture();
    const transferDigest = await sha256(transferPath);
    const resultPath = await fixture(
      targetResult(transferPath, transferDigest),
    );
    const specPath = await fixture(
      adoptTransferSpec(
        transferDigest,
        transferPath,
        await sha256(resultPath),
        resultPath,
      ),
    );
    const withoutResultFlag = await run(
      activeArguments(donorPath, transferPath, specPath),
      undefined,
    );
    const valid = await run(
      [
        "--donor-set",
        donorPath,
        "--transfer-bundle",
        transferPath,
        "--target-result",
        resultPath,
        specPath,
      ],
      undefined,
    );
    const wrongCandidatePath = await fixture(
      targetResult(transferPath, transferDigest, "T404"),
    );
    const wrongCandidateSpec = await fixture(
      adoptTransferSpec(
        await sha256(transferPath),
        transferPath,
        await sha256(wrongCandidatePath),
        wrongCandidatePath,
      ),
    );
    const wrongCandidate = await run(
      [
        "--donor-set",
        donorPath,
        "--transfer-bundle",
        transferPath,
        "--target-result",
        wrongCandidatePath,
        wrongCandidateSpec,
      ],
      undefined,
    );
    const missingThresholds = await Promise.all(
      ["##", "###", "####", "######"].map(async (heading) => {
        const missingThresholdPath = await fixture(
          `${targetResult(transferPath, transferDigest).replace(
            /^- Prewritten threshold:.*$/mu,
            "",
          )}\n${heading} Notes\n- Prewritten threshold: PASS if this later note is borrowed`,
        );
        const missingThresholdSpec = await fixture(
          adoptTransferSpec(
            transferDigest,
            transferPath,
            await sha256(missingThresholdPath),
            missingThresholdPath,
          ),
        );
        return run(
          [
            "--donor-set",
            donorPath,
            "--transfer-bundle",
            transferPath,
            "--target-result",
            missingThresholdPath,
            missingThresholdSpec,
          ],
          undefined,
        );
      }),
    );
    const wrongDigestSpec = await fixture(
      adoptTransferSpec(
        await sha256(transferPath),
        transferPath,
        "f".repeat(64),
        resultPath,
      ),
    );
    const wrongDigest = await run(
      [
        "--donor-set",
        donorPath,
        "--transfer-bundle",
        transferPath,
        "--target-result",
        resultPath,
        wrongDigestSpec,
      ],
      undefined,
    );

    expect(withoutResultFlag.exitCode).toBe(1);
    expect(withoutResultFlag.stdout).toContain(
      "requires --target-result <path>",
    );
    expect(valid.exitCode).toBe(0);
    expect(valid.stdout).toContain("frozen TARGET RESULT verified");
    expect(wrongCandidate.exitCode).toBe(1);
    expect(wrongCandidate.stdout).toContain(
      "TARGET RESULT candidate T404 is absent from the frozen transfer bundle",
    );
    for (const missingThreshold of missingThresholds) {
      expect(missingThreshold.exitCode).toBe(1);
      expect(missingThreshold.stdout).toContain(
        "Prewritten threshold: required in TARGET RESULT",
      );
    }
    expect(wrongDigest.exitCode).toBe(1);
    expect(wrongDigest.stdout).toContain(
      "TARGET RESULT SHA-256 does not match",
    );
  }, 30_000);

  test("rejects rebound, donor-side, vague, destructive, or failed TARGET RESULT evidence before ADOPT", async () => {
    const { donorPath, transferPath } = await frozenTransferFixture();
    const transferDigest = await sha256(transferPath);
    const base = targetResult(transferPath, transferDigest);
    const otherTransferPath = await fixture(
      transferBundle(donorPath, await sha256(donorPath)).replace(
        "Endpoint aggregation hides order-dependent target histories.",
        "Endpoint aggregation hides a different order-dependent target history.",
      ),
    );
    const cases = [
      {
        artifact: targetResult(
          otherTransferPath,
          await sha256(otherTransferPath),
        ),
        finding: "TARGET RESULT transfer bundle path does not match",
      },
      {
        artifact: base
          .replace(
            "matched endpoint states with different transition order produced distinct recoverable histories",
            "both donor systems succeeded",
          )
          .replace(
            "research/results/target-run.json:42",
            "doi:10.1000/example-a, p. 4",
          ),
        finding: "reuses a frozen donor source locator",
      },
      {
        artifact: base.replace(
          "matched endpoint states with different transition order produced distinct recoverable histories",
          "target-side confirmation says both donor systems succeeded",
        ),
        finding:
          "Target-side observation cannot substitute donor/source success",
      },
      {
        artifact: base.replace(
          "matched endpoint states with different transition order produced distinct recoverable histories",
          "target-side confirmation says D1 and D2 succeeded",
        ),
        finding: "Target-side observation mentions frozen donor ID D1",
      },
      {
        artifact: base.replace(
          "research/results/target-run.json:42",
          "doi:10.1000/example-a, p. 5",
        ),
        finding: "reuses frozen donor source identity",
      },
      {
        artifact: base.replace(
          /^- Prewritten threshold:.*$/mu,
          "- Prewritten threshold: yes",
        ),
        finding: "Prewritten threshold must name",
      },
      {
        artifact: base.replace(
          /^- Prewritten threshold:.*$/mu,
          "- Prewritten threshold: PASS if 0 of 0 outcomes are distinguished before target observation",
        ),
        finding: "Prewritten threshold ratio needs a positive denominator",
      },
      {
        artifact: base.replace(
          "- Threshold result: PASS — 9 of 10 held-out histories were distinguished",
          "- Threshold result: FAIL — 0 of 10 held-out histories were distinguished",
        ),
        finding: "ADOPT requires a PASS TARGET RESULT",
      },
      {
        artifact: base.replace(
          "- Threshold result: PASS — 9 of 10 held-out histories were distinguished",
          "- Threshold result: PASS — 1 of 10 held-out histories was distinguished",
        ),
        finding: "Threshold result contradicts the prewritten numeric boundary",
      },
      {
        artifact: base.replace(
          "preserve all existing MAPPING-BREAK IDs",
          "discard every MAPPING-BREAK ID",
        ),
        finding: "preserve all existing MAPPING-BREAK IDs",
      },
      {
        artifact: base.replace(
          "preserve all existing MAPPING-BREAK IDs",
          "do not preserve all existing MAPPING-BREAK IDs",
        ),
        finding: "preserve all existing MAPPING-BREAK IDs",
      },
      {
        artifact: base.replace(
          "NONE — the bounded correspondence remains testable",
          "forging-novel-theses — reassess whether the preserved relation still maps",
        ),
        finding: "ADOPT requires Mapping assessment request: NONE",
      },
    ] as const;

    for (const invalidCase of cases) {
      const resultPath = await fixture(invalidCase.artifact);
      const specPath = await fixture(
        adoptTransferSpec(
          transferDigest,
          transferPath,
          await sha256(resultPath),
          resultPath,
        ),
      );
      const result = await run(
        [
          "--donor-set",
          donorPath,
          "--transfer-bundle",
          transferPath,
          "--target-result",
          resultPath,
          specPath,
        ],
        undefined,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(invalidCase.finding);
    }
  }, 90_000);

  test("RETIRE preserves PASS or FAIL evidence while requiring a tested boundary", async () => {
    const { donorPath, transferPath } = await frozenTransferFixture();
    const transferDigest = await sha256(transferPath);
    const passResultPath = await fixture(
      targetResult(transferPath, transferDigest),
    );
    const failResultPath = await fixture(
      targetResult(transferPath, transferDigest).replace(
        "- Threshold result: PASS — 9 of 10 held-out histories were distinguished",
        "- Threshold result: FAIL — 0 of 10 held-out histories were distinguished",
      ),
    );
    const retireSpec = async (resultPath: string): Promise<string> =>
      adoptTransferSpec(
        transferDigest,
        transferPath,
        await sha256(resultPath),
        resultPath,
      )
        .replace("T1=ADOPT", "T1=RETIRE")
        .replace(
          "integrate T1 within the tested target scope and preserve T2",
          "retire the tested T1 mapping family outside its bounded target scope and preserve T2",
        );
    const runRetire = async (
      resultPath: string,
      spec: string,
    ): Promise<RunResult> =>
      run(
        [
          "--donor-set",
          donorPath,
          "--transfer-bundle",
          transferPath,
          "--target-result",
          resultPath,
          await fixture(spec),
        ],
        undefined,
      );

    const pass = await runRetire(
      passResultPath,
      await retireSpec(passResultPath),
    );
    const fail = await runRetire(
      failResultPath,
      await retireSpec(failResultPath),
    );
    const unbounded = await runRetire(
      passResultPath,
      (await retireSpec(passResultPath)).replace(
        "retire the tested T1 mapping family outside its bounded target scope and preserve T2",
        "retire T1 and preserve T2",
      ),
    );

    expect(pass.exitCode).toBe(0);
    expect(fail.exitCode).toBe(0);
    expect(unbounded.exitCode).toBe(1);
    expect(unbounded.stdout).toContain(
      "RETIRE must name the tested mapping family or transfer boundary",
    );
  }, 30_000);

  test("treats a missing TARGET RESULT dependency as fatal", async () => {
    const { donorPath, transferPath } = await frozenTransferFixture();
    const missingPath = "/definitely/missing/target-result.md";
    const specPath = await fixture(
      adoptTransferSpec(
        await sha256(transferPath),
        transferPath,
        "a".repeat(64),
        missingPath,
      ),
    );
    const result = await run(
      [
        "--donor-set",
        donorPath,
        "--transfer-bundle",
        transferPath,
        "--target-result",
        missingPath,
        specPath,
      ],
      undefined,
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("FATAL: target result not found");
  });

  test("accepts REOPEN when all transfer attempts end as MAPPING-BREAK", async () => {
    const donorPath = await fixture(donorSet);
    const donorDigest = await sha256(donorPath);
    const transferPath = await fixture(
      `${mappingBreak("T1", donorPath, donorDigest)}\n${mappingBreak("T2", donorPath, donorDigest)}`,
    );
    const spec = activeTransferSpec(await sha256(transferPath), transferPath)
      .replace("T1=TEST", "NONE — no candidate generated")
      .replace(
        "- Preserved MAPPING-BREAK IDs: T2",
        "- Preserved MAPPING-BREAK IDs: T1, T2",
      )
      .replace(
        "UNTESTED — prediction registry=research/predictions.md; handoff=domain/plain executor",
        "NONE — no target-side test because every correspondence attempt broke",
      )
      .replace(
        "keep T1 at CANDIDATE and preserve T2; no adoption before target evidence",
        "REOPEN — preserve both mapping breaks and revise the donor relation or target constraints",
      );
    const result = await run(
      activeArguments(donorPath, transferPath, await fixture(spec)),
      undefined,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "all attempts ended MAPPING-BREAK; REOPEN is explicit",
    );
  });

  test("rejects an incomplete transfer bundle that prior disposition checks accepted", async () => {
    const donorPath = await fixture(donorSet);
    const transferPath = await fixture(`
## Candidate C1
- Operation: TRANSFER
- Transfer attempt ID: T1
- New testable prediction: Ordered target traces recover histories.
- New discriminator: The target account differs from the endpoint account.
- Status: CANDIDATE

## MAPPING-BREAK T2
- Transfer attempt ID: T2
- Non-correspondence axis: RELATION — no inverse transition.
- Status: MAPPING-BREAK
`);
    const spec = activeTransferSpec(await sha256(transferPath), transferPath);
    const result = await run(
      activeArguments(donorPath, transferPath, await fixture(spec)),
      undefined,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "frozen transfer bundle failed forging-novel-theses gate-check",
    );
  });

  test("requires --donor-set for an active TRANSFER DISPOSITION", async () => {
    const { transferPath } = await frozenTransferFixture();
    const spec = activeTransferSpec(await sha256(transferPath), transferPath);
    const result = await run(
      ["--transfer-bundle", transferPath, await fixture(spec)],
      undefined,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("requires --donor-set");
  });

  test("propagates a missing donor dependency as FATAL", async () => {
    const { transferPath } = await frozenTransferFixture();
    const spec = activeTransferSpec(await sha256(transferPath), transferPath);
    const missingDonor = join(tmpdir(), "research-check-missing-donor-set.md");
    const result = await run(
      activeArguments(missingDonor, transferPath, await fixture(spec)),
      undefined,
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("DONOR SET not found");
  });

  test("propagates a missing transfer-bundle dependency as FATAL", async () => {
    const donorPath = await fixture(donorSet);
    const missingTransfer = `${await fixture("placeholder")}.missing`;
    const spec = activeTransferSpec("a".repeat(64), missingTransfer);
    const result = await run(
      activeArguments(donorPath, missingTransfer, await fixture(spec)),
      undefined,
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("transfer bundle not found");
  });

  test("fails closed on a duplicate transfer field", async () => {
    const donorPath = await fixture(donorSet);
    const donorDigest = await sha256(donorPath);
    const transferPath = await fixture(
      transferBundle(donorPath, donorDigest).replace(
        "- Operation: transfer — ordered recovery relation",
        "- Operation: transfer — ordered recovery relation\n- Operation: TRANSFER",
      ),
    );
    const spec = activeTransferSpec(await sha256(transferPath), transferPath);
    const result = await run(
      activeArguments(donorPath, transferPath, await fixture(spec)),
      undefined,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("duplicate field Operation");
  });

  test("fails closed on a duplicate TRANSFER DISPOSITION section", async () => {
    const { donorPath, transferPath } = await frozenTransferFixture();
    const spec = `${activeTransferSpec(await sha256(transferPath), transferPath)}
## TRANSFER DISPOSITION
- Transfer bundle: NONE — duplicate section must not be ignored
`;
    const result = await run(
      activeArguments(donorPath, transferPath, await fixture(spec)),
      undefined,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("duplicate TRANSFER DISPOSITION section");
  });
});
