import { runProbe } from "./disk-probe.ts";

/** Execute the Bun cache command using the remaining child deadline. */
export function cleanBunProbe(
  home: string,
  timeout: number,
  probe: typeof runProbe = runProbe,
) {
  return probe(["bun", "pm", "cache", "rm"], timeout, {
    ...process.env,
    HOME: home,
  });
}
