#!/usr/bin/env bun
import { cli as cleyeCli } from "cleye";
import { mkdir, rename } from "node:fs/promises";
import { release } from "node:os";
import { isAbsolute, join } from "node:path";
import { attempt } from "@dotfiles/shared/src/attempt.ts";
import { standardCli } from "@dotfiles/shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import {
  FleetSessionSchema,
  FleetSessionUnavailableSchema,
  readFleetSession,
  codexRolloutPath,
  readCodexNativeSession,
  writeFleetSessionIfChanged,
  type FleetSession,
  type FleetSessionRead,
} from "@dotfiles/shared/src/fleet-session.ts";
import {
  readCodexNativeTitle,
  type CodexNativeTitleRead,
} from "@dotfiles/shared/src/codex-native-title.ts";
import { usageLevel } from "@dotfiles/shared/src/usage-level.ts";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";

const argv = process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, () => argv);
export const AgentSchema = z.object({
  agent: z.string().optional(),
  pane_id: z.string().optional(),
  tab_id: z.string().optional(),
  agent_session: z
    .object({
      value: z.string().optional(),
      source: z.string().optional(),
      kind: z.string().optional(),
      agent: z.string().optional(),
    })
    .nullish(),
  cwd: z.string().optional(),
  terminal_title_stripped: z.string().optional(),
  tokens: z.record(z.string(), z.string()).nullish(),
});
const ListSchema = z.object({
  result: z.object({ agents: z.array(AgentSchema) }),
});
const AgentCpuSchemaV1 = z.object({
  schema: z.literal(1),
  at: z.iso.datetime(),
  window_ms: z.number().int().positive(),
  host: z.object({ cpu_pct: z.number(), cores: z.number().int().positive() }),
  agx: z.enum(["ok", "unavailable"]),
  sessions: z.array(
    z.object({
      session_id: z.string(),
      vendor: z.enum(["claude", "codex"]),
      pid: z.number().int(),
      cpu_pct: z.number(),
      workers: z
        .object({ count: z.number().int().nonnegative(), cpu_pct: z.number() })
        .nullable(),
    }),
  ),
  unresolved_agents: z.array(
    z.object({
      pid: z.number().int(),
      vendor: z.enum(["claude", "codex"]),
      cpu_pct: z.number(),
    }),
  ),
  unowned: z.array(z.object({ label: z.string(), cpu_pct: z.number() })),
});
const bytes = z.number().int().nonnegative();
const AgentCpuSchemaV2 = AgentCpuSchemaV1.extend({
  schema: z.literal(2),
  host: AgentCpuSchemaV1.shape.host.extend({
    ram_bytes: bytes,
    ram_total_bytes: bytes,
    vram_bytes: bytes.nullable(),
    vram_total_bytes: bytes.nullable(),
  }),
  sessions: z.array(
    AgentCpuSchemaV1.shape.sessions.element.extend({
      ram_bytes: bytes,
      vram_bytes: bytes.nullable(),
      workers: z
        .object({
          count: z.number().int().nonnegative(),
          cpu_pct: z.number(),
          ram_bytes: bytes,
          vram_bytes: bytes.nullable(),
        })
        .nullable(),
    }),
  ),
  unresolved_agents: z.array(
    AgentCpuSchemaV1.shape.unresolved_agents.element.extend({
      ram_bytes: bytes,
      vram_bytes: bytes.nullable(),
    }),
  ),
  unowned: z.array(
    AgentCpuSchemaV1.shape.unowned.element.extend({ ram_bytes: bytes }),
  ),
});
const AgentCpuSchema = z.discriminatedUnion("schema", [
  AgentCpuSchemaV1,
  AgentCpuSchemaV2,
]);
const HERDR_TIMEOUT_MS = 2500;
type AgentCpuSnapshot = z.output<typeof AgentCpuSchema>;
type Agent = z.output<typeof AgentSchema>;
type PaneProcessIds = { pids: number[]; ancestorPids: number[][] };
type PaneTitleBinding = { sessionId: string; title: CodexNativeTitleRead };
const PaneProcessInfo = jsonOf(
  z.object({
    result: z.object({
      process_info: z.object({
        foreground_processes: z.array(
          z.object({ pid: z.number().int().positive(), name: z.string() }),
        ),
      }),
    }),
  }),
);

function descendants(
  roots: number[],
  children: Map<number, number[]>,
): number[] {
  const seen = new Set(roots);
  const queue = [...roots];
  for (let i = 0; i < queue.length; i++) {
    for (const child of (children.get(queue[i] ?? 0) ?? []).filter(
      (pid) => !seen.has(pid),
    )) {
      seen.add(child);
      queue.push(child);
    }
  }
  return queue;
}

export async function paneResourcePids(
  agents: Agent[],
  read: (pane: string) => Promise<string | undefined>,
  parents: string,
): Promise<Map<string, PaneProcessIds>> {
  const children = new Map<number, number[]>();
  const parentByPid = new Map<number, number>();
  for (const line of parents.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/u.exec(line);
    if (match === null) continue;
    const pid = Number(match[1]);
    const parent = Number(match[2]);
    parentByPid.set(pid, parent);
    children.set(parent, [...(children.get(parent) ?? []), pid]);
  }
  const entries = await Promise.all(
    agents.flatMap((agent) => {
      if (
        agent.pane_id === undefined ||
        (agent.agent !== "claude" && agent.agent !== "codex")
      )
        return [];
      const pane = agent.pane_id;
      return [
        (async () => {
          const info = PaneProcessInfo.safeParse(await read(pane));
          const roots =
            info.data?.result.process_info.foreground_processes.map(
              (p) => p.pid,
            ) ?? [];
          const ancestorPids = roots.map((root) => {
            const ancestors = [root];
            const seen = new Set(ancestors);
            let current = root;
            while (parentByPid.has(current)) {
              const parent = parentByPid.get(current);
              if (parent === undefined || seen.has(parent)) break;
              ancestors.push(parent);
              seen.add(parent);
              current = parent;
            }
            return ancestors;
          });
          return [
            pane,
            { pids: descendants(roots, children), ancestorPids },
          ] as const;
        })(),
      ];
    }),
  );
  return new Map(entries);
}

/**
 * Always GiB, never hundredths: below 0.1G folds to `<0.1G`; from 0.1G to below 10G one decimal
 * place; 10G and above a whole number. The floor is tested on the raw value, before rounding, so
 * 0.0995 folds instead of rounding up to 0.1G. A tenths value that rounds to 10.0 reads as the
 * whole-number form (9.96 → 10G), never as 10.0G.
 */
function formatMemory(byteCount: number): string {
  const gib = byteCount / 1024 ** 3;
  if (gib < 0.1) return "<0.1G";
  const tenths = Math.round(gib * 10);
  if (tenths < 100) return `${(tenths / 10).toFixed(1)}G`;
  return `${Math.round(gib)}G`;
}

/** herdr joins adjacent sidebar tokens with this separator; it is not ours to shorten. */
const HERDR_TOKEN_SEPARATOR = " · ";
export const CPU_TOKENS = ["cpu_lo", "cpu_mid", "cpu_hi"] as const;
export type CpuToken = (typeof CPU_TOKENS)[number];
/** A count is painted by which of its two tokens is reported: `_on` for a count of 1 or more. */
export const WORKER_TOKENS = ["workers_on", "workers_off"] as const;
export const SHELL_TOKENS = ["shells_on", "shells_off"] as const;
export type CountTokenName =
  | (typeof WORKER_TOKENS)[number]
  | (typeof SHELL_TOKENS)[number];
