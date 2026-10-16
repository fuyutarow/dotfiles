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
