// One home for a storage-headroom line: the storage gate (enforce-storage-headroom.ts) decides with
// it, and the statusline's Disk color (agents/claude/host-load.ts) shows it, so the two can never
// disagree about where a drive turns yellow or red. Zero-dep: hooks import only node: and local files.
//
// A line in bytes is the SMALLER of an absolute size and a share of the drive. The sizes were set on
// r99 (C: 931 GB, guest ~1 TB); on a 40 GB rented box `deny_gib = 40` alone denied every launch with
// the disk 80% empty (2026-10-05). min() keeps r99's lines exactly and scales small disks.
// `totalBytes` null (the size could not be read): the absolute size alone.

const GiB = 1024 ** 3;

export function storageLine(
  gibLine: number,
  pct: number,
  totalBytes: number | null,
): number {
  const abs = gibLine * GiB;
  return totalBytes === null ? abs : Math.min(abs, (pct / 100) * totalBytes);
}
