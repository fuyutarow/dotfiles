import { DoctorRecord } from "../../../shared/src/doctor-record.ts";
import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";

const home = await mkdtemp(join(tmpdir(), "agx-ticket-display-"));
afterAll(() => rm(home, { recursive: true, force: true }));
const entry = join(import.meta.dir, "../../src/next/cli.ts");
test("human ls and wait prefix the recorded slug; JSON and doctor JSONL retain machine fields", async () => {
  const started = {
    kind: "started",
    id: "display-id",
    at: "2026-10-01T00:00:00Z",
    ticket: "model-layer",
    row: "terra-high",
    writes: [],
    cwd: home,
    workspace: home,
    dispatcher_session: null,
    vendor_session: null,
    pid: 0,
    lease: { pid: 0, start: null, unit: null },
  };
  const ended = {
    kind: "ended",
    id: started.id,
    at: "2026-10-01T01:00:00Z",
    exit: 0,
    outcome: "ok",
    report_path: null,
    vendor_session: null,
    returned: true,
    verify: [],
  };
  await writeFile(
    join(home, "records.jsonl"),
    [started, ended].map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  const preload = join(home, "clock.ts");
  await writeFile(
    preload,
    'Temporal.Now.instant=()=>Temporal.Instant.from("2026-10-17T00:00:00Z");',
  );
  const invoke = async (args: string[]) => {
    const child = Bun.spawn(
      [process.execPath, "--preload", preload, entry, ...args],
      {
        env: {
          HOME: home,
          PATH: "",
          AGX_STATE_DIR: home,
          AGX_NEXT_STATE_DIR: home,
          AGX_DISPATCHER_SESSION: "",
          CLAUDE_CODE_SESSION_ID: "",
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10000,
      },
    );
    const [out, err, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit, err).toBe(args[0] === "doctor" ? 1 : 0);
    return out;
  };
  expect(await invoke(["ls"])).toContain(
    "display-id ended tkt_model-layer row=",
  );
  expect(await invoke(["ls", "--wait", "display-id"])).toContain(
    "display-id ended tkt_model-layer row=",
  );
  const rows = jsonOf(z.array(z.object({ ticket: z.string() }))).safeParse(
    await invoke(["ls", "--json"]),
  );
  expect(rows.success).toBe(true);
  if (rows.success) expect(rows.data[0]?.ticket).toBe("model-layer");
  const finding = jsonOf(DoctorRecord).safeParse(
    (await invoke(["doctor"])).trim(),
  );
  expect(finding.success).toBe(true);
  if (!finding.success) return;
  expect(finding.data).toMatchObject({
    tool: "agx-worker",
    object: join(home, "display-id"),
    finding: "unjudged",
  });
});
