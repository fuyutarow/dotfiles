import { afterEach, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDataframe } from "../src/build-dataframe.ts";
import { readOwnerState, ownerStatePath } from "../src/owner-state.ts";
import {
  presentation,
  presentationPath,
  encodePresentation,
  type Presentation,
} from "../src/presentation.ts";
import { cleanSamplerLeftovers } from "../src/sampler.ts";
import { fleetLine } from "../src/fleet-line.ts";
import { renderField, observed } from "../src/field-state.ts";
import { modelName } from "../src/model-context.ts";
import { version } from "../package.json";

const roots: string[] = [];
const oldOwner = process.env["STATUSLINE_OWNER_STATE"];
const oldProc = process.env["STATUSLINE_PROC_ROOT"];
const oldXdg = process.env["XDG_STATE_HOME"];
afterEach(async () => {
  if (oldOwner === undefined) delete process.env["STATUSLINE_OWNER_STATE"];
  else process.env["STATUSLINE_OWNER_STATE"] = oldOwner;
  if (oldProc === undefined) delete process.env["STATUSLINE_PROC_ROOT"];
  else process.env["STATUSLINE_PROC_ROOT"] = oldProc;
  if (oldXdg === undefined) delete process.env["XDG_STATE_HOME"];
  else process.env["XDG_STATE_HOME"] = oldXdg;
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "statusline-step3-"));
  roots.push(root);
  process.env["STATUSLINE_OWNER_STATE"] = join(root, "owner.json");
  process.env["STATUSLINE_PROC_ROOT"] = join(root, "proc");
  await Promise.all(
    [101, 102].map((pid) =>
      mkdir(join(root, "proc", String(pid)), { recursive: true }),
    ),
  );
  await Promise.all(
    [101, 102].map((pid) =>
      writeFile(join(root, "proc", String(pid), "cmdline"), "fixture\0"),
    ),
  );
  await Promise.all(
    [101, 102].map((pid) =>
      writeFile(
        join(root, "proc", String(pid), "stat"),
        `${pid} (fixture) S ${Array.from({ length: 18 }, () => "0").join(" ")} 100\n`,
      ),
    ),
  );
  return root;
}

test("two live sessions render one location and one machine block; corrupt view uses last good with age", async () => {
  const root = await fixture();
  const at = Temporal.Now.instant().epochMilliseconds;
  const view: Presentation = {
    schema: 1,
    version,
    at,
    rows: [
      {
        cwd: root,
        location: "location @@STATUSLINE_TIME@@",
        sessions: [
          {
            id: "codex",
            pid: 101,
            process_generation: "100",
            line: "GPT-6.1-Sol | medium | Ctx: 21k | Session: codex",
          },
          {
            id: "claude",
            pid: 102,
            process_generation: "100",
            line: "Opus 5.5 | Session: claude",
          },
        ],
        shared:
          "Rate: sampled\nSys: CPU 42%\nJob: idle\nagx 0 workers\nworkers 0 running",
        runSource: { kind: "current", capturedAt: at },
      },
    ],
  };
  await writeFile(presentationPath(), encodePresentation(view));
  await writeFile(`${presentationPath()}.last-good`, encodePresentation(view));
  const output = await presentation(root);
  for (const label of ["location", "Rate:", "Sys:", "Job:", "agx", "workers 0"])
    expect(output?.split(label)).toHaveLength(2);
  expect(output?.split("Session:")).toHaveLength(3);
  expect(output).not.toContain("old");
  expect(output).not.toContain("@@STATUSLINE");
  // A selected session must rebuild its own actions instead of reusing repository counts.
  expect(await presentation(root, "codex")).toBeUndefined();
  await writeFile(presentationPath(), "broken");
  expect(await presentation(root)).toContain("samples 1s old");
  await rm(join(root, "proc/102/cmdline"));
  expect(await presentation(root)).toBeUndefined();
  const historical = encodePresentation(view).replace("\tactions-24h-v1", "");
  await writeFile(presentationPath(), historical);
  await writeFile(`${presentationPath()}.last-good`, historical);
  expect(await presentation(root)).toBeUndefined();
});

test("project XDG overrides cannot hide the host sampler; unreadable snapshot retains values across cold reads", async () => {
  const root = await fixture();
  process.env["XDG_STATE_HOME"] = join(root, "project/.state");
  delete process.env["STATUSLINE_OWNER_STATE"];
  expect(ownerStatePath()).toBe(
    join(process.env["HOME"] ?? "", ".local/state/statusline/owner.json"),
  );
  process.env["STATUSLINE_OWNER_STATE"] = join(root, "owner.json");
  const at = Temporal.Now.instant().epochMilliseconds - 65_000;
  await writeFile(
    `${ownerStatePath()}.last-good`,
    JSON.stringify({
      schema: 1,
      fields: {
        cpuPct: { at, value: { value: 42 } },
        ram: { at, value: { value: { pct: 50, frac: "1/2G" } } },
      },
    }),
  );
  await writeFile(ownerStatePath(), "");
  const frame = await buildDataframe(
    { cwd: root },
    { ownerSnapshot: readOwnerState() },
  );
  expect(frame.cpuPct.unwrapOr(-1)).toBe(42);
  expect(frame.ram.unwrapOr(undefined)?.pct).toBe(50);
  expect(frame.ownerAges?.["cpu"]).toBeGreaterThanOrEqual(65_000);
  expect((await readOwnerState())?.fields["cpuPct"]?.error).toBe(
    "owner snapshot unreadable",
  );
});

test("sampler removes its old atomic leftovers and preserves recent or foreign files", async () => {
  const root = await fixture();
  const old = join(root, "disk-rate.json.123.tmp");
  await writeFile(old, "");
  await utimes(old, 1, 1);
  await writeFile(join(root, "owner.json.456.tmp"), "active");
  await writeFile(join(root, "foreign.tmp"), "keep");
  await cleanSamplerLeftovers(root);
  expect(await readdir(root)).not.toContain("disk-rate.json.123.tmp");
  expect(await readFile(join(root, "owner.json.456.tmp"), "utf8")).toBe(
    "active",
  );
  expect(await readFile(join(root, "foreign.tmp"), "utf8")).toBe("keep");
});

test("display names, freshness, and actionable anomaly counts", () => {
  expect(modelName("gpt-6.1-sol", undefined)).toBe("GPT-6.1-Sol");
  expect(modelName(undefined, "gpt-6.1-sol")).toBe("GPT-6.1-Sol");
  expect(modelName("claude-opus-5-5", undefined)).toBe("Opus 5.5");
  expect(modelName("stdin-only", undefined)).toBe("stdin-only");
  expect(renderField("field", observed("fresh"))).toBe("fresh");
  expect(renderField("field", observed("old", undefined, 5))).not.toContain(
    "0s old",
  );
  const text = fleetLine({
    runs: [],
    unreadable: 0,
    findings: {
      capturedAt: Temporal.Now.instant().epochMilliseconds,
      lost: 24,
      kinds: {
        "outside-home": 261,
        unjudged: 343,
        orphaned: 24,
        legacy: 4,
        stale: 2,
        "accepted-landed-present": 3,
      },
    },
  });
  for (const historical of ["outside-home", "unjudged", "orphaned", "legacy"])
    expect(text).not.toContain(historical);
  expect(text).toContain("agx ws refresh 2");
  expect(text).toContain("agx ticket gc 3");
});
