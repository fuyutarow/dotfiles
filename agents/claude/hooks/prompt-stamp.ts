// The zsh PROMPT's `user@host:MM-DD HH:MM|cwd` head (zsh/zshrc: `%n@%m:%D{%m-%d %H:%M}|%~`),
// as plain text — the one home for that shape. Consumers: statusline-command.ts (its row 1,
// which it colors itself) and quote-command.ts (the /quote header, where it says who quoted
// from where, and when). Zero-dep like every hook, so the statusline can import it too.
//
// Time is Temporal, not Date: bun >= 1.4 ships it on by default, and the repo pins bun "1.4"
// (mise.toml; `mise run doctor` bun-floor FAILs on any older install or pin).

import { hostname, userInfo } from "node:os";

const pad2 = (n: number) => String(n).padStart(2, "0");

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
  stamp: string; // "MM-DD HH:MM"
  cwd: string; // tilde-shortened
}

export function promptParts(
  cwd: string,
  now: WallClock = Temporal.Now.plainDateTimeISO(),
): PromptParts {
  return {
    user: userInfo().username,
    host: hostname().split(".")[0] ?? "",
    stamp: stampMDHM(now),
    cwd: tildePath(cwd),
  };
}

/** "user@host:MM-DD HH:MM|~/cwd" — uncolored. */
export const promptHead = (p: PromptParts): string =>
  `${p.user}@${p.host}:${p.stamp}|${p.cwd}`;
