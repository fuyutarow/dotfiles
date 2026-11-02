import { pad2 } from "./prompt-stamp.ts";

// elapsed: <h>h<mm>m past an hour, else <m>m<ss>s — same shape as the rate-limit countdowns.
export const dur = (seconds: number) => {
  const s = Math.floor(seconds);
  return s >= 3600
    ? `${Math.floor(s / 3600)}h${pad2(Math.floor((s % 3600) / 60))}m`
    : `${Math.floor(s / 60)}m${pad2(s % 60)}s`;
};