export type ResourceTokens = {
  /** The cpu reading as its own token so herdr can style it; absent when cpu is unknown. */
  cpu?: { token: CpuToken; text: string };
  /**
   * Row 3's grey `ram` token: `ram X[ vram Y]`, no bar after it (herdr's " · " already separates
   * the tokens). A cpu reading that is unknown ("cpu ?") stays here, first. Absent when nothing of
   * it is reported.
   */
  ram?: string;
  /** `N wkr`; `workers_on` (cyan in herdr/config.toml) when N >= 1, else `workers_off` (grey), `?` is off. */
  workers?: { token: (typeof WORKER_TOKENS)[number]; text: string };
  /** `M sh`; `shells_on` (cyan) when M >= 1, else `shells_off` (grey), `?` is off. */
  shells?: { token: (typeof SHELL_TOKENS)[number]; text: string };
};

/** Exactly one name of a paired set is reported; the others are cleared so nothing lingers. */
function oneOfTokenArgs(
  names: readonly string[],
  chosen: { token: string; text: string } | undefined,
): string[] {
  return names.flatMap((name) =>
    chosen?.token === name
      ? ["--token", `${name}=${chosen.text}`]
      : ["--clear-token", name],
  );
}

/** Exactly one cpu_* token is reported; the other two are cleared. */
export function cpuTokenArgs(cpu: ResourceTokens["cpu"]): string[] {
  return oneOfTokenArgs(CPU_TOKENS, cpu);
}

/** The `ram` token is reported or cleared; each count reports one of its pair and clears the other. */
export function resourceTokenArgs(tokens: ResourceTokens): string[] {
  return [
    ...cpuTokenArgs(tokens.cpu),
    ...(tokens.ram === undefined
      ? ["--clear-token", "ram"]
      : ["--token", `ram=${tokens.ram}`]),
    ...oneOfTokenArgs(WORKER_TOKENS, tokens.workers),
    ...oneOfTokenArgs(SHELL_TOKENS, tokens.shells),
  ];
}

/**
 * The tokens joined as the sidebar draws them: herdr puts its own separator between every pair of
 * visible tokens, and that separator cannot be changed.
 */
export function row3VisibleText(tokens: ResourceTokens): string {
  return [
    tokens.cpu?.text,
    tokens.ram,
    tokens.workers?.text,
    tokens.shells?.text,
  ]
    .filter((text) => text !== undefined)
    .join(HERDR_TOKEN_SEPARATOR);
}

/**
 * One row part. `key` names it in the drop order; `side` says which token it belongs to: `ram`
 * parts (an unknown cpu, ram, vram) form the `ram` token, `workers` and `shells` parts are the
 * count tokens. `count` is the number a count part shows. There is no bar between memory and
 * counts: herdr draws its own " · " between the tokens, so the row reads
 * `cpu 21% · ram 0.3G · 1 wkr · 0 sh`.
 */
type RowPart = {
  key: string;
  text: string;
  side: "ram" | "workers" | "shells";
  count?: number;
};
/** Parts inside the ram token are separated by one space. */
const PART_SEPARATOR = " ";

/** The ram text and the count parts of the kept parts, before they become tokens. */
function layoutParts(parts: RowPart[]): {
  ram: string | undefined;
  workers: RowPart | undefined;
  shells: RowPart | undefined;
} {
  const head = parts
    .filter((part) => part.side === "ram")
    .map((part) => part.text)
    .join(PART_SEPARATOR);
  return {
    ram: head === "" ? undefined : head,
    workers: parts.find((part) => part.side === "workers"),
    shells: parts.find((part) => part.side === "shells"),
  };
}

/**
 * Fit rule for row 3: whole parts are removed, never cut inside a part. Parts are removed in
 * `dropOrder` (first key goes first) until the row fits `width` as the sidebar draws it, which is
 * the cpu text (if any) and the ram and count tokens with herdr's separator between each pair of
 * them. If none fits, no token but cpu is reported and nothing is cut.
 */
function fitParts(
  parts: RowPart[],
  width: number,
  dropOrder: readonly string[],
  cpuText: string | undefined,
): ReturnType<typeof layoutParts> {
  let kept = parts;
  for (const key of [undefined, ...dropOrder]) {
    if (key !== undefined) kept = kept.filter((part) => part.key !== key);
    const layout = layoutParts(kept);
    const texts = [
      cpuText,
      layout.ram,
      layout.workers?.text,
      layout.shells?.text,
    ].filter((text) => text !== undefined);
    const drawn =
      texts.reduce((sum, text) => sum + text.length, 0) +
      HERDR_TOKEN_SEPARATOR.length * Math.max(0, texts.length - 1);
    if (drawn <= width) return layout;
  }
  return { ram: undefined, workers: undefined, shells: undefined };
}

/**
 * Row 3 drops whole parts from the right, so the priority is the reverse of the on-screen order:
 * vram first, then shells, then workers. ram and cpu are never in this list.
 */
const RESOURCE_DROP_ORDER = ["vram", "shells", "workers"] as const;

/**
 * Default row width for row 3, in sidebar columns: the text width herdr gives an agent row at the
 * 48-column sidebar (herdr/config.toml ui.sidebar_width = sidebar_max_width = 48), so 44 = 48 - 4.
 * The 4 columns of non-text overhead come from herdr v0.9.5 source (github.com/herdrdev/herdr):
 *   - 1 column: the sidebar's right-hand divider. `expanded_sidebar_sections` in src/ui/sidebar.rs
 *     lays content out in `area.width.saturating_sub(1)` columns.
 *   - 3 columns: row 3's indent. `render_agent_row` in src/client/shell/agent_sidebar.rs prefixes
 *     every row after the first with 3 spaces (the first row gets 1) and passes
 *     `rect.width - indent` as the token width.
 * Not counted: the agent list's 1-column scrollbar, which only appears while the list overflows
 * (`show_scrollbar` in `render_agent_list`); a scrolling sidebar has 35 text columns.
 * Change this together with ui.sidebar_width.
 */
export const ROW3_FIT_WIDTH = 44;

/**
 * The sidebar has three rows for an agent: row 3 is four tokens. `cpu NN%` is chosen by load level
 * (thresholds from tools/shared) so herdr/config.toml can color it; the grey `ram X[ vram Y]`;
 * `N wkr` and `M sh` are each reported as an `_on` token (cyan) when the count is 1 or more and as
 * an `_off` token (grey) otherwise, so herdr/config.toml colors them without rules. herdr draws
 * its own " · " between the tokens and there is no bar, so the row reads
 * `cpu 21% · ram 0.3G · 1 wkr · 0 sh`. Unknown counts read `? wkr` and `? sh` (grey). vram appears
 * only when reported as a non-zero value: a session that uses no vram reports 0, which is treated
 * as not reported. `width` bounds the row as drawn, including herdr's separators.
 */
