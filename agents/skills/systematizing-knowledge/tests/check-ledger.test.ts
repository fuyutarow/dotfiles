import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../scripts/check-ledger.ts");
const example = resolve(
  import.meta.dir,
  "../assets/claim-ledger.example.jsonl",
);
const temporaryDirectories: string[] = [];

type RunResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

const run = (...arguments_: string[]): RunResult => {
  const result = Bun.spawnSync({
    cmd: ["bun", script, ...arguments_],
    stderr: "pipe",
    stdout: "pipe",
    timeout: 10_000,
  });

  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
};

const fixture = (rows: unknown[]): string => {
  const directory = mkdtempSync(join(tmpdir(), "knowledge-ledger-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "claims.jsonl");
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  return path;
};

const sourceClaim = {
  assessment: {
    basis: "The cited result directly measures the bounded proposition.",
    limitations: ["single setting"],
    status: "supported-with-limitations",
  },
  claim: "The method improved the stated outcome in one setting.",
  claim_id: "C-001",
  claim_type: "empirical",
  derived_from: [],
  load_bearing: true,
  relations: [],
  scope: "One dataset, one comparator, and the reported evaluation period.",
  sources: [
    {
      locator: "Table 2, row 4",
      role: "supports",
      source_id: "doi:10.0000/example",
    },
  ],
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("check-ledger", () => {
  test("accepts the copyable example", () => {
    const result = run(example);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("PASS");
    expect(result.stdout).toContain("claims=2");
    expect(result.stderr).toBe("");
  });

  test("reports malformed JSON as a ledger finding", () => {
    const path = fixture([sourceClaim]);
    writeFileSync(path, `${JSON.stringify(sourceClaim)}\n{bad json}\n`);
    const result = run(path);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(":2:");
    expect(result.stdout).toContain("invalid JSON");
  });

  test("rejects a blank ledger", () => {
    const path = fixture([]);
    const result = run(path);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("ledger contains no claims");
  });

  test("rejects duplicate claim identifiers", () => {
    const result = run(fixture([sourceClaim, sourceClaim]));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("duplicate claim_id");
  });

  test("accepts forward references in an acyclic ledger", () => {
    const synthesis = {
      assessment: {
        basis: "The bounded conclusion derives from C-001.",
        limitations: [],
        status: "supported",
      },
      claim: "The bounded source claim supports the synthesis.",
      claim_id: "Y-001",
      claim_type: "synthesis",
      derived_from: ["C-001"],
      load_bearing: true,
      relations: [
        {
          basis: "The synthesis preserves the source scope.",
          target: "C-001",
          type: "supports",
        },
      ],
      scope: "The source claim's stated setting.",
      sources: [],
    };
    const result = run(fixture([synthesis, sourceClaim]));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("claims=2");
  });

  test("accepts every documented enum and ignores semantic absurdity", () => {
    const claimTypes = [
      "definition",
      "empirical",
      "methodological",
      "open-question",
      "synthesis",
      "theoretical",
    ];
    const statuses = [
      "not-comparable",
      "supported",
      "supported-with-limitations",
      "uncertain",
      "unsupported",
    ];
    const relationTypes = [
      "conflicts",
      "extends",
      "not-comparable",
      "qualifies",
      "supports",
    ];
    const rows = claimTypes.map((claimType, index) => ({
      assessment: {
        basis: "A structurally valid but semantically unchecked assertion.",
        limitations: [],
        status: statuses[index % statuses.length],
      },
      claim: "The moon is made of cheese.",
      claim_id: `X-${index + 1}`,
      claim_type: claimType,
      derived_from: [],
      load_bearing: true,
      relations: [
        {
          basis: "This relationship is intentionally not truth-checked.",
          target: `X-${((index + 1) % claimTypes.length) + 1}`,
          type: relationTypes[index % relationTypes.length],
        },
      ],
      scope: "An intentionally absurd structural fixture.",
      sources: [
        {
          locator: "banana",
          source_id: "not-a-real-source",
        },
      ],
      unexpected_extension: {
        retained: true,
      },
    }));
    const result = run(fixture(rows));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("claims=6");
  });

  test("requires source provenance for source claims", () => {
    const { sources: _, ...withoutSources } = sourceClaim;
    const result = run(fixture([withoutSources]));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("requires at least one source");
  });

  test("rejects invalid enums and malformed nested entries", () => {
    const invalid = {
      ...sourceClaim,
      assessment: {
        basis: "",
        limitations: "none",
        status: "certain",
      },
      claim_type: "opinion",
      relations: [{ basis: "", target: "", type: "agrees" }],
      sources: [{ locator: "", source_id: 4 }],
    };
    const result = run(fixture([invalid]));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("claim_type must be one of");
    expect(result.stdout).toContain("assessment.status must be one of");
    expect(result.stdout).toContain("sources[0].source_id");
    expect(result.stdout).toContain("relations[0].type");
  });

  test("requires every normalized array field", () => {
    const { derived_from: _derivedFrom, ...withoutDerivedFrom } = sourceClaim;
    const { relations: _relations, ...withoutRelations } = sourceClaim;
    const { sources: _sources, ...withoutSources } = sourceClaim;
    const results = [
      run(fixture([withoutSources])),
      run(fixture([withoutDerivedFrom])),
      run(fixture([withoutRelations])),
    ];

    expect(results.map((result) => result.exitCode)).toEqual([1, 1, 1]);
    expect(results[0].stdout).toContain("sources must be an array");
    expect(results[1].stdout).toContain("derived_from must be an array");
    expect(results[2].stdout).toContain("relations must be an array");
  });

  test("requires an assessment for a load-bearing claim", () => {
    const { assessment: _, ...withoutAssessment } = sourceClaim;
    const result = run(fixture([withoutAssessment]));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("load-bearing claim requires assessment");
  });

  test("rejects dangling derivations and relation targets", () => {
    const synthesis = {
      ...sourceClaim,
      claim_id: "Y-001",
      claim_type: "synthesis",
      derived_from: ["C-404"],
      relations: [
        {
          basis: "The scopes overlap.",
          target: "C-405",
          type: "qualifies",
        },
      ],
      sources: [],
    };
    const result = run(fixture([synthesis]));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("unresolved derived_from");
    expect(result.stdout).toContain("unresolved relation target");
  });

  test("rejects a relation targeting its own row", () => {
    const selfRelated = {
      ...sourceClaim,
      relations: [
        {
          basis: "A self-relation is structurally ambiguous.",
          target: "C-001",
          type: "supports",
        },
      ],
    };
    const result = run(fixture([selfRelated]));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("must reference another row");
  });

  test("rejects derivation cycles", () => {
    const first = {
      ...sourceClaim,
      claim_id: "Y-001",
      claim_type: "synthesis",
      derived_from: ["Y-002"],
      sources: [],
    };
    const second = {
      ...first,
      claim_id: "Y-002",
      derived_from: ["Y-001"],
    };
    const result = run(fixture([first, second]));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("derivation cycle");
  });

  test("checks a deep acyclic derivation without recursion overflow", () => {
    const depth = 60_001;
    const rows = Array.from({ length: depth }, (_, index) => {
      const claimId = `Y-${index}`;
      if (index === depth - 1) {
        return {
          claim: "The terminal source claim anchors the chain.",
          claim_id: claimId,
          claim_type: "empirical",
          derived_from: [],
          load_bearing: false,
          relations: [],
          scope: "A structural stress-test fixture.",
          sources: [{ locator: "stress fixture", source_id: "local:test" }],
        };
      }
      return {
        claim: "This synthesis claim derives from the next row.",
        claim_id: claimId,
        claim_type: "synthesis",
        derived_from: [`Y-${index + 1}`],
        load_bearing: false,
        relations: [],
        scope: "A structural stress-test fixture.",
        sources: [],
      };
    });
    const result = run(fixture(rows));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`claims=${depth}`);
    expect(result.stderr).not.toContain("Maximum call stack");
  });

  test("uses Cleye's required-parameter failure and exit 2 for other input failures", () => {
    const usage = run();
    const missing = run("/path/that/does/not/exist.jsonl");
    const tooMany = run(example, example);

    expect(usage.exitCode).toBe(1);
    expect(usage.stderr).toContain('Missing required parameter "claimsJsonl"');
    expect(missing.exitCode).toBe(2);
    expect(missing.stderr).toContain("file not found");
    expect(tooMany.exitCode).toBe(2);
    expect(tooMany.stderr).toContain("accepts exactly one claims JSONL path");
  });

  test("rejects --__proto__ before treating it as a ledger path", () => {
    const result = run("--__proto__");

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("unknown option '--__proto__'");
    expect(result.stdout).toBe("");
  });
});
