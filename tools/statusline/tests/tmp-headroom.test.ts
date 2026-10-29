import { describe, expect, test } from "bun:test";
import { statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { err, ok } from "neverthrow";
import {
  ESC,
  TMP_INODE_DENY_PCT,
  TMP_INODE_WARN_PCT,
  tmpInodeColor,
} from "../src/ansi.ts";
import {
  tmpEntry,
  tmpReadingsAsync,
  type StatFsCounts,
} from "../src/storage.ts";
import { tmpSegment } from "../src/storage-display.ts";
import { sysSegment } from "../src/host-display.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import {
  TMP_INODE_WARN_PCT as hookWarn,
  TMP_INODE_DENY_PCT as hookDeny,
} from "../../storage-headroom/src/decision.ts";

const GiB = 1024 ** 3;
const BSIZE = 4096;
const INODES = 1_048_576;
const plain = (text: string) =>
  text.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");
// A 27.5 GiB tmpfs: `freeGiB` of bytes available, and `ffree` of its 1,048,576 inodes still free.
function fixture(freeGiB: number, ffree: number): StatFsCounts {
  return {
    bsize: BSIZE,
    blocks: (27.5 * GiB) / BSIZE,
    bavail: (freeGiB * GiB) / BSIZE,
    files: INODES,
    ffree,
  };
}
const read = (counts: StatFsCounts) => tmpEntry(ok(counts));

describe("tmp reading", () => {
  test("bytes and inodes render as free amounts", () => {
    expect(plain(tmpSegment(read(fixture(26.5, 1038090))))).toBe(
      "tmp 26.5GiB free · inodes 99% free",
    );
  });
  test("inode use at the warn line turns yellow", () => {
    // 157286 free inodes = 85.00004% used, just over the 85% line.
    const warn = tmpSegment(read(fixture(26.5, 157286)));
    expect(warn).toContain(`${ESC}[38;5;178m15%`);
  });
  test("inode use one inode below the warn line stays green", () => {
    // 157287 free inodes = 84.99997% used.
    const below = tmpSegment(read(fixture(26.5, 157287)));
    expect(below).toContain(`${ESC}[38;5;71m15%`);
  });
  test("inode use at the deny line turns red", () => {
    // 52428 free inodes = 95.00008% used, just over the 95% line.
    const deny = tmpSegment(read(fixture(26.5, 52428)));
    expect(deny).toContain(`${ESC}[38;5;167m5%`);
    expect(plain(deny)).toBe("tmp 26.5GiB free · inodes 5% free");
  });
  test("exhausted inodes render 0% free in red, while bytes stay green", () => {
    const exhausted = tmpSegment(read(fixture(26.5, 0)));
    expect(exhausted).toContain(`${ESC}[38;5;167m0%`);
    expect(exhausted).toContain(`${ESC}[38;5;71m26.5GiB`);
  });
  test("low bytes take the hook's deny colour", () => {
    const low = tmpSegment(read(fixture(1, 1038090)));
    expect(low).toContain(`${ESC}[38;5;167m1.00GiB`);
  });
  test("an inode count of zero is unknown, shown as inodes n/a", () => {
    expect(plain(tmpSegment(read({ ...fixture(26.5, 0), files: 0 })))).toBe(
      "tmp 26.5GiB free · inodes n/a (inode count not reported)",
    );
  });
  test("a statfs failure is named, never a blank or a throw", async () => {
    expect(plain(tmpSegment(tmpEntry(err("ENOENT"))))).toBe("tmp n/a (ENOENT)");
    const [missing] = await tmpReadingsAsync("/missing-config", () =>
      statfs(join(tmpdir(), "statusline-tmp-headroom-no-such-path")),
    );
    expect(missing).toBeDefined();
    if (missing === undefined) return;
    expect(plain(tmpSegment(missing))).toBe("tmp n/a (ENOENT)");
  });
  test("counts that cannot be a filesystem are a named miss", () => {
    expect(plain(tmpSegment(read({ ...fixture(1, 1), blocks: 0 })))).toBe(
      "tmp n/a (statfs reported no capacity)",
    );
  });
  test("async read takes the injected statfs fixture", async () => {
    const [entry] = await tmpReadingsAsync("/missing-config", () =>
      Promise.resolve(fixture(26.5, 1038090)),
    );
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(plain(tmpSegment(entry))).toBe("tmp 26.5GiB free · inodes 99% free");
  });
});