export function resourceTokens(
  workers: number | undefined,
  cpu: number | undefined,
  ram: number | undefined,
  vram: number | undefined,
  shells: number | undefined,
  width = ROW3_FIT_WIDTH,
): ResourceTokens {
  const parts: RowPart[] = [
    ...(cpu === undefined
      ? [{ key: "cpu", text: "cpu ?", side: "ram" as const }]
      : []),
    ...(ram === undefined
      ? []
      : [
          {
            key: "ram",
            text: `ram ${formatMemory(ram)}`,
            side: "ram" as const,
          },
        ]),
    ...(vram === undefined || vram === 0
      ? []
      : [
          {
            key: "vram",
            text: `vram ${formatMemory(vram)}`,
            side: "ram" as const,
          },
        ]),
    {
      key: "workers",
      text: `${workers ?? "?"} wkr`,
      side: "workers",
      ...(workers === undefined ? {} : { count: workers }),
    },
    {
      key: "shells",
      text: `${shells ?? "?"} sh`,
      side: "shells",
      ...(shells === undefined ? {} : { count: shells }),
    },
  ];
  const cpuText = cpu === undefined ? undefined : `cpu ${cpu}%`;
  const layout = fitParts(parts, width, RESOURCE_DROP_ORDER, cpuText);
  const tokens: ResourceTokens = {};
  if (cpu !== undefined && cpuText !== undefined)
    tokens.cpu = {
      token: `cpu_${usageLevel(Math.round(cpu))}`,
      text: cpuText,
    };
  if (layout.ram !== undefined) tokens.ram = layout.ram;
  if (layout.workers !== undefined)
    tokens.workers = {
      token: (layout.workers.count ?? 0) >= 1 ? "workers_on" : "workers_off",
      text: layout.workers.text,
    };
  if (layout.shells !== undefined)
    tokens.shells = {
      token: (layout.shells.count ?? 0) >= 1 ? "shells_on" : "shells_off",
      text: layout.shells.text,
    };
  return tokens;
}

/** Native session_index is an append log: a rename adds a newer exact-ID row. */
export async function readProjectorTitle(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CodexNativeTitleRead> {
  const strict = await readCodexNativeTitle(id, env);
  if (
    strict.kind === "known" ||
    strict.reason !== "session ID is duplicated in index"
  )
    return strict;
  const path = join(
    env["CODEX_HOME"] ?? join(env["HOME"] ?? "", ".codex"),
    "session_index.jsonl",
  );
  const file = Bun.file(path);
  if (file.size > 2 * 1024 * 1024) return strict;
  const text = await file.text().catch(() => "");
  const Row = z.object({
    id: z.string(),
    thread_name: z.string().min(1).max(512),
    updated_at: z.iso.datetime(),
  });
  const rows = [];
  for (const line of text.trimEnd().split("\n")) {
    const parsed = jsonOf(Row).safeParse(line);
    if (!parsed.success) return strict;
    if (parsed.data.id === id) rows.push(parsed.data);
  }
  rows.sort((a, b) => Temporal.Instant.compare(b.updated_at, a.updated_at));
  const latest = rows[0];
  if (latest === undefined || latest.thread_name.trim().length === 0)
    return strict;
  for (const character of latest.thread_name) {
    const point = character.codePointAt(0) ?? 0;
    if (
      point <= 31 ||
      (point >= 127 && point <= 159) ||
      point === 0x2028 ||
      point === 0x2029
    )
      return strict;
  }
  if (
    rows.some(
      (row) =>
        row.updated_at === latest.updated_at &&
        row.thread_name !== latest.thread_name,
    )
  )
    return strict;
  return {
    kind: "known",
    sessionId: id,
    displayTitle: latest.thread_name,
    sourceUpdatedAt: latest.updated_at,
    observedAt: Temporal.Now.instant().toString(),
  };
}
const RegisteredCodexSchema = z.object({
  source: z.literal("herdr:codex"),
  kind: z.literal("id"),
  agent: z.literal("codex"),
  value: z.string().regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u),
});

async function run(
  command: string,
  args: string[],
  timeoutMs = HERDR_TIMEOUT_MS,
): Promise<string | undefined> {
  const bin = Bun.which(command);
  if (bin === null) return undefined;
  const child = Bun.spawn([bin, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  const [output, code] = await Promise.all([
    boundedOutput(child.stdout),
    child.exited,
  ]);
  return code === 0 ? output : undefined;
}

async function boundedOutput(
  stream: ReadableStream<Uint8Array>,
): Promise<string | undefined> {
  const result = await attempt(async (): Promise<string | undefined> => {
    const reader = stream.getReader();
    using _release = {
      [Symbol.dispose]: () => {
        reader.releaseLock();
      },
    };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) return Buffer.concat(chunks).toString("utf8");
      size += next.value.length;
      if (size > 1024 * 1024) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(next.value);
    }
  });
  return result.ok ? result.value : undefined;
}

export async function readAgentCpu(
  env: NodeJS.ProcessEnv = process.env,
  now = Temporal.Now.instant().epochMilliseconds,
): Promise<AgentCpuSnapshot | undefined> {
  const state =
    env["XDG_STATE_HOME"] === undefined || env["XDG_STATE_HOME"] === ""
      ? join(env["HOME"] ?? "", ".local", "state")
      : env["XDG_STATE_HOME"];
  const text = await Bun.file(join(state, "dotfiles", "agent-cpu.json"))
    .text()
    .catch(() => "");
  const parsed = jsonOf(AgentCpuSchema).safeParse(text);
  if (
    !parsed.success ||
    now - Temporal.Instant.from(parsed.data.at).epochMilliseconds > 180_000
  )
    return undefined;
  return parsed.data;
}

/** Only the complete penultimate native status row, followed by native shortcuts.
 * The caller requests the visible viewport, never conversation history.
 */
export function nativeFooterObservation(text: string):
  | {
      id: string;
      model: string;
      effort: string;
      cwd: string;
      state: string;
    }
  | undefined {
  if (text.length > 8192 || text.includes("\u001B")) return undefined;
  const rows = text.trimEnd().split(/\r?\n/u);
  if (rows.length > 5 || rows.length < 2) return undefined;
  const controls = rows.at(-1)?.trim() ?? "";
  const shortcuts =
    /^(?:← for agents · \? for shortcuts(?:[ \t]+⚠ [1-9]\d* warnings? · f2 to view)?|⚠ [1-9]\d* warnings? · f2 to view)$/u;
  const selection =
    /^New activity · (?:Earlier messages available\.[ \t]+)?\^c copy · enter copy & follow · esc clear$/u;
  if (!shortcuts.test(controls) && !selection.test(controls)) return undefined;
  const shape =
    /^\s*([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}) · (GPT-[A-Za-z0-9.-]+) (minimal|low|medium|high|xhigh|max|ultra) · ((?:\/|~)[^·\r\n]*) · (Working|Ready|Idle|Done|Blocked)(?: · Main \[default\])?\s*$/u;
  const matches = rows.flatMap((row) => shape.exec(row)?.[1] ?? []);
  const match = shape.exec(rows.at(-2) ?? "");
  if (matches.length !== 1 || match === null) return undefined;
  const [, id, model, effort, cwd, state] = match;
  if (
    id === undefined ||
    model === undefined ||
    effort === undefined ||
    cwd === undefined ||
    state === undefined
  )
    return undefined;
  return { id, model, effort, cwd, state };
}

