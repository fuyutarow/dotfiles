import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function fleetSessionFixture(home: string, sid = "s1") {
  const session = {
    schema: 1,
    session_id: sid,
    vendor: "claude",
    name: "dotfiles-agt_test",
    model: "Opus",
    effort: "high",
    ctx: { tokens: 120_000, pct: 60 },
    rate: {
      five_h_pct: 40,
      seven_d_pct: 60,
      resets: {
        five_h: { na: true, why: "not supplied" },
        seven_d: { na: true, why: "not supplied" },
      },
    },
    rc: "rc:?",
    cwd: home,
    pane_id: null,
    updated_at: Temporal.Now.instant().toString(),
  };
  const dir = join(home, "runtime/fleet/sessions");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${sid}.json`);
  await writeFile(path, JSON.stringify(session));
  return { session, path };
}