describe("tmp inode colour", () => {
  test.each([
    [0, "38;5;71"],
    [TMP_INODE_WARN_PCT - 0.0001, "38;5;71"],
    [TMP_INODE_WARN_PCT, "38;5;178"],
    [TMP_INODE_DENY_PCT - 0.0001, "38;5;178"],
    [TMP_INODE_DENY_PCT, "38;5;167"],
    [100, "38;5;167"],
  ])("inode use %d colours %s", (used, color) => {
    expect(tmpInodeColor(used)).toBe(color);
  });
  test("the warn and deny lines are the hook's 85 and 95", () => {
    expect([TMP_INODE_WARN_PCT, TMP_INODE_DENY_PCT]).toEqual([
      hookWarn,
      hookDeny,
    ]);
  });
});

describe("tmp entry", () => {
  test("Sys renders fixture headroom and statfs failures beside disks", () => {
    const row = (entry: ReturnType<typeof tmpEntry>) =>
      plain(
        sysSegment(ok(5), ok({ pct: 5, frac: "1/20G" }), undefined, ok([]), [
          entry,
        ]),
      );
    expect(row(read(fixture(26.5, 1038090)))).toContain(
      "tmp 26.5GiB free · inodes 99% free",
    );
    expect(row(tmpEntry(err("EIO")))).toContain("tmp n/a (EIO)");
    expect(
      sysSegment(ok(5), ok({ pct: 5, frac: "1/20G" }), undefined, ok([]), [
        read(fixture(26.5, 0)),
      ]),
    ).toContain(`${ESC}[38;5;167m0%`);
  });
  test("bytes use the same warning boundary as inode use", () => {
    expect(tmpSegment(read(fixture(27.5 * 0.15, INODES)))).toContain(
      `${ESC}[38;5;178m4.13GiB`,
    );
    expect(tmpSegment(read(fixture(27.5 * 0.05, INODES)))).toContain(
      `${ESC}[38;5;167m1.38GiB`,
    );
  });
  test("statfs is bounded even if its promise never settles", async () => {
    const [entry] = await tmpReadingsAsync(
      "/missing-config",
      () => new Promise(() => {}),
    );
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(plain(tmpSegment(entry))).toBe("tmp n/a (statfs timeout 150ms)");
  });
  test("configured tmpfs paths are included once and ordinary drives are excluded", async () => {
    const root = await mkdtemp(join(tmpdir(), "statusline-tmp-config-"));
    const config = join(root, "storage.toml");
    await writeFile(
      config,
      '[drive.tmp]\npath="/tmp"\n[drive.ram]\npath="/run/ram"\n[drive.disk]\npath="/"\n',
    );
    const entries = await tmpReadingsAsync(config, (path) =>
      Promise.resolve({
        ...fixture(26.5, 1038090),
        type: path === "/" ? 0xef53 : 0x01021994,
      }),
    );
    expect(entries.map((entry) => entry.label)).toEqual([
      "tmp",
      "tmp /run/ram",
    ]);
    await rm(root, { recursive: true, force: true });
  });
  test("a reading is labelled tmp and carries no drive path", () => {
    const entry = read(fixture(26.5, 1038090));
    expect(entry.kind).toBe("reading");
    expect(entry.label).toBe("tmp");
    expect(Object.hasOwn(entry, "path")).toBe(false);
  });
});
