import { expect, test } from "bun:test";
import { ensureFstabEntry } from "../../wsl/drive-mount.ts";

const DECLARED = "G: /mnt/g drvfs defaults,nofail 0 0";

test("fstab convergence appends the declared drvfs mount once and preserves other rows", () => {
  const original = "# WSL mounts\n/dev/sda / ext4 defaults 0 0\n";
  const added = ensureFstabEntry(original, DECLARED);
  expect(added).toEqual({
    content: `${original}${DECLARED}\n`,
    changed: true,
  });
  expect(ensureFstabEntry(added.content, DECLARED)).toEqual({
    content: added.content,
    changed: false,
  });
});

test("fstab convergence refuses to replace a different /mnt/g entry", () => {
  const original = "G: /mnt/g drvfs metadata,uid=1000 0 0\n";
  expect(ensureFstabEntry(original, DECLARED)).toEqual({
    content: original,
    changed: false,
    conflict: "an existing fstab entry already owns /mnt/g",
  });
});
