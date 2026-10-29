#!/usr/bin/env bun
import {
  readdir,
  readFile,
  readlink,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { z, jsonOf } from "@dotfiles/shared/src/zod.ts";

const WINDOW = 2000;
const uuid = z.uuid();
const rowSchema = z.object({
  dispatcher_session: z.string().nullable(),
  lease: z.object({ unit: z.string().nullable() }).nullable().optional(),
});
type Row = z.infer<typeof rowSchema>;
type Vendor = "claude" | "codex";
type Proc = {
  pid: number;
  parent: number;
  ticks: number;
  start: string;
  name: string;
  vendor?: Vendor;
  unit?: string;
  group: string;
};
type Sample = {
  processes: Map<number, Proc>;
  host: number;
  idle: number;
  cores: number;
  units: Map<string, number>;
};
export type Options = {
  proc: string;
  cgroup: string;
  home: string;
  hz: number;
  now: () => string;
  sleep: (ms: number) => Promise<void>;
  agx: string;
  timeout: number;
};
const defaults = (): Options => ({
  proc: "/proc",
  cgroup: "/sys/fs/cgroup",
  home: process.env["HOME"] ?? "",
  hz: 100,
  now: () => Temporal.Now.instant().toString(),
  sleep: (ms) => Bun.sleep(ms),
  agx: "agx",
  timeout: 15000,
});
const read = (path: string) => readFile(path, "utf8");
const optional = (path: string) => read(path).catch(() => "");
function vendorOf(args: string[]): Vendor | undefined {
  const first = basename(args[0] ?? "");
  const executable = /^(node|bun)$/u.test(first)
    ? basename(args[1] ?? "")
    : first;
  if (/^(claude|claude-code)(\.js)?$/u.test(executable)) return "claude";
  if (/^(codex|codex-cli)(\.js)?$/u.test(executable)) return "codex";
  return undefined;
}
async function sample(options: Options, rows: Row[]): Promise<Sample | null> {
  const [stat, names] = await Promise.all([
    read(join(options.proc, "stat")),
    readdir(options.proc),
  ]);
  const cpuLines = stat.split("\n");
  const totalLine = cpuLines.find((line) => line.startsWith("cpu "));
  if (totalLine === undefined) return null;
  const parsedTimes = z
    .array(z.number())
    .min(4)
    .safeParse(totalLine.trim().split(/\s+/u).slice(1).map(Number));
  if (!parsedTimes.success) return null;
  const times = parsedTimes.data;
  const host = times.slice(0, 8).reduce((a, b) => a + b, 0);
  const idle = (times[3] ?? 0) + (times[4] ?? 0);
  const processes = new Map<number, Proc>();
  await Promise.all(
    names
      .filter((name) => /^[1-9]\d*$/u.test(name))
      .map(async (name) => {
        const base = join(options.proc, name);
        const [s, command, groupText] = await Promise.all([
          optional(join(base, "stat")),
          optional(join(base, "cmdline")),
          optional(join(base, "cgroup")),
        ]);
        const close = s.lastIndexOf(")");
        if (close < 0) return;
        const fields = s
          .slice(close + 1)
          .trim()
          .split(/\s+/u);
        const parent = Number(fields[1]);
        const ticks = Number(fields[11]) + Number(fields[12]);
        const start = fields[19];
        if (
          !Number.isFinite(parent) ||
          !Number.isFinite(ticks) ||
          start === undefined
        )
          return;
        const args = command.split("\0").filter(Boolean);
        const group =
          groupText
            .split("\n")
            .find((line) => line.startsWith("0::"))
            ?.slice(3) ?? "";
        const unit = group
          .split("/")
          .findLast((part) => part.endsWith(".service"));
        const proc: Proc = {
          pid: Number(name),
          parent,
          ticks,
          start,
          name: basename(args[0] ?? s.slice(s.indexOf("(") + 1, close)),
          group,
        };
        const vendor = vendorOf(args);
        if (vendor !== undefined) proc.vendor = vendor;
        if (unit !== undefined) proc.unit = unit;
        processes.set(proc.pid, proc);
      }),
  );
  const groups = new Map<string, string>();
  for (const proc of processes.values()) {
    proc.group
      .split("/")
      .filter((value) => /^agt_.*\.service$/u.test(value))
      .forEach((part) => {
        groups.set(
          part,
          proc.group.slice(0, proc.group.indexOf(part) + part.length),
        );
      });
  }
  for (const row of rows) {
    const unit = row.lease?.unit;
    if (unit !== null && unit !== undefined && !groups.has(unit)) {
      // Standard user systemd slice, used when the unit has no visible process.
      const uid = process.getuid?.() ?? 1000;
      groups.set(
        unit,
        `user.slice/user-${uid}.slice/user@${uid}.service/app.slice/${unit}`,
      );
    }
  }
  const units = new Map<string, number>();
  await Promise.all(
    [...groups].map(async ([unit, group]) => {
      const raw = await optional(join(options.cgroup, group, "cpu.stat"));
      const match = /^usage_usec\s+(\d+)/mu.exec(raw);
      if (match?.[1] !== undefined) units.set(unit, Number(match[1]));
    }),
  );
  return {
    processes,
    host,
    idle,
    cores: cpuLines.filter((line) => /^cpu\d+\s/u.test(line)).length,
    units,
  };
}
const claudeFile = jsonOf(z.object({ sessionId: uuid }));
const rolloutMeta = jsonOf(
  z.object({
    type: z.literal("session_meta"),
    payload: z.object({ id: uuid.optional(), session_id: uuid.optional() }),
  }),
);
async function descriptorId(
  target: string,
  vendor: Vendor | undefined,
): Promise<string | undefined> {
  if (!target.endsWith(".jsonl")) return undefined;
  if (vendor === "claude") {
    const id = basename(target, ".jsonl");
    return uuid.safeParse(id).success && target.includes("/.claude/projects/")
      ? id
      : undefined;
  }
  if (!basename(target).startsWith("rollout-")) return undefined;
  const line = (await optional(target)).split("\n")[0] ?? "";
  const parsed = rolloutMeta.safeParse(line);
  if (!parsed.success) return undefined;
  return parsed.data.payload.id ?? parsed.data.payload.session_id;
}
async function sessionId(
  proc: Proc,
  options: Options,
): Promise<string | undefined> {
  if (proc.vendor === "claude") {
    const raw = await optional(
      join(options.home, ".claude", "sessions", `${proc.pid}.json`),
    );
    const parsed = claudeFile.safeParse(raw);
    if (parsed.success) return parsed.data.sessionId;
  }
  const fd = join(options.proc, String(proc.pid), "fd");
  const names = await readdir(fd).catch(() => []);
  const ids = new Set<string>();
  for (const name of names) {
    const target = await readlink(join(fd, name)).catch(() => "");
    const id = await descriptorId(target, proc.vendor);
    if (id !== undefined) ids.add(id);
  }
  return ids.size === 1 ? [...ids][0] : undefined;
}
async function workers(options: Options): Promise<Row[] | null> {
  return Promise.try(async () => {
    const child = Bun.spawn({
      cmd: [options.agx, "worker", "ls", "--json", "--running"],
      stdout: "pipe",
      stderr: "pipe",
      timeout: options.timeout,
    });
    const [out, , code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) return null;
    const parsed = jsonOf(
      z.union([z.array(rowSchema), z.object({ runs: z.array(rowSchema) })]),
    ).safeParse(out);
    if (!parsed.success) return null;
    return Array.isArray(parsed.data) ? parsed.data : parsed.data.runs;
  }).catch(() => null);
}
export async function produce(options: Options) {
  const rows = await workers(options);
  const first = await sample(options, rows ?? []);
  if (first === null) return null;
  await options.sleep(WINDOW);
  const second = await sample(options, rows ?? []);
  if (second === null) return null;
  const at = options.now();
  const agents = [...second.processes.values()].filter(
    (p) =>
      p.vendor !== undefined &&
      !p.group.split("/").some((s) => /^agt_.*\.service$/u.test(s)),
  );
  const usage = new Map<number, number>();
  const unowned = new Map<string, number>();
  for (const p of second.processes.values()) {
    const old = first.processes.get(p.pid);
    if (old === undefined || old.start !== p.start) continue;
    const pct =
      (((Math.max(0, p.ticks - old.ticks) / options.hz) * 1000) / WINDOW) * 100;
    if (p.group.split("/").some((s) => /^agt_.*\.service$/u.test(s))) continue;
    let ancestor: Proc | undefined = p;
    const seen = new Set<number>();
    while (
      ancestor !== undefined &&
      ancestor.vendor === undefined &&
      !seen.has(ancestor.pid)
    ) {
      seen.add(ancestor.pid);
      ancestor = second.processes.get(ancestor.parent);
    }
    if (ancestor?.vendor !== undefined)
      usage.set(ancestor.pid, (usage.get(ancestor.pid) ?? 0) + pct);
    else {
      const label = p.unit ?? `${p.parent === 1 ? "orphan:" : ""}${p.name}`;
      unowned.set(label, (unowned.get(label) ?? 0) + pct);
    }
  }
  const sessions: {
    session_id: string;
    vendor: Vendor;
    pid: number;
    cpu_pct: number;
    workers: { count: number; cpu_pct: number } | null;
  }[] = [];
  const unresolved_agents: { pid: number; vendor: Vendor; cpu_pct: number }[] =
    [];
  for (const agent of agents) {
    if (agent.vendor === undefined) continue;
    const id = await sessionId(agent, options);
    const base = {
      pid: agent.pid,
      vendor: agent.vendor,
      cpu_pct: Math.round(usage.get(agent.pid) ?? 0),
    };
    if (id === undefined) {
      unresolved_agents.push(base);
      continue;
    }
    const owned = rows?.filter((row) => row.dispatcher_session === id);
    const unitNames = new Set(
      owned
        ?.map((row) => row.lease?.unit)
        .flatMap((unit) => (unit === null || unit === undefined ? [] : [unit])),
    );
    let micros = 0;
    for (const unit of unitNames)
      micros += Math.max(
        0,
        (second.units.get(unit) ?? 0) - (first.units.get(unit) ?? 0),
      );
    sessions.push({
      session_id: id,
      ...base,
      workers:
        owned === undefined
          ? null
          : {
              count: owned.length,
              cpu_pct: Math.round((micros / (WINDOW * 1000)) * 100),
            },
    });
  }
  return {
    schema: 1,
    at,
    window_ms: WINDOW,
    host: {
      cpu_pct: Math.round(
        (((Math.max(0, second.host - first.host - (second.idle - first.idle)) /
          options.hz) *
          1000) /
          WINDOW) *
          100,
      ),
      cores: second.cores,
    },
    agx: rows === null ? "unavailable" : "ok",
    sessions,
    unresolved_agents,
    unowned: [...unowned]
      .map(([label, value]) => ({ label, cpu_pct: Math.round(value) }))
      .filter((row) => row.cpu_pct >= 5)
      .toSorted((a, b) => b.cpu_pct - a.cpu_pct)
      .slice(0, 3),
  };
}
export async function run(
  out: string,
  options: Options,
  stdout: (s: string) => void = (s) => process.stdout.write(s),
  replace: typeof rename = rename,
) {
  let temp: string | undefined;
  return Promise.try(async () => {
    const document = await produce(options);
    if (document === null) {
      process.stderr.write("agent-cpu: invalid /proc/stat\n");
      return 1;
    }
    const data = `${JSON.stringify(document)}\n`;
    temp = join(dirname(out), `.${basename(out)}.${crypto.randomUUID()}.tmp`);
    await writeFile(temp, data, { flag: "wx" });
    await replace(temp, out);
    temp = undefined;
    stdout(data);
    return 0;
  }).catch(async (error: unknown) => {
    if (temp !== undefined) await unlink(temp).catch(() => {});
    process.stderr.write(`agent-cpu: ${String(error)}\n`);
    return 1;
  });
}
async function main() {
  if (process.platform !== "linux") {
    process.stderr.write("agent-cpu: unsupported platform\n");
    return 1;
  }
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--out" || args[1] === undefined) {
    process.stderr.write("usage: agent-cpu --out <path>\n");
    return 1;
  }
  const options = defaults();
  const tick = Bun.spawn({
    cmd: ["getconf", "CLK_TCK"],
    stdout: "pipe",
    stderr: "ignore",
    timeout: 2000,
  });
  const [output, code] = await Promise.all([
    new Response(tick.stdout).text(),
    tick.exited,
  ]);
  const hz = Number(output.trim());
  if (code !== 0 || !Number.isFinite(hz) || hz <= 0) {
    process.stderr.write("agent-cpu: cannot determine clock ticks\n");
    return 1;
  }
  options.hz = hz;
  return run(args[1], options);
}
if (import.meta.main)
  process.exitCode = await main().catch((error: unknown) => {
    process.stderr.write(`agent-cpu: ${String(error)}\n`);
    return 1;
  });
