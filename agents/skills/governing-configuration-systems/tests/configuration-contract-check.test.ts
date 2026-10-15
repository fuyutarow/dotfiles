import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(
  import.meta.dir,
  "../scripts/configuration-contract-check.ts",
);
const validFixture = resolve(import.meta.dir, "fixtures/valid-contract.md");
const temporaryDirectories: string[] = [];

type RunResult = Readonly<{
  exitCode: number;
  stderr: string;
  stdout: string;
}>;

async function fixture(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "configuration-contract-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "CONFIGURATION-CONTRACT.md");
  await writeFile(path, content);
  return path;
}

async function run(path: string): Promise<RunResult> {
  const child = Bun.spawn({
    cmd: ["bun", script, path],
    stderr: "pipe",
    stdout: "pipe",
    timeout: 10_000,
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  return {
    exitCode,
    stderr,
    stdout,
  };
}

async function validContract(): Promise<string> {
  return readFile(validFixture, "utf8");
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { force: true, recursive: true });
  }
});

describe("configuration-contract-check", () => {
  test("accepts a complete multi-regime contract", async () => {
    const result = await run(validFixture);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("C1  PASS");
    expect(result.stdout).toContain("C2  PASS");
    expect(result.stdout).toContain("C3  PASS");
    expect(result.stdout).toContain("configuration contract: FAIL=0");
    expect(result.stderr).toBe("");
  });

  test("rejects signed-canonical without a named profile", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "Canonicalization profile: RFC 8785 JCS",
          "Canonicalization profile: n/a",
        ),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "signed-canonical requires a named canonicalization profile",
    );
  });

  test("rejects strict JSON as a canonicalization profile", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "Canonicalization profile: RFC 8785 JCS",
          "Canonicalization profile: strict JSON",
        ),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "strict JSON is not a named canonicalization profile",
    );
  });

  test("accepts a gated decision that explicitly forbids exceptions", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "Exception encoding: encoded: signed exception object with owner and expiry",
          "Exception encoding: none: target rejects every exception",
        ),
      ),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("C3  PASS");
  });

  test("rejects unknown trust regimes", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "human-authored, generated, signed-canonical, gated-decision",
          "human-authored, eventual-policy",
        ),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("unknown trust regime: eventual-policy");
  });

  test("rejects a negated raw-byte boundary", async () => {
    const result = await run(
      await fixture(
        (await validContract())
          .replace(
            "human-authored, generated, signed-canonical, gated-decision",
            "signed-raw",
          )
          .replace(
            "Signature / digest input: canonical: UTF-8 bytes emitted after JCS",
            "Signature / digest input: not raw bytes; sign the semantic object instead",
          ),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "signed-raw requires a raw-byte signature/digest input",
    );
  });

  test("rejects a negated canonical boundary", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "Signature / digest input: canonical: UTF-8 bytes emitted after JCS",
          "Signature / digest input: not canonical bytes; hash source bytes instead",
        ),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "signed-canonical requires a canonical signature/digest input",
    );
  });

  test("rejects a raw-byte boundary with an absent payload", async () => {
    const result = await run(
      await fixture(
        (await validContract())
          .replace(
            "human-authored, generated, signed-canonical, gated-decision",
            "signed-raw",
          )
          .replace(
            "Signature / digest input: canonical: UTF-8 bytes emitted after JCS",
            "Signature / digest input: raw-byte: n/a",
          ),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "signed-raw requires a raw-byte signature/digest input",
    );
  });

  test("rejects a canonical boundary with an absent payload", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "Signature / digest input: canonical: UTF-8 bytes emitted after JCS",
          "Signature / digest input: canonical: n/a",
        ),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "signed-canonical requires a canonical signature/digest input",
    );
  });

  test("rejects an embedded template placeholder", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "Consumer: package installer and policy verifier",
          "Consumer: <human editor> (replace this)",
        ),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("placeholder value: Consumer");
  });

  test("ignores fields inside a Markdown code fence", async () => {
    const fence = String.fromCodePoint(96).repeat(3);
    const result = await run(
      await fixture(
        fence +
          "text\nConsumer: an example only\n" +
          fence +
          "\n\n" +
          (await validContract()),
      ),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("configuration contract: FAIL=0");
  });

  test("ignores fields inside a tilde Markdown code fence", async () => {
    const result = await run(
      await fixture(
        "~~~~text\nConsumer: an example only\n~~~~\n\n" +
          (await validContract()),
      ),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("configuration contract: FAIL=0");
  });

  test("keeps a fence open when a would-be closing fence has trailing code", async () => {
    const fence = String.fromCodePoint(96).repeat(4);
    const result = await run(
      await fixture(
        fence +
          "text\n" +
          fence +
          " this remains code\nConsumer: illustrative only\n" +
          fence +
          "\n\n" +
          (await validContract()),
      ),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("configuration contract: FAIL=0");
  });

  test("ignores fields inside an indented Markdown code block", async () => {
    const result = await run(
      await fixture(
        "    Consumer: illustrative only\n\n" + (await validContract()),
      ),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("configuration contract: FAIL=0");
  });

  test("parses a declaration after an inline HTML comment", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "- Consumer: package installer and policy verifier",
          "<!-- declared below --> - Consumer: package installer and policy verifier",
        ),
      ),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("configuration contract: FAIL=0");
  });

  test("parses a declaration after a multiline HTML comment closes", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "- Consumer: package installer and policy verifier",
          "<!-- declaration follows\n--> - Consumer: package installer and policy verifier",
        ),
      ),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("configuration contract: FAIL=0");
  });

  test("rejects an empty trust-regime entry", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "human-authored, generated, signed-canonical, gated-decision",
          "human-authored,, signed-canonical",
        ),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "trust regime contains an empty comma-separated entry",
    );
  });

  test("rejects duplicate consumer fields", async () => {
    const result = await run(
      await fixture((await validContract()) + "\n- Consumer: second reader\n"),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("duplicate field: Consumer");
  });

  test("rejects a missing precedence field", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "- Precedence / merge: project source overrides global defaults; rules arrays replace; conflicting scalar values reject\n",
          "",
        ),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("required field: Precedence / merge");
  });

  test("rejects a missing verification command", async () => {
    const result = await run(
      await fixture(
        (await validContract()).replace(
          "- Verification command: tool verify-policy --config dist/policy.json --signature dist/policy.jws\n",
          "",
        ),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("required field: Verification command");
  });

  test("rejects comment-only decision and exception dispositions", async () => {
    const result = await run(
      await fixture(
        (await validContract())
          .replace(
            "Decision record: record: decisions/policy-rulings.jsonl",
            "Decision record: n/a (approval is in a code comment)",
          )
          .replace(
            "Exception encoding: encoded: signed exception object with owner and expiry",
            "Exception encoding: n/a (assume operators know exceptions)",
          ),
      ),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      "gated-decision requires Decision record: record: or none:",
    );
    expect(result.stdout).toContain(
      "gated-decision requires Exception encoding: encoded: or none:",
    );
  });
});