export function nativeFooterId(text: string): string | undefined {
  return nativeFooterObservation(text)?.id;
}

function nativeFooterCwd(
  cwd: string,
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (isAbsolute(cwd)) return cwd;
  const home = env["HOME"];
  if (cwd.trim() === "~" && home !== undefined && isAbsolute(home)) return home;
  if (!cwd.startsWith("~/") || home === undefined || !isAbsolute(home))
    return undefined;
  return join(home, cwd.slice(2));
}

/** Refresh every Codex pane before the projection cache can skip a cycle. */
export async function bindNativeCodexFooters(
  agents: Agent[],
  readTail: (pane: string) => Promise<string | undefined>,
  apply: (args: string[]) => Promise<boolean>,
  env: NodeJS.ProcessEnv = process.env,
  titles: Map<string, PaneTitleBinding> = new Map(),
  readTitle: typeof readCodexNativeTitle = readProjectorTitle,
  dryRun = false,
  reasons: Map<string, string> = new Map(),
): Promise<Map<string, FleetSessionRead>> {
  const sessions = new Map<string, FleetSessionRead>();
  for (const agent of agents) {
    if (agent.agent !== "codex") continue;
    const registered = RegisteredCodexSchema.safeParse(agent.agent_session);
    // Registration supplies only a provisional display ID. It cannot bind this
    // pane or refresh a fleet record without an independently observed footer.
    agent.agent_session = registered.success ? registered.data : undefined;
    if (registered.success)
      sessions.set(registered.data.value, {
        na: true,
        why: "native footer validation unavailable",
      });
    if (agent.pane_id === undefined) continue;
    const pane = agent.pane_id;
    const footer = nativeFooterObservation((await readTail(pane)) ?? "");
    if (footer === undefined) {
      reasons.set(pane, "footer not visible");
      await bindRegisteredCodex(
        agent,
        sessions,
        titles,
        reasons,
        env,
        readTitle,
      );
      continue;
    }
    const cwd = nativeFooterCwd(footer.cwd, env);
    if (cwd === undefined) continue;
    const id = footer.id;
    const path = await codexRolloutPath(id, env);
    if (path === undefined) {
      reasons.set(pane, "no exact rollout");
      process.stderr.write(
        `herdr-projector: ${pane}: exact rollout lookup ${id} under ${env["CODEX_HOME"] ?? join(env["HOME"] ?? "", ".codex")}/sessions: missing, ambiguous or read limit\n`,
      );
      continue;
    }
    const unknown = {
      na: true,
      why: "not observed by native footer projector",
    } satisfies FleetSessionRead;
    const existing = FleetSessionSchema.safeParse(
      await readFleetSession(id, env),
    );
    const preserved =
      existing.success && existing.data.vendor === "codex"
        ? existing.data
        : undefined;
    const seed: FleetSession = {
      schema: 1,
      session_id: id,
      vendor: "codex",
      cwd,
      pane_id: pane,
      name: preserved?.name ?? unknown,
      model: unknown,
      effort: unknown,
      ctx: preserved?.ctx ?? unknown,
      rate: preserved?.rate ?? unknown,
      updated_at: Temporal.Now.instant().toString(),
    };
    const refreshed = FleetSessionSchema.safeParse(
      await readCodexNativeSession(seed, env, path, "verified-native-footer"),
    );
    if (
      !refreshed.success ||
      JSON.stringify(nativeFooterObservation((await readTail(pane)) ?? "")) !==
        JSON.stringify(footer)
    )
      continue;
    const reported = await apply([
      "pane",
      "report-agent-session",
      pane,
      "--source",
      "herdr:codex",
      "--agent",
      "codex",
      "--agent-session-id",
      id,
    ]);
    if (!reported) continue;
    const title = await readTitle(id, env);
    if (
      JSON.stringify(nativeFooterObservation((await readTail(pane)) ?? "")) !==
      JSON.stringify(footer)
    )
      continue;
    const next = {
      ...refreshed.data,
      model: footer.model,
      effort: footer.effort,
    };
    const written = dryRun
      ? { ok: true, value: next }
      : await writeFleetSessionIfChanged(next, env);
    if (!written.ok) continue;
    agent.agent_session = { value: id };
    sessions.set(id, written.value);
    titles.set(pane, { sessionId: id, title });
  }
  // Omitted session fields explicitly report an unavailable native identity.
  // Do this after failed validation as well as after a missing/clipped footer.
  for (const agent of agents) {
    if (
      agent.agent !== "codex" ||
      agent.pane_id === undefined ||
      agent.agent_session?.value !== undefined
    )
      continue;
    await apply([
      "pane",
      "report-agent-session",
      agent.pane_id,
      "--source",
      "herdr:codex",
      "--agent",
      "codex",
    ]);
  }
  return sessions;
}

async function bindRegisteredCodex(
  agent: Agent,
  sessions: Map<string, FleetSessionRead>,
  titles: Map<string, PaneTitleBinding>,
  reasons: Map<string, string>,
  env: NodeJS.ProcessEnv,
  readTitle: typeof readCodexNativeTitle,
): Promise<void> {
  const registered = RegisteredCodexSchema.safeParse(agent.agent_session);
  if (
    !registered.success ||
    agent.cwd === undefined ||
    agent.pane_id === undefined
  )
    return;
  const id = registered.data.value;
  const path = await codexRolloutPath(id, env);
  if (path === undefined) return;
  const title = await readTitle(id, env);
  const unknown = { na: true, why: "not in registered rollout" } as const;
  const fallback = FleetSessionSchema.safeParse(
    await readCodexNativeSession(
      {
        schema: 1,
        vendor: "codex",
        session_id: id,
        cwd: agent.cwd,
        pane_id: agent.pane_id,
        name: unknown,
        model: unknown,
        effort: unknown,
        ctx: unknown,
        rate: unknown,
        updated_at: Temporal.Now.instant().toString(),
      },
      env,
      path,
    ),
  );
  if (!fallback.success) return;
  sessions.set(id, fallback.data);
  titles.set(agent.pane_id, { sessionId: id, title });
  reasons.delete(agent.pane_id);
}

async function agentList(): Promise<Agent[] | undefined> {
  // Newer Herdr versions accept --json; the installed CLI emits the same JSON envelope by default.
  const output =
    (await run("herdr", ["agent", "list", "--json"])) ??
    (await run("herdr", ["agent", "list"]));
  if (output === undefined) return undefined;
  const parsed = jsonOf(ListSchema).safeParse(output.trim());
  return parsed.success ? parsed.data.result.agents : undefined;
}

async function herdr(args: string[]): Promise<boolean> {
  const output = await run("herdr", args);
  return output !== undefined;
}

function sessionWhy(session: FleetSessionRead | undefined): string {
  if (session === undefined) return "no session id";
  const unavailable = FleetSessionUnavailableSchema.safeParse(session);
  if (unavailable.success) {
    if (unavailable.data.why.includes("missing")) return "no session file";
    if (unavailable.data.why.includes("invalid")) return "invalid session file";
    return "session unavailable";
  }
  const parsed = FleetSessionSchema.safeParse(session);
  const name = parsed.success
    ? FleetSessionUnavailableSchema.safeParse(parsed.data.name)
    : undefined;
  return name?.success === true ? "name unavailable" : "session unavailable";
}

