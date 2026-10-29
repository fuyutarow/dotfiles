import { basename, join } from "node:path";
import { cpus } from "node:os";
import { readFile } from "node:fs/promises";
import {
  claudeFile,
  descriptorId,
  vendorOf,
  workers,
  type Options,
  type Row,
} from "./agent-cpu.ts";

type Process = {
  pid: number;
  parent: number;
  start: string;
  seconds: number;
  rss: number;
  name: string;
  vendor?: "claude" | "codex";
};
async function command(cmd: string[]): Promise<string | null> {
  return Promise.try(async () => {
    const child = Bun.spawn({
      cmd,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    const [out, , code] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    return code === 0 ? out : null;
  }).catch(() => null);
}
function seconds(value: string): number {
  const parts = value.split(":").map(Number);
  return parts.reduce((a, b) => a * 60 + b, 0);
}
export function parsePs(raw: string): Map<number, Process> {
  const result = new Map<number, Process>();
  for (const line of raw.split("\n")) {
    const m =
      /^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(\S+)\s+(\d+)\s+(.+)$/u.exec(
        line,
      );
    if (m === null) continue;
    const [, pid, parent, start, time, rss, args] = m;
    if (
      pid === undefined ||
      parent === undefined ||
      start === undefined ||
      time === undefined ||
      rss === undefined ||
      args === undefined
    )
      continue;
    const elapsed = seconds(time);
    if (!Number.isFinite(elapsed)) continue;
    const argv = args.trim().split(/\s+/u);
    const vendor = vendorOf(argv);
    result.set(Number(pid), {
      pid: Number(pid),
      parent: Number(parent),
      start,
      seconds: elapsed,
      rss: Number(rss) * 1024,
      name: basename(argv[0] ?? ""),
      ...(vendor === undefined ? {} : { vendor }),
    });
  }
  return result;
}
async function idOf(p: Process, options: Options): Promise<string | undefined> {
  if (p.vendor === "claude") {
    const raw = await readFile(
      join(options.home, ".claude/sessions", `${p.pid}.json`),
      "utf8",
    ).catch(() => "");
    const parsed = claudeFile.safeParse(raw);
    if (parsed.success) return parsed.data.sessionId;
  }
  const raw = await command([
    options.lsof ?? "lsof",
    "-Fn",
    "-p",
    String(p.pid),
  ]);
  const ids = new Set<string>();
  for (const line of (raw ?? "").split("\n")) {
    if (!line.startsWith("n/")) continue;
    const id = await descriptorId(line.slice(1), p.vendor);
    if (id !== undefined) ids.add(id);
  }
  return ids.size === 1 ? [...ids][0] : undefined;
}
function memory(raw: string, totalRaw: string) {
  const page = /page size of (\d+) bytes/u.exec(raw)?.[1];
  const free = /^Pages free:\s+(\d+)/mu.exec(raw)?.[1];
  const inactive = /^Pages inactive:\s+(\d+)/mu.exec(raw)?.[1];
  const speculative = /^Pages speculative:\s+(\d+)/mu.exec(raw)?.[1];
  const total = Number(totalRaw.trim());
  if (
    page === undefined ||
    free === undefined ||
    inactive === undefined ||
    speculative === undefined ||
    !Number.isSafeInteger(total) ||
    total <= 0
  )
    return null;
  const available =
    (Number(free) + Number(inactive) + Number(speculative)) * Number(page);
  return { ram_bytes: Math.max(0, total - available), ram_total_bytes: total };
}
function ownership(
  p: Process,
  processes: Map<number, Process>,
  roots: Map<number, Row>,
) {
  let ancestor: Process | undefined = p;
  let agent: Process | undefined;
  const seen = new Set<number>();
  while (ancestor !== undefined && !seen.has(ancestor.pid)) {
    seen.add(ancestor.pid);
    const worker = roots.get(ancestor.pid);
    if (worker !== undefined) return { worker, agent };
    if (agent === undefined && ancestor.vendor !== undefined) agent = ancestor;
    ancestor = processes.get(ancestor.parent);
  }
  return { worker: undefined, agent };
}
export async function produceMac(options: Options) {
  const rows = await workers(options);
  const sample = async () =>
    command([
      options.ps ?? "ps",
      "-axo",
      "pid=,ppid=,lstart=,time=,rss=,command=",
    ]);
  const firstRaw = await sample();
  if (firstRaw === null) return null;
  const first = parsePs(firstRaw);
  await options.sleep(2000);
  const secondRaw = await sample();
  if (secondRaw === null) return null;
  const second = parsePs(secondRaw);
  if (first.size === 0 || second.size === 0) return null;
  const at = options.now();
  const [vm, total] = await Promise.all([
    command([options.vmstat ?? "vm_stat"]),
    command([options.sysctl ?? "sysctl", "-n", "hw.memsize"]),
  ]);
  const ram = memory(vm ?? "", total ?? "");
  if (ram === null) return null;
  const workerRoots = new Map<number, Row>();
  for (const row of rows ?? []) {
    const pid = row.lease?.pid;
    if (pid !== null && pid !== undefined && pid > 0 && second.has(pid))
      workerRoots.set(pid, row);
  }
  const usage = new Map<number, number>();
  const rss = new Map<number, number>();
  const workerCpu = new Map<Row, number>();
  const workerRam = new Map<Row, number>();
  const other = new Map<string, { cpu: number; ram: number }>();
  let hostCpu = 0;
  for (const p of second.values()) {
    const old = first.get(p.pid);
    const cpu =
      old !== undefined && old.start === p.start
        ? Math.max(0, p.seconds - old.seconds) * 50
        : 0;
    hostCpu += cpu;
    const { worker, agent } = ownership(p, second, workerRoots);
    if (worker !== undefined) {
      workerCpu.set(worker, (workerCpu.get(worker) ?? 0) + cpu);
      workerRam.set(worker, (workerRam.get(worker) ?? 0) + p.rss);
    } else if (agent !== undefined) {
      usage.set(agent.pid, (usage.get(agent.pid) ?? 0) + cpu);
      rss.set(agent.pid, (rss.get(agent.pid) ?? 0) + p.rss);
    } else {
      const label = `${p.parent === 1 ? "orphan:" : ""}${p.name}`;
      const value = other.get(label) ?? { cpu: 0, ram: 0 };
      value.cpu += cpu;
      value.ram += p.rss;
      other.set(label, value);
    }
  }
  const sessions = [];
  const unresolved_agents = [];
  for (const p of second.values()) {
    if (p.vendor === undefined) continue;
    if (ownership(p, second, workerRoots).worker !== undefined) continue;
    const base = {
      pid: p.pid,
      vendor: p.vendor,
      cpu_pct: Math.round(usage.get(p.pid) ?? 0),
      ram_bytes: rss.get(p.pid) ?? 0,
      vram_bytes: null,
    };
    const id = await idOf(p, options);
    if (id === undefined) {
      unresolved_agents.push(base);
      continue;
    }
    const owned = rows?.filter((row) => row.dispatcher_session === id);
    sessions.push({
      session_id: id,
      ...base,
      workers:
        owned === undefined
          ? null
          : {
              count: owned.length,
              cpu_pct: Math.round(
                owned.reduce((n, row) => n + (workerCpu.get(row) ?? 0), 0),
              ),
              ram_bytes: owned.reduce(
                (n, row) => n + (workerRam.get(row) ?? 0),
                0,
              ),
              vram_bytes: null,
            },
    });
  }
  return {
    schema: 2,
    at,
    window_ms: 2000,
    host: {
      cpu_pct: Math.round(hostCpu),
      cores: cpus().length,
      ...ram,
      vram_bytes: null,
      vram_total_bytes: null,
    },
    agx: rows === null ? "unavailable" : "ok",
    sessions,
    unresolved_agents,
    unowned: [...other]
      .map(([label, value]) => ({
        label,
        cpu_pct: Math.round(value.cpu),
        ram_bytes: value.ram,
      }))
      .filter((v) => v.cpu_pct >= 5)
      .toSorted((a, b) => b.cpu_pct - a.cpu_pct)
      .slice(0, 3),
  };
}
