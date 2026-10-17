import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agxSnapshotPath } from "../src/agx-snapshot.ts";
import { decodedJson } from "./decode.ts";
import { z } from "../src/zod.ts";

const CLI = join(import.meta.dir, "../../agx-run/src/next/cli.ts");
const SESSION = "worker-rows-dispatcher";
const VENDOR = "01a1111b-7dab-7d61-8f9b-231c4cc9082b";

test("worker snapshot uses doctor's classification and hides vendor sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "statusline-worker-rows-"));
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: root,
    TMPDIR: root,
    XDG_STATE_HOME: root,
    XDG_CACHE_HOME: root,
    XDG_CONFIG_HOME: root,
    AGX_STATE_DIR: root,
    AGX_NEXT_STATE_DIR: root,
    XDG_RUNTIME_DIR: root,
    AGX_DISPATCHER_SESSION: "",
    CLAUDE_CODE_SESSION_ID: "",
    CODEX_SESSION_ID: "",
  };
  const at = "2026-10-17T00:00:00Z";
  const clock = join(root, "fixed-clock.ts");
  await Bun.write(
    clock,
    `Temporal.Now.instant = () => Temporal.Instant.from(${JSON.stringify(at)});\n`,
  );
  const start = (id: string, modern: boolean, live = false) => {
    const pid = live ? process.pid : 0;
    return {
      kind: "started",
      id,
      at,
      ticket: id,
      writes: [],
      cwd: root,
      workspace: root,
      worker_name: id === "old-unit" ? "agx-x" : "agt_x",
      workspace_name: "ws_x",
      row: "terra-high",
      dispatcher_session: SESSION,
      vendor_session: VENDOR,
      pid,
      ...(modern ? { lease: { pid, start: null, unit: null } } : {}),
    };
  };
  const invoke = async (...args: string[]) => {
    const child = Bun.spawn([process.execPath, "--preload", clock, ...args], {
      env,
      cwd: root,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    });
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, exit };
  };
  await Bun.write(
    join(root, "records.jsonl"),
    [
      start("legacy-import", false),
      start("modern-lost", true),
      start("old-unit", true, true),
      start("new-unit", true, true),
      start("ended-lost", true),
      {
        kind: "ended",
        id: "ended-lost",
        at,
        exit: 1,
        outcome: "lost",
        report_path: null,
        vendor_session: VENDOR,
        returned: false,
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n") + "\n",
  );
  const listing = await invoke(CLI, "ls", "--json", "--summary");
  expect(listing.exit, listing.stderr).toBe(0);
  const doctor = await invoke(CLI, "doctor");
  expect(doctor.exit).toBe(1);
  expect(doctor.stdout).toContain("\tlegacy\t");
  expect(doctor.stdout).toContain("\tmissing-return\t");
  const doctorLost = doctor.stdout
    .split("\n")
    .filter((line) => line.includes("\torphaned\t")).length;
  expect(doctorLost).toBe(1);
  await Bun.write(
    agxSnapshotPath(env),
    JSON.stringify({
      output: listing.stdout,
      capturedAt: Temporal.Instant.from(at).epochMilliseconds,
      exit: 0,
      findings: {
        kinds: { orphaned: 1 },
        lost: doctorLost,
        capturedAt: Temporal.Instant.from(at).epochMilliseconds,
      },
    }),
  );
  // Run the readers and renderer under the same isolated environment as the CLI.
  // routeLines resolves dispatcher identity from process.env, not the scan's env argument.
  const renderer = join(root, "render.ts");
  await Bun.write(
    renderer,
    `
    import { agxRouteRunsAsync, routeLines } from ${JSON.stringify(join(import.meta.dir, "../src/dispatch-runs.ts"))};
    const scan = await agxRouteRunsAsync(process.env, ${JSON.stringify(SESSION)}, false);
    const lines = routeLines(scan.runs.map(run => ({ ...run, secs: 90 })), ${JSON.stringify(SESSION)}, scan.unreadable, scan.fleet);
    process.stdout.write(JSON.stringify({
      lines,
      sessions: scan.runs.filter(run => run.alive).map(run => run.workerSession),
    }));
  `,
  );
  const rendered = await invoke(renderer);
  expect(rendered.exit, rendered.stderr).toBe(0);
  const output = decodedJson(
    z.object({
      lines: z.array(z.string()),
      sessions: z.array(z.string()),
    }),
    rendered.stdout,
  );
  expect(output.sessions).toEqual([VENDOR, VENDOR]);
  const ansi = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "gu");
  const lines = output.lines.map((line) => line.replaceAll(ansi, ""));
  expect(lines[0]).toBe(`lost ${doctorLost}`);
  expect(lines.slice(1)).toHaveLength(2);
  expect(lines.slice(1).every((line) => line.includes("agt_x@ws_x"))).toBe(
    true,
  );
  expect(lines.join("\n")).not.toMatch(/01a1|082b|agx-x/u);
  expect(lines.join("\n")).toMatchSnapshot();
  await rm(root, { recursive: true, force: true });
});
