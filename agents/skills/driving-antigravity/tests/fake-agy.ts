#!/usr/bin/env bun
// Fake `agy` fixture for probe-models.test.ts — NEVER invokes the real Antigravity CLI.
// Substituted in via AGY_BIN (probe-models.ts's env override). Behavior is keyed off argv so
// each pinned RESULT/verdict case in probe-models.test.ts gets a deterministic, instant reply.

const argv = Bun.argv.slice(2);

if (argv[0] === "--version") {
  process.stdout.write(`${process.env.FAKE_AGY_VERSION ?? "1.1.5"}\n`);
  process.exit(0);
}

if (argv[0] === "models") {
  process.stdout.write(
    process.env.FAKE_AGY_MODELS_OUTPUT ??
      "Gemini 3.5 Flash (Medium)\nClaude 4.6 Sonnet\nGPT-OSS 20B\n",
  );
  process.exit(Number(process.env.FAKE_AGY_MODELS_EXIT ?? "0"));
}

const modelIndex = argv.indexOf("--model");
const model = modelIndex === -1 ? "" : argv[modelIndex + 1];

if (model === "avail") {
  process.stdout.write("OK\n");
  process.exit(0);
}

if (model === "invalid") {
  process.stderr.write(`Error: model "invalid" is not recognized as a known model\n`);
  process.exit(1);
}

if (model === "rc0-empty") {
  // rc=0 but stdout trims to "" (not "OK") — the <1.1.2 swallowed-error landmine shape.
  process.stdout.write("");
  process.exit(0);
}

if (model === "rc0-other") {
  // rc=0 but stdout is non-empty and still not exactly "OK".
  process.stdout.write("PARTIAL\n");
  process.exit(0);
}

if (model === "quota-error") {
  process.stderr.write(
    [
      "Error: quota exceeded for this project",
      "denied: RESOURCE_EXHAUSTED",
      "harmless line that should not print",
      "auth token expired",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

process.stdout.write("fake-agy: unhandled fixture model\n");
process.exit(1);
