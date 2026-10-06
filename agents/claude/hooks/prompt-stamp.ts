// The zsh PROMPT's `user@host:MM-DD HH:MM+09|cwd` head (zsh/zshrc: `%n@%m:%D{%m-%d %H:%M}<offset>|%~`),
// as plain text — the one home for that shape. Consumers: statusline-command.ts (its row 1,
// which it colors itself) and quote-command.ts (the /quote header, where it says who quoted
// from where, and when). Zero-dep like every hook, so the statusline can import it too.
//
// Time is Temporal, not Date: bun >= 1.4 ships it on by default, and the repo pins bun "1.4"
// (mise.toml; `mise run doctor` bun-floor FAILs on any older install or pin).

import { hostname, userInfo } from "node:os";

// THE ONE HOME for how a wall-clock time is shown (2026-10-06: a Stop hook formatted its own
// "MM-DD HH:MM" and never got the offset the prompt, statusline and /quote had). Anything that
// prints a time imports from here; a second padStart-and-join elsewhere is the bug to look for.
export const pad2 = (n: number) => String(n).padStart(2, "0");

/** Anything carrying local wall-clock fields: PlainDateTime or ZonedDateTime. */
type WallClock = Pick<
  Temporal.PlainDateTime,
  "month" | "day" | "hour" | "minute"
>;

/** "HH:MM" */
export const clockHM = (t: WallClock): string =>
  `${pad2(t.hour)}:${pad2(t.minute)}`;

/** "MM-DD HH:MM" — zsh's %D{%m-%d %H:%M}. */
export const stampMDHM = (t: WallClock): string =>
  `${pad2(t.month)}-${pad2(t.day)} ${clockHM(t)}`;

/**
 * The UTC offset, ISO 8601 short form: "+09:00" -> "+09", "+05:30" -> "+0530", "+00:00" -> "+00".
 * Machines now span time zones (the Mac in JST, a rented box in UTC), so a bare "00:47" no longer
 * says when; an offset is unambiguous where an abbreviation ("JST", "IST") is not (owner, 2026-10-06).
 * zsh/zshrc's prompt shortens %z the same way.
 */
export function offsetShort(z: Pick<Temporal.ZonedDateTime, "offset">): string {
  const m = /^([+-]\d{2}):(\d{2})/u.exec(z.offset);
  if (m === null) return z.offset;
  const [, hh = "", mm = ""] = m;
  return mm === "00" ? hh : `${hh}${mm}`;
}

/** "MM-DD HH:MM+09" — the prompt's stamp with its offset, joined: the offset is set apart by its
 *  dark gray in the colored heads, so a space only cost a column (owner, 2026-10-06). */
export const stampMDHMZ = (z: Temporal.ZonedDateTime): string =>
  `${stampMDHM(z)}${offsetShort(z)}`;

/** "HH:MM+09" — a clock time with its offset, the stamp's shape. */
export const clockHMZ = (z: Temporal.ZonedDateTime): string =>
  `${clockHM(z)}${offsetShort(z)}`;

/** Unix epoch seconds -> local wall clock, in this process's time zone. */
export const localFromEpochSec = (s: number): Temporal.ZonedDateTime =>
  Temporal.Instant.fromEpochMilliseconds(s * 1000).toZonedDateTimeISO(
    Temporal.Now.timeZoneId(),
  );

/** Unix epoch seconds, now. */
export const nowEpochSec = (): number =>
  Math.floor(Temporal.Now.instant().epochMilliseconds / 1000);

/** zsh %~ : leading $HOME -> ~ */
export function tildePath(p: string, home = process.env.HOME ?? ""): string {
  if (p === home) return "~";
  if (home !== "" && p.startsWith(`${home}/`))
    return `~${p.slice(home.length)}`;
  return p;
}

export interface PromptParts {
  user: string;
  host: string; // %m: hostname up to the first dot
  stamp: string; // "MM-DD HH:MM+09"
  when: string; // "MM-DD HH:MM" — the stamp's time, colored apart from its zone
  zone: string; // "+09" — the stamp's UTC offset, drawn in dark gray (owner 2026-10-06)
  cwd: string; // tilde-shortened
}

export function promptParts(
  cwd: string,
  now: Temporal.ZonedDateTime = Temporal.Now.zonedDateTimeISO(),
): PromptParts {
  return {
    user: userInfo().username,
    host: hostname().split(".")[0] ?? "",
    stamp: stampMDHMZ(now),
    when: stampMDHM(now),
    zone: offsetShort(now),
    cwd: tildePath(cwd),
  };
}

/** "user@host:MM-DD HH:MM+09|~/cwd" — uncolored. */
export const promptHead = (p: PromptParts): string =>
  `${p.user}@${p.host}:${p.stamp}|${p.cwd}`;
