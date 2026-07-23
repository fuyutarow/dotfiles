#!/usr/bin/env bun
/**
 * Fake `codex` fixture for probe-models.test.ts. Behavior is selected by the
 * `-m <model>` value probe-models.ts always passes, so one fixture binary
 * covers every branch of the real contract without touching a network.
 */

const modelIndex = Bun.argv.indexOf("-m");
const model = modelIndex === -1 ? "" : Bun.argv[modelIndex + 1];

if (model === "gpt-good") {
  // Mirrors a real `codex exec` success tail closely enough to exercise the
  // "tokens used\n<line>" extraction regex, including its space-stripping.
  process.stdout.write("OK\ntokens used\n1234 total\n");
  process.exit(0);
}

if (model === "gpt-bad") {
  // Two lines matching /ERROR|error|Not inside a trusted|stream/ (to pin the
  // firstMatches(..., 2) cap), a third that must NOT match, and the exact
  // "model is not supported" substring that triggers the 400-ambiguity note.
  process.stderr.write(
    "ERROR: request failed\n" +
      "stream connection closed\n" +
      "model is not supported: gpt-bad\n" +
      "too many lines beyond limit - error occurred here as well\n",
  );
  process.exit(1);
}

if (model === "gpt-native-fail") {
  // No matching output at all — pins the exit-127 "codex not runnable" note
  // on its own, independent of the ERROR/stream line matcher.
  process.exit(127);
}

if (model === "gpt-echo-cwd") {
  // Leaks the child's actual cwd through the ERROR-matching line so a test
  // can assert PROBE_DIR was honored as the spawned cwd.
  process.stderr.write(`ERROR: cwd=${process.cwd()}\n`);
  process.exit(1);
}

// Defensive default: fail fast and loud instead of hanging, so a typo'd
// model name in a test shows up as a wrong assertion, not a stuck process.
process.stderr.write(`ERROR: unrecognized fixture model ${model}\n`);
process.exit(1);
