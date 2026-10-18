import type { DiskEntry, TmpEntry } from "./storage.ts";
import {
  diskFreeColor,
  MID,
  naSegment,
  roles,
  tmpInodeColor,
  unavailable,
} from "./ansi.ts";

export function tmpSegment(t: TmpEntry): string {
  if (t.kind === "miss") return naSegment(t.label, t.why);
  const freePercent = t.totalG > 0 ? (t.freeG / t.totalG) * 100 : undefined;
  const bytes = `${roles.label(t.label)} ${roles.value(`${significant(t.freeG, 3)}GiB`, tmpInodeColor(100 - (freePercent ?? 100)))}${roles.secondary(" free")}`;
  const inodes =
    t.inodeUsedPct === undefined
      ? roles.unavailable("inodes", unavailable("inode count not reported"))
      : `${roles.label("inodes")} ${roles.value(`${Math.round(100 - t.inodeUsedPct)}%`, tmpInodeColor(t.inodeUsedPct))}${roles.secondary(" free")}`;
  return `${bytes} ${roles.secondary(MID)} ${inodes}`;
}
export function diskSegment(d: DiskEntry): string {
  if (d.kind === "miss") return naSegment(d.label, d.why);
  if (d.freeG === undefined || !Number.isFinite(d.freeG) || d.freeG < 0)
    return roles.unavailable(
      d.label,
      unavailable("invalid free space reading"),
    );
  const free = significant(d.freeG, 3);
  const total = d.totalG;
  const fraction =
    total !== undefined && Number.isFinite(total) && total > 0
      ? `/${significant(total, 3)}GiB (${Math.round((d.freeG / total) * 100)}%)`
      : "";
  let rate = "";
  const fill = d.rateGibPerMin;
  if (fill !== undefined && Number.isFinite(fill) && Math.abs(fill) >= 0.05) {
    rate = ` ${fill > 0 ? "↓" : "↑"}${significant(Math.abs(fill), 2)}GiB/min`;
  }
  const freePercent =
    total !== undefined && Number.isFinite(total) && total > 0
      ? (d.freeG / total) * 100
      : undefined;
  return `${roles.label(d.label)} ${roles.value(`${free}GiB`, diskFreeColor(freePercent))}${roles.secondary(`${fraction} free${rate}`)}`;
}

function significant(value: number, digits: number): string {
  if (value === 0) return "0";
  const rounded = Number(value.toPrecision(digits));
  const decimals = Math.max(
    0,
    digits - 1 - Math.floor(Math.log10(Math.abs(rounded))),
  );
  return rounded.toFixed(Math.min(decimals, 100));
}
