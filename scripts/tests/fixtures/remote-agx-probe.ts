const mode = process.argv[2];

if (mode === "pass") {
  process.stdout.write(
    `${JSON.stringify({ schema: 1, vendor: "codex", outcome: "success" })}\n`,
  );
} else if (mode === "fail") {
  process.stdout.write(
    `${JSON.stringify({
      schema: 1,
      vendor: "codex",
      outcome: "failed",
      reason: "Codex diagnostic failed",
      stderr: "unshare: Operation not permitted",
    })}\n`,
  );
  process.exitCode = 1;
} else if (mode === "missing-agx") {
  process.stderr.write("mise: command not found\n");
  process.exitCode = 127;
} else {
  process.stderr.write("unknown fixture mode\n");
  process.exitCode = 2;
}
