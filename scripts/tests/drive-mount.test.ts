import { expect, test } from "bun:test";
import {
  DRIVE_MOUNT_REPAIR,
  STALE_DRIVE_MOUNT_REPAIR,
  ensureFstabEntry,
  mountDirOutcome,
} from "../../wsl/drive-mount.ts";

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

test("an existing mount point, even a stale one (mkdir EEXIST), counts as prepared", () => {
  const eexist = Object.assign(
    new Error("file already exists, mkdir '/mnt/g'"),
    { code: "EEXIST" },
  );
  expect(mountDirOutcome("/mnt/g", eexist)).toBeUndefined();
});

test("other mkdir failures still fail loudly", () => {
  const denied = Object.assign(new Error("denied"), { code: "EACCES" });
  expect(mountDirOutcome("/mnt/g", denied)?.message).toContain(
    "cannot prepare /mnt/g",
  );
});

test("repair hints: stale unmounts first, plain not-mounted is unchanged", () => {
  expect(DRIVE_MOUNT_REPAIR).toBe(
    "mise run wsl:drive-mount && sudo mount /mnt/g",
  );
  expect(STALE_DRIVE_MOUNT_REPAIR).toBe(
    "sudo umount -l /mnt/g && mise run wsl:drive-mount && sudo mount /mnt/g",
  );
});