function unavailableLabel(agent: Agent, why: string): string {
  const shortWhy = why.slice(0, 20);
  const suffix = ` · n/a(${shortWhy})`;
  const name = agent.agent ?? "agent";
  return `${name.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`.slice(
    0,
    40,
  );
}

/**
 * The Claude Code mode row that ends the visible screen: `⏵⏵ auto mode on`, optionally followed by
 * `(shift+tab to cycle)`, then zero or more ` · <pill>` parts (Claude Code joins its pills with
 * ` · `: `1 shell`, `2 shells`, `1 feedback draft`, monitors, agents, ...). Capture 1 is the pills.
 * Only the auto-mode label is recognised: no footer sample of the other labels is on record.
 */
const CLAUDE_MODE_ROW =
  /^\s*⏵⏵ auto mode on(?: \(shift\+tab to cycle\))?((?: · [^·]+)*)\s*$/u;
const CLAUDE_SHELL_PILL = /^(\d+) shells?$/u;

/** The background shell count a footer's pills carry: N from `N shell(s)`, 0 with no shell pill. */
function footerPillShells(pills: string): number | undefined {
  const counts = pills
    .split(" · ")
    .slice(1)
    .flatMap((pill) => {
      const shell = CLAUDE_SHELL_PILL.exec(pill.trim());
      return shell === null ? [] : [Number(shell[1])];
    });
  return counts.length > 1 ? undefined : (counts[0] ?? 0);
}

function claudeModeFooter(
  text: string,
): { rows: string[]; shells: number } | undefined {
  if (text.length > 32 * 1024 || text.includes("\u001B")) return undefined;
  const rows = text.trimEnd().split(/\r?\n/u);
  if (rows.length > 20) return undefined;
  const mode = CLAUDE_MODE_ROW.exec(rows.at(-1) ?? "");
  if (mode === null) return undefined;
  const shells = footerPillShells(mode[1] ?? "");
  return shells === undefined ? undefined : { rows, shells };
}

/**
 * Background shells of one Claude session, from its own footer: a `N shell(s)` pill is N, a
 * recognised footer without one is 0 (other pills are ignored), and a footer that is unreadable,
 * not recognised or has two shell pills is undefined so the row says `? sh` instead of a guessed
 * number.
 */
export function claudeFooterShells(text: string): number | undefined {
  return claudeModeFooter(text)?.shells;
}

