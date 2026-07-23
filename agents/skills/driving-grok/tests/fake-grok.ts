#!/usr/bin/env bun
// Fixture binary substituted for the real `grok` CLI via the GROK env override
// (probe-models.ts:54). Routes on the first argv token / the `-m` model id so
// each test can pin one tri-state branch of the real script's behavior.

const args = Bun.argv.slice(2);

if (args[0] === "--version") {
  process.stdout.write("grok version 9.9.9-fake\n");
  process.exit(0);
}

if (args[0] === "models") {
  if (process.env.FAKE_GROK_MODELS_FAIL === "1") {
    process.stderr.write("fake roster fetch failed\n");
    process.exit(3);
  }
  process.stdout.write("grok-4.5\ngrok-4.5-fast\n");
  process.exit(0);
}

const modelIndex = args.indexOf("-m");
const model = modelIndex === -1 ? "" : args[modelIndex + 1];

switch (model) {
  case "good-model":
    process.stdout.write(
      `${JSON.stringify({ text: "OK", usage: { total_tokens: 123 } })}\n`,
    );
    process.exit(0);
    break;
  case "no-usage-model":
    process.stdout.write(`${JSON.stringify({ text: "OK" })}\n`);
    process.exit(0);
    break;
  case "unknown-model":
    process.stdout.write(
      "Error: unknown model id 'unknown-model' — run `grok models`\n",
    );
    process.exit(1);
    break;
  case "malformed-model":
    process.stdout.write("not json at all\n");
    process.exit(0);
    break;
  case "wrong-text-model":
    process.stdout.write(`${JSON.stringify({ text: "NOPE" })}\n`);
    process.exit(0);
    break;
  case "array-json-model":
    process.stdout.write(`${JSON.stringify([1, 2, 3])}\n`);
    process.exit(0);
    break;
  case "denied-model":
    process.stderr.write("Starting probe...\n");
    process.stderr.write("Error: permission denied for model\n");
    process.stderr.write("Error: quota exceeded this month\n");
    process.stderr.write("auth failed as well\n");
    process.stderr.write("done\n");
    process.exit(2);
    break;
  default:
    process.stdout.write(`unrecognized fake-grok invocation: ${model}\n`);
    process.exit(9);
}
