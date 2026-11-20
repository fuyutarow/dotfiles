import { expect, test } from "bun:test";
import { bashShellViolation } from "../src/no-new-bash.ts";

const remedialText =
  "Write the logic as one .ts file run by bun. A shell file is allowed only as a thin shim that execs it";
const splitText = "Splitting a script into several shell files is not a fix.";
const read = () => Promise.resolve(null);

test("known-size shell redirects carry replace-not-split guidance", async () => {
  const body = Array.from({ length: 13 }, (_, index) => `echo ${index}`).join(
    "\n",
  );
  const reason = await bashShellViolation(
    `cat > x.sh <<'EOF'\n${body}\nEOF\n`,
    "/tmp",
    read,
  );
  expect(reason).toContain(remedialText);
  expect(reason).toContain(splitText);
});

test("unknown-size shell redirects carry replace-not-split guidance", async () => {
  const reason = await bashShellViolation(
    "cat > x.sh <<EOF\n$BODY\nEOF\n",
    "/tmp",
    read,
  );
  expect(reason).toContain("cannot determine final size");
  expect(reason).toContain(remedialText);
  expect(reason).toContain(splitText);
});

test("a target naming a variable set in the inherited environment is judged at its value", async () => {
  const env = { AGX_RUN_DIR: "/runs/r1", D: "/work" };
  for (const command of [
    'echo hi > "$AGX_RUN_DIR/result.md"',
    "echo hi >> ${AGX_RUN_DIR}/result.md",
    'echo hi | tee "$AGX_RUN_DIR/log.txt"',
  ])
    expect(await bashShellViolation(command, "/tmp", read, 12, env)).toBe(
      undefined,
    );
  // The ratchet still applies at the expanded path; a command naming a variable is dynamic, so
  // its heredoc size is unknown and a shell-file target fails closed.
  const body = Array.from({ length: 13 }, (_, index) => `echo ${index}`).join(
    "\n",
  );
  expect(
    await bashShellViolation(
      `cat > "\${D}/x.sh" <<'EOF'\n${body}\nEOF\n`,
      "/tmp",
      read,
      12,
      env,
    ),
  ).toContain("cannot determine final size of /work/x.sh");
});

test("an unset variable or any other expansion in a target stays unknown", async () => {
  for (const command of [
    'echo hi > "$AGX_RUN_DIR/result.md"',
    "echo hi > $(pwd)/out.txt",
    "echo hi > /tmp/*.txt",
  ])
    expect(
      await bashShellViolation(command, "/tmp", read, 12, { D: "/work" }),
    ).toContain("cannot determine write target");
});