/** Only the owned statusline in the visible native footer, never an agx row. */
export function claudeFooterObservation(text: string):
  | {
      id: string;
      name: string;
      model: string;
      effort: string;
      rc: string;
      context: string;
    }
  | undefined {
  const rows = claudeModeFooter(text)?.rows;
  if (rows === undefined) return undefined;
  const matches = rows.flatMap((row, index) => {
    if (
      !/^\s*\S+@\S+:\d{2}-\d{2} \d{2}:\d{2}[+-]\d{2}\|/u.test(
        rows[index - 1] ?? "",
      )
    )
      return [];
    const match =
      /^\s*Claude \(stdin\) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (🔗|rc:on|rc:off|rc:\?|rc n\/a \([^|]+\)) \| Ctx: ([^|]+) \| [^|]+ \| Session: ([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\s*$/u.exec(
        row,
      );
    if (match === null) return [];
    const [, name, model, effort, rc, context, id] = match;
    if (
      name === undefined ||
      model === undefined ||
      effort === undefined ||
      rc === undefined ||
      context === undefined ||
      id === undefined
    )
      return [];
    let observedRc = rc;
    if (rc === "🔗") observedRc = "rc:on";
    if (rc.startsWith("rc n/a ")) observedRc = "rc:?";
    return [
      {
        id,
        name: name.trim(),
        model: model.trim(),
        effort: effort.trim(),
        rc: observedRc,
        context: context.trim(),
      },
    ];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export async function nativeClaudeRc(
  agent: Agent,
  env: NodeJS.ProcessEnv,
  readProcess = (pane: string) =>
    run("herdr", ["pane", "process-info", "--pane", pane]),
): Promise<string | undefined> {
  const registeredId = agent.agent_session?.value;
  if (
    registeredId === undefined ||
    agent.agent_session?.source !== "herdr:claude" ||
    agent.pane_id === undefined
  )
    return undefined;
  const ProcessInfo = jsonOf(
    z.object({
      result: z.object({
        process_info: z.object({
          foreground_processes: z.array(
            z.object({ pid: z.number().int().positive(), name: z.string() }),
          ),
        }),
      }),
    }),
  );
  const info = ProcessInfo.safeParse(await readProcess(agent.pane_id));
  for (const proc of info.data?.result.process_info.foreground_processes ??
    []) {
    if (proc.name !== "claude") continue;
    const path = join(
      env["CLAUDE_CONFIG_DIR"] ?? join(env["HOME"] ?? "", ".claude"),
      "sessions",
      `${proc.pid}.json`,
    );
    const native = jsonOf(
      z.object({
        pid: z.literal(proc.pid),
        sessionId: z.literal(registeredId),
        procStart: z.string(),
        bridgeSessionId: z.string().min(1),
      }),
    ).safeParse(
      await Bun.file(path)
        .slice(0, 64 * 1024)
        .text()
        .catch(() => ""),
    );
    // Herdr owns the host process namespace; /proc here may be a worker's namespace.
    const confirmed = ProcessInfo.safeParse(await readProcess(agent.pane_id));
    if (
      native.success &&
      confirmed.data?.result.process_info.foreground_processes.some(
        (current) => current.pid === proc.pid && current.name === "claude",
      ) === true
    )
      return "rc:on";
  }
  return undefined;
}

export async function bindClaudePanes(
  agents: Agent[],
  remoteControl: Map<string, string>,
  env: NodeJS.ProcessEnv = process.env,
  readTail?: (pane: string) => Promise<string | undefined>,
  contexts: Map<string, string> = new Map(),
): Promise<Map<string, FleetSessionRead>> {
  const sessions = new Map<string, FleetSessionRead>();
  for (const agent of agents) {
    if (
      agent.agent !== "claude" ||
      agent.pane_id === undefined ||
      agent.cwd === undefined
    )
      continue;
    const nativeRc = await nativeClaudeRc(agent, env);
    if (nativeRc !== undefined) remoteControl.set(agent.pane_id, nativeRc);
    if (readTail === undefined) continue;
    const observed = claudeFooterObservation(
      (await readTail(agent.pane_id)) ?? "",
    );
    if (observed === undefined) continue;
    const id = observed.id;
    const path = join(
      env["CLAUDE_CONFIG_DIR"] ?? join(env["HOME"] ?? "", ".claude"),
      "projects",
      agent.cwd.replaceAll(/[^a-zA-Z0-9]/gu, "-"),
      `${id}.jsonl`,
    );
    const read = await attempt(() =>
      Bun.file(path)
        .slice(0, 128 * 1024)
        .text(),
    );
    if (!read.ok) {
      process.stderr.write(
        `herdr-projector: ${agent.pane_id}: read ${path}: ${String(read.error)}\n`,
      );
      continue;
    }
    const Row = z.object({ sessionId: z.literal(id) });
    if (
      !read.value
        .split("\n")
        .slice(0, -1)
        .some((line) => jsonOf(Row).safeParse(line).success)
    )
      continue;
    if (
      JSON.stringify(
        claudeFooterObservation((await readTail(agent.pane_id)) ?? ""),
      ) !== JSON.stringify(observed)
    )
      continue;
    const existing = FleetSessionSchema.safeParse(
      await readFleetSession(id, env),
    );
    const unknown = {
      na: true,
      why: "not in native footer",
    } satisfies FleetSessionRead;
    const nativeName = /^[a-z0-9]+(?:-[a-z0-9]+)*-agt_[a-z0-9]+$/u.test(
      observed.name,
    )
      ? observed.name
      : agent.terminal_title_stripped;
    const parsed = FleetSessionSchema.safeParse({
      schema: 1,
      session_id: id,
      vendor: "claude",
      cwd: agent.cwd,
      pane_id: agent.pane_id,
      name: nativeName ?? (existing.success ? existing.data.name : unknown),
      model: observed.model,
      effort: observed.effort,
      ctx: unknown,
      rate: unknown,
      updated_at: Temporal.Now.instant().toString(),
    });
    if (!parsed.success) continue;
    agent.agent_session = { value: id };
    if (observed.rc !== "rc:?" || !remoteControl.has(agent.pane_id))
      remoteControl.set(agent.pane_id, observed.rc);
    contexts.set(agent.pane_id, observed.context);
    sessions.set(id, parsed.data);
  }
  return sessions;
}

/** Same runtime surfaces as codex-remote doctor; never reads the declaration. */
export async function nativeCodexRc(
  env: NodeJS.ProcessEnv = process.env,
  readArgs = (pid: number) => run("ps", ["-o", "args=", "-p", String(pid)]),
  osRelease = release(),
): Promise<string> {
  // Equivalent public OS read to doctor's ctx.isWsl (scripts/doctor.ts).
  // Windows Desktop owns the native app-server on WSL, not this daemon.
  if (/microsoft/iu.test(osRelease))
    return "not applicable: Windows Desktop owns the native Codex app-server on WSL";
  const directory = join(
    env["CODEX_HOME"] ?? join(env["HOME"] ?? "", ".codex"),
    "app-server-daemon",
  );
  const pid = jsonOf(z.object({ pid: z.number().int().positive() })).safeParse(
    await Bun.file(join(directory, "app-server.pid"))
      .text()
      .catch(() => ""),
  );
  if (pid.success) {
    const args = await readArgs(pid.data.pid);
    if (args === undefined) return "daemon process unreadable";
    if (/(?:^|\s)(?:\S*\/)?codex\s+app-server(?:\s|$)/u.test(args))
      return args.split(/\s+/u).includes("--remote-control")
        ? "rc:on"
        : "rc:off";
    return "managed daemon process not observed";
  }
  const settings = jsonOf(
    z.object({ remoteControlEnabled: z.boolean() }),
  ).safeParse(
    await Bun.file(join(directory, "settings.json"))
      .text()
      .catch(() => ""),
  );
  if (!settings.success) return "daemon settings unreadable";
  return settings.data.remoteControlEnabled ? "rc:on" : "rc:off";
}

const Roster = z.object({
  choice: z.array(
    z.object({
      id: z.string(),
      route: z.string(),
      model: z.string(),
      effort: z.string(),
    }),
  ),
});
type RosterRows = z.output<typeof Roster>["choice"];

function rosterModelKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^(?:claude|gpt)[- ]/u, "")
    .replaceAll(/[^a-z0-9]/gu, "");
}

/** Match observed model and effort to an agx roster row; ambiguous matches are unknown. */
export function rosterRow(
  rows: RosterRows,
  vendor: string,
  model: string,
  effort: string,
): string | undefined {
  if (model === "" || effort === "") return undefined;
  const workflow = effort.endsWith("+WF");
  const baseEffort = workflow ? effort.slice(0, -3) : effort;
  const matches = rows.filter(
    (row) =>
      row.route === vendor &&
      rosterModelKey(row.model) === rosterModelKey(model) &&
      row.effort.toLowerCase() === baseEffort.toLowerCase(),
  );
  if (matches.length !== 1) return workflow ? "?+WF" : undefined;
  return `${matches[0]?.id}${workflow ? "+WF" : ""}`;
}

/** Consume the statusline's own rendered percentage and window without inferring either. */
export function agentSecondLine(
  row: string | undefined,
  context: string | undefined,
): string {
  const match = /^(\d+(?:\.\d+)?%) \([^/()]+\/([\d.]+[kM]?)\)$/u.exec(
    context ?? "",
  );
  const pct = match?.[1] ?? "?";
  const limit = match?.[2] ?? "?";
  return [row ?? "?", `ctx ${pct}/${limit}`].join(" · ");
}

/**
 * herdr 0.9.5 rejects a `pane report-metadata` that updates more tokens than this:
 * `{"error":{"code":"invalid_metadata_token","message":"a metadata report may update at most 16 tokens"}}`.
 */
export const HERDR_MAX_METADATA_TOKENS = 16;

/**
 * Splits token arguments (`--token k=v` or `--clear-token k`, each one pair of argv entries) into
 * reports of at most HERDR_MAX_METADATA_TOKENS tokens, keeping their order.
 */
export function metadataReportChunks(tokenArgs: readonly string[]): string[][] {
  const pairsPerChunk = HERDR_MAX_METADATA_TOKENS * 2;
  const chunks: string[][] = [];
  for (let i = 0; i < tokenArgs.length; i += pairsPerChunk)
    chunks.push(tokenArgs.slice(i, i + pairsPerChunk));
  return chunks;
}

/**
 * Reports one pane's tokens as sequential calls, each at most HERDR_MAX_METADATA_TOKENS tokens.
 * Stops at the first failed call; the pane is updated only when every call succeeded.
 */
async function reportPaneMetadata(
  apply: (args: string[]) => Promise<boolean>,
  paneId: string,
  tokenArgs: readonly string[],
): Promise<boolean> {
  for (const chunk of metadataReportChunks(tokenArgs)) {
    const ok = await apply([
      "pane",
      "report-metadata",
      paneId,
      "--source",
      "dotfiles:herdr-projector",
      ...chunk,
    ]);
    if (!ok) return false;
  }
  return true;
}

export async function projectAgents(
  agents: Agent[],
  sessions: ReadonlyMap<string, FleetSessionRead>,
  apply: (args: string[]) => Promise<boolean>,
  titles: ReadonlyMap<string, PaneTitleBinding> = new Map(),
  remoteControl: ReadonlyMap<string, string> = new Map(),
  reasons: ReadonlyMap<string, string> = new Map(),
  cpuSnapshot?: AgentCpuSnapshot,
  panePids: ReadonlyMap<string, PaneProcessIds> = new Map(),
  roster: RosterRows = [],
  _contexts: ReadonlyMap<string, string> = new Map(),
  shellCounts?: ReadonlyMap<string, number>,
): Promise<number> {
  let updated = 0;
  for (const agent of agents) {
    if (agent.pane_id === undefined || agent.tab_id === undefined) continue;
    const vendor = agent.agent;
    const herdrSessionId = agent.agent_session?.value;
    const sessionId = herdrSessionId;
    const candidate =
      sessionId === undefined ? undefined : sessions.get(sessionId);
    const parsedCandidate = FleetSessionSchema.safeParse(candidate);
    let session: FleetSessionRead | undefined;
    if (
      parsedCandidate.success &&
      parsedCandidate.data.vendor === vendor &&
      parsedCandidate.data.session_id === sessionId
    ) {
      session = parsedCandidate.data;
    } else if (
      candidate !== undefined &&
      FleetSessionUnavailableSchema.safeParse(candidate).success
    ) {
      session = candidate;
    }
    const matchedSessionId =
      parsedCandidate.success &&
      parsedCandidate.data.vendor === vendor &&
      parsedCandidate.data.session_id === sessionId
        ? sessionId
        : undefined;
    const parsedSession = FleetSessionSchema.safeParse(session);
    const identity = parsedSession.success ? parsedSession.data : undefined;
    const knownName =
      identity !== undefined && typeof identity.name === "string"
        ? identity.name
        : undefined;
    const titleBinding =
      agent.pane_id === undefined ? undefined : titles.get(agent.pane_id);
    const nativeTitle =
      vendor === "codex" &&
      sessionId !== undefined &&
      identity?.vendor === "codex" &&
      identity.session_id === sessionId &&
      titleBinding?.sessionId === sessionId &&
      titleBinding.title.sessionId === sessionId &&
      titleBinding.title.kind === "known"
        ? titleBinding.title.displayTitle
        : undefined;
    const why = reasons.get(agent.pane_id) ?? sessionWhy(session);
    // Display-only label: a bound Codex native title wins; the fleet name stays
    // the identity (metadata keys, matching) and the fallback. Claude has no
    // nativeTitle, so its precedence is unchanged.
    const name = nativeTitle ?? knownName ?? unavailableLabel(agent, why);
    const model =
      identity !== undefined && typeof identity.model === "string"
        ? identity.model
        : "";
    const effort =
      identity !== undefined && typeof identity.effort === "string"
        ? identity.effort
        : "";
    // Read observations for this pane; never recycle projector-owned display tokens.
    const isAgent = vendor === "claude" || vendor === "codex";
    const rc = remoteControl.get(agent.pane_id);
    const marker = isAgent && rc === "rc:on" ? "🔗" : "";
    const notApplicable =
      isAgent && rc?.startsWith("not applicable: ") === true;
    const unknownRc =
      isAgent && !notApplicable && rc !== "rc:on" && rc !== "rc:off";
    const context = z
      .object({
        tokens: z.number(),
        pct: z.number(),
        window: z.number().positive(),
      })
      .safeParse(identity?.ctx);
    let contextText: string | undefined;
    if (context.success) {
      const { tokens, pct, window } = context.data;
      const limit =
        window >= 1000 ? `${Math.round(window / 1000)}k` : String(window);
      contextText = `${Math.round(pct)}% (${tokens}/${limit})`;
    }
    const processIds = panePids.get(agent.pane_id) ?? {
      pids: [],
      ancestorPids: [],
    };
    const candidates = [
      ...(cpuSnapshot?.sessions ?? []),
      ...(cpuSnapshot?.unresolved_agents ?? []),
    ].filter(
      (row) => row.vendor === vendor && processIds.pids.includes(row.pid),
    );
    const fallback =
      cpuSnapshot?.sessions.filter(
        (row) => row.session_id === matchedSessionId && row.vendor === vendor,
      ) ?? [];
    const matches = candidates.length > 0 ? candidates : fallback;
    const nearestAncestor = matches
      .map((row) => ({
        row,
        distance: Math.min(
          ...processIds.ancestorPids.flatMap((ancestors) => {
            const distance = ancestors.indexOf(row.pid);
            return distance === -1 ? [] : [distance];
          }),
          Number.POSITIVE_INFINITY,
        ),
      }))
      .filter((scored) => Number.isFinite(scored.distance))
      .toSorted((a, b) => a.distance - b.distance);
    let resource = matches.length === 1 ? matches[0] : undefined;
    const closest = nearestAncestor[0];
    if (
      resource === undefined &&
      closest !== undefined &&
      closest.distance !== nearestAncestor[1]?.distance
    )
      resource = closest.row;
    const parsedCpu =
      AgentCpuSchemaV1.shape.sessions.element.safeParse(resource);
    const cpuSession = parsedCpu.success ? parsedCpu.data : undefined;
    const unowned =
      cpuSnapshot?.unowned
        .map((row) => `${row.label} ${row.cpu_pct}%`)
        .join(" · ") ?? "";
    const cpuArgs: string[] = [];
    const retiredArgs: string[] = [];
    if (isAgent) {
      const parsedMemory =
        AgentCpuSchemaV2.shape.unresolved_agents.element.safeParse(resource);
      const parsedMemorySession =
        AgentCpuSchemaV2.shape.sessions.element.safeParse(resource);
      const memorySession = parsedMemory.success
        ? parsedMemory.data
        : undefined;
      const memoryWorkers = parsedMemorySession.success
        ? parsedMemorySession.data.workers
        : null;
      const ram =
        memorySession === undefined
          ? undefined
          : memorySession.ram_bytes + (memoryWorkers?.ram_bytes ?? 0);
      const vram =
        memorySession === undefined || memorySession.vram_bytes === null
          ? undefined
          : memorySession.vram_bytes;
      // Background shells are the session's own (Claude footer), keyed by pane; no entry reads `? sh`.
      const shells = shellCounts?.get(agent.pane_id);
      const tokens = resourceTokens(
        cpuSession?.workers?.count,
        resource?.cpu_pct,
        ram,
        vram,
        shells,
      );
      cpuArgs.push(...resourceTokenArgs(tokens));
      // Retired tokens (the row-4 counts, the single grey resources token and older per-field
      // names): cleared so a value reported by an earlier version does not linger. They come last
      // so that a split report never drops a live token to make room for them.
      retiredArgs.push(
        "--clear-token",
        "resources",
        "--clear-token",
        "counts",
        "--clear-token",
        "workers",
        "--clear-token",
        "cpu",
        "--clear-token",
        "vram",
      );
    }
    if (vendor === "btm")
      cpuArgs.push(
        ...(unowned === ""
          ? ["--clear-token", "unowned"]
          : ["--token", `unowned=${unowned}`]),
      );
    const renamed = isAgent
      ? await apply(["tab", "rename", agent.tab_id, name])
      : true;
    const reported = await reportPaneMetadata(apply, agent.pane_id, [
      "--token",
      `fullname=${name}`,
      "--token",
      `model=${model}`,
      "--token",
      `effort=${effort}`,
      ...(isAgent
        ? [
            "--token",
            `agent_detail=${agentSecondLine(rosterRow(roster, vendor, model, effort), contextText)}`,
          ]
        : []),
      ...(marker !== ""
        ? ["--token", `rc=${marker}`]
        : ["--clear-token", "rc"]),
      "--token",
      `rc_reason=${unknownRc || notApplicable ? (rc ?? "remote-control observation unavailable") : ""}`,
      "--token",
      `fleet_session_id=${matchedSessionId ?? ""}`,
      ...cpuArgs,
      ...retiredArgs,
    ]);
    if (renamed && reported) updated++;
  }
  process.stdout.write(`herdr-projector: projected ${updated} pane(s)\n`);
  return 0;
}

export function agentCpuCacheInput(
  snapshot: AgentCpuSnapshot | undefined,
): string {
  return JSON.stringify(snapshot ?? null);
}

export function nativeTitleCacheInputs(
  titles: ReadonlyMap<string, PaneTitleBinding>,
) {
  return [...titles.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([paneId, binding]) => ({
      paneId,
      boundId: binding.sessionId,
      title:
        binding.title.kind === "known"
          ? {
              kind: binding.title.kind,
              value: binding.title.displayTitle,
              sourceUpdatedAt: binding.title.sourceUpdatedAt,
            }
          : { kind: binding.title.kind, reason: binding.title.reason },
    }));
}

async function project(dryRun = false): Promise<number> {
  const cpuSnapshot = await readAgentCpu();
  const agents = await agentList();
  if (agents === undefined) {
    process.stderr.write(
      "herdr-projector: herdr agent list unavailable or invalid\n",
    );
    return 1;
  }
  const runtime = process.env["XDG_RUNTIME_DIR"];
  let applied = true;
  const apply = async (args: string[]) => {
    if (dryRun) {
      process.stdout.write(`${JSON.stringify({ wouldApply: args })}\n`);
      return true;
    }
    const ok = await herdr(args);
    applied = applied && ok;
    return ok;
  };
  const titleBindings = new Map<string, PaneTitleBinding>();
  const reasons = new Map<string, string>();
  const nativeSessions = await bindNativeCodexFooters(
    agents,
    (pane) =>
      run("herdr", [
        "pane",
        "read",
        pane,
        "--source",
        "visible",
        "--format",
        "text",
        "--lines",
        "5",
      ]),
    apply,
    process.env,
    titleBindings,
    readProjectorTitle,
    dryRun,
    reasons,
  );
  const remoteControl = new Map<string, string>();
  const codexPanes = agents.filter((pane) => pane.agent === "codex");
  for (const agent of codexPanes) {
    if (agent.pane_id === undefined) continue;
    remoteControl.set(
      agent.pane_id,
      "session Remote Control state unavailable",
    );
  }
  const contexts = new Map<string, string>();
  // Background shells come from each Claude pane's own footer. Codex has no such source here,
  // so a Codex pane has no entry and its row reads `? sh`.
  const shellCounts = new Map<string, number>();
  await Promise.all(
    agents.map(async (agent) => {
      if (agent.agent !== "claude" || agent.pane_id === undefined) return;
      const shells = claudeFooterShells(
        (await run("herdr", [
          "pane",
          "read",
          agent.pane_id,
          "--source",
          "visible",
          "--format",
          "text",
          "--lines",
          "5",
        ])) ?? "",
      );
      if (shells !== undefined) shellCounts.set(agent.pane_id, shells);
    }),
  );
  await bindClaudePanes(agents, remoteControl);
  const rosterResult = jsonOf(Roster).safeParse(
    (await run("agx", ["worker", "roster", "--json"])) ?? "",
  );
  const roster = rosterResult.success ? rosterResult.data.choice : [];
  const panePids = await paneResourcePids(
    agents,
    (pane) => run("herdr", ["pane", "process-info", "--pane", pane]),
    (await run("ps", ["-e", "-o", "pid=,ppid="])) ?? "",
  );
  const cacheDir =
    runtime === undefined || runtime === ""
      ? undefined
      : join(runtime, "herdr-projector");
  const cachePath =
    cacheDir === undefined
      ? undefined
      : join(cacheDir, `${Bun.hash(import.meta.path)}.json`);
  const Cache = jsonOf(z.object({ key: z.string() }));
  const cached = Cache.safeParse(
    cachePath === undefined
      ? ""
      : await Bun.file(cachePath)
          .slice(0, 4096)
          .text()
          .catch(() => ""),
  );
  const sessionIds = [
    ...new Set(
      agents.flatMap((agent) => {
        const id = agent.agent_session?.value;
        return id === undefined || id === "" ? [] : [id];
      }),
    ),
  ];
  const results = await Promise.all(
    sessionIds.map(async (id) => [id, await readFleetSession(id)] as const),
  );
  const sessions = new Map(results);
  for (const [id, session] of nativeSessions) sessions.set(id, session);
  const identities = () =>
    [...sessions.entries()]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([id, session]) => {
        const parsed = FleetSessionSchema.safeParse(session);
        if (!parsed.success) return [id, session];
        const { vendor, session_id, name, model, effort, ctx } = parsed.data;
        return [id, { vendor, session_id, name, model, effort, ctx }];
      });
  const panes = agents.map((agent) => ({
    ...agent,
    tokens: {
      fullname: agent.tokens?.["fullname"],
      model: agent.tokens?.["model"],
      effort: agent.tokens?.["effort"],
      rc: agent.tokens?.["rc"],
      fleet_session_id: agent.tokens?.["fleet_session_id"],
    },
  }));
  const fingerprint = () =>
    new Bun.CryptoHasher("sha256")
      .update(
        JSON.stringify({
          version: cliPackage.version,
          panes,
          identities: identities(),
          titles: nativeTitleCacheInputs(titleBindings),
          remoteControl: [...remoteControl],
          reasons: [...reasons],
          cpuSnapshot: agentCpuCacheInput(cpuSnapshot),
          panePids: [...panePids],
          contexts: [...contexts],
          roster,
          shellCounts: [...shellCounts].toSorted(([a], [b]) =>
            a.localeCompare(b),
          ),
        }),
      )
      .digest("hex");
  if (
    !dryRun &&
    applied &&
    cached.success &&
    cached.data.key === fingerprint()
  ) {
    process.stdout.write("herdr-projector: unchanged; projected 0 pane(s)\n");
    return 0;
  }
  const result = await projectAgents(
    agents,
    sessions,
    apply,
    titleBindings,
    remoteControl,
    reasons,
    cpuSnapshot,
    panePids,
    roster,
    contexts,
    shellCounts,
  );
  // A failed mutation must be retried, and cache trouble must not block projection.
  if (!dryRun && applied && cacheDir !== undefined && cachePath !== undefined) {
    await (async () => {
      const currentIds = new Set(
        agents.flatMap((agent) => agent.agent_session?.value ?? []),
      );
      for (const id of sessions.keys())
        if (!currentIds.has(id)) sessions.delete(id);
      await mkdir(cacheDir, { recursive: true, mode: 0o700 });
      const temp = `${cachePath}.${process.pid}.tmp`;
      await Bun.write(temp, JSON.stringify({ key: fingerprint() }), {
        mode: 0o600,
      });
      await rename(temp, cachePath);
    })().catch(() => null);
  }
  return applied ? result : 1;
}

if (import.meta.main) {
  if (argv.length === 1 && argv[0] === "--dry-run") {
    process.exitCode = await project(true);
  } else if (
    argv.some(
      (arg) =>
        ["--help", "-h", "--version", "-V"].includes(arg) ||
        arg.startsWith("-"),
    )
  ) {
    cli({
      name: "herdr-projector",
      parameters: [],
      strictFlags: true,
      flags: {
        dryRun: {
          type: Boolean,
          description:
            "Read current panes and print proposed writes without applying them",
        },
      },
      help: {
        description: "Project fleet session identities onto Herdr panes.",
      },
    });
  } else if (argv.length > 0) {
    process.stderr.write("herdr-projector: unexpected arguments; use --help\n");
    process.exitCode = 2;
  } else {
    process.exitCode = await project();
  }
}
