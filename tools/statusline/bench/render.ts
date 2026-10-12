#!/usr/bin/env bun
// Fixture benchmark for the render coordinator. No host probes or cache writes are used.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { err, ok } from "neverthrow";
import { ClaudeStatuslineInputSchema } from "../src/adapters/claude-statusline.ts";
import {
  buildDataframe,
  type BuildDataframeOptions,
} from "../src/build-dataframe.ts";
import { render } from "../src/format.ts";
import { jsonText } from "../src/zod.ts";

const here = import.meta.dir;
const fixturePath = resolve(here, "../tests/golden/fixture-0.json");
const sourceNames = [
  "identity",
  "agentName",
  "rcState",
  "repoState",
  "jobScan",
  "hostLoad",
  "routes",
  "dispatchWarning",
  "storage",
  "herdrReport",
  "codexRate",
  "jevUsage",
] as const;
type SourceName = (typeof sourceNames)[number];
const wall = new Map<SourceName, number[]>(
  sourceNames.map((name) => [name, []]),
);
const measure = <T>(name: SourceName, f: () => Promise<T>): Promise<T> => {
  const start = performance.now();
  return f().then((value) => {
    wall.get(name)?.push(performance.now() - start);
    return value;
  });
};
const fixtureText = await readFile(fixturePath, "utf8");
const json = jsonText.safeParse(fixtureText);
if (!json.success) {
  process.stderr.write(`invalid benchmark fixture JSON: ${fixturePath}\n`);
  process.exit(1);
}
const parsedFixture = ClaudeStatuslineInputSchema.safeParse(json.data);
if (!parsedFixture.success) {
  process.stderr.write(`invalid benchmark fixture shape: ${fixturePath}\n`);
  process.exit(1);
}
const fixture = parsedFixture.data;
const renders = Number(Bun.argv[2] ?? 100);
const wallMs: number[] = [];
const cpuMs: number[] = [];
const makeOptions = (): BuildDataframeOptions => ({
  sources: {
    identity: () =>
      measure("identity", () =>
        Promise.resolve({
          email: "fixture@example.test",
          accountWhy: "fixture",
          rlModel: [],
          modelCapsWhy: "fixture",
          wfOn: false,
        }),
      ),
    agentName: (sid, hint) =>
      measure("agentName", () => Promise.resolve(ok(hint ?? sid))),
    rcState: () => measure("rcState", () => Promise.resolve("unknown")),
    repoState: () =>
      measure("repoState", () =>
        Promise.resolve({ branch: "fixture", branchWhy: "fixture" }),
      ),
    jobScan: () =>
      measure("jobScan", () => Promise.resolve({ jobs: [], orphans: 0 })),
    hostLoad: () =>
      measure("hostLoad", () =>
        Promise.resolve({
          cpuPct: err("fixture n/a"),
          ram: err("fixture n/a"),
          vram: err("fixture n/a"),
        }),
      ),
    routes: () =>
      measure("routes", () => Promise.resolve(ok({ runs: [], unreadable: 0 }))),
    dispatchWarning: () =>
      measure("dispatchWarning", () => Promise.resolve("fixture warning")),
    storage: () => measure("storage", () => Promise.resolve(ok([]))),
    herdrReport: () => measure("herdrReport", () => Promise.resolve()),
    codexRate: () =>
      measure("codexRate", () => Promise.resolve(err("fixture n/a"))),
    jevUsage: () =>
      measure("jevUsage", () => Promise.resolve(err("fixture n/a"))),
  },
});
for (let i = 0; i < renders; i++) {
  const cpuStart = process.cpuUsage();
  const start = performance.now();
  const frame = await buildDataframe(fixture, makeOptions());
  render(frame);
  wallMs.push(performance.now() - start);
  const cpu = process.cpuUsage(cpuStart);
  cpuMs.push((cpu.user + cpu.system) / 1000);
}
const percentile = (values: number[], p: number): number => {
  const sorted = values.toSorted((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0
  );
};
const stats = (values: number[]) => ({
  p50_ms: +percentile(values, 0.5).toFixed(3),
  p95_ms: +percentile(values, 0.95).toFixed(3),
});
process.stdout.write(
  `${JSON.stringify({ fixture: fixturePath.split("/").at(-1), renders, render_wall: stats(wallMs), render_cpu: stats(cpuMs), source_wall: Object.fromEntries(sourceNames.map((name) => [name, stats(wall.get(name) ?? [])])) }, null, 2)}\n`,
);
