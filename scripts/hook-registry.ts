// The vendor-neutral hook registry (agents/hooks/hooks.toml) and how it wires into a vendor's hook
// config. Pure functions, zero-dep (zod comes from the committed agents/hooks/zod.ts bundle), so
// scripts/render-home.ts can wire at DEPLOY time on a half-set-up machine.
//
// WHY. Skills and hooks have different vendor adapters: in-house skills use the Claude plugin and
// Codex copy installer, while agents/claude/hooks was wired into Claude only. On 2026-09-26 a Codex session on r99 ran
// 1,530 cargo calls and rebuilt 145 GB of target/ with C: at 3% free — the storage-headroom gate
// that would have refused it existed, but only Claude ran it. The fix is the skills shape: one
// source dir (agents/hooks, linked to ~/.agents/hooks), one registry, N vendors.
//
// ONE WRITER PER FILE (2026-10-06). Until then `mise run hooks:wire` rewrote the owned entries
// INSIDE the committed agents/claude/settings.json and agents/codex/hooks.json, so those files had
// two writers (the human and the wirer) and a hand edit to an owned entry was silently undone. Now
// the committed vendor files are hand-written only and the wiring happens where the deployed copy
// is rendered. `wire` still strips owned entries first, so a stale one left in a vendor file is
// never doubled — and `mise run lint:one-writer` fails while one is there.

import { access, readFile } from "node:fs/promises";
import { z } from "../agents/hooks/zod.ts";

export const RUNNER = "~/.agents/hooks/run.sh";
export const VENDORS = ["claude", "codex"] as const;
export type Vendor = (typeof VENDORS)[number];

export type HookSpec = {
  script: string;
  event: string;
  matcher?: string;
  fail_closed: boolean;
  timeout?: number;
  vendors: Vendor[];
  /** Declared slot within its event. Rendered order follows it, never the list order in hooks.toml. */
  position: number;
};

/** One line of agents/hooks/slots.toml: the append-only history of a hook's position. */
export type Slot = {
  script: string;
  event: string;
  position: number;
  retired: boolean;
};

const SlotsSchema = z.object({
  slot: z.array(
    z.object({
      script: z.string(),
      event: z.string(),
      position: z.number().int().nonnegative(),
      retired: z.boolean().optional(),
    }),
  ),
});

// Vendor files carry fields this module does not own (matcher, command, timeout, and whatever a
// vendor adds), so the schemas are LOOSE: parsing validates the fields the logic reads and keeps
// every other key where it was, in order. Callers safeParse at their boundary (zod first).
const HookCommandSchema = z.looseObject({ type: z.string() });
const MatcherGroupSchema = z.looseObject({ hooks: z.array(HookCommandSchema) });
export const HooksConfigSchema = z.record(
  z.string(),
  z.array(MatcherGroupSchema),
);
type HookCommand = z.output<typeof HookCommandSchema>;
type MatcherGroup = z.output<typeof MatcherGroupSchema>;
export type HooksConfig = z.output<typeof HooksConfigSchema>;

const JsonObject = z.record(z.string(), z.unknown());

const VendorSchema = z.enum(VENDORS);
const RegistrySchema = z.object({ hook: z.array(z.unknown()) });

// The entries of a `vendors` value that name a known vendor ([] when it is not a list).
const knownVendorsOf = (vendors: unknown): Vendor[] =>
  (Array.isArray(vendors) ? vendors : []).flatMap((v: unknown) => {
    const p = VendorSchema.safeParse(v);
    return p.success ? [p.data] : [];
  });

/** Every live position must be the one the append-only history records (slots.toml). Positions
 * are per event and never reused; a new hook takes a position above all recorded ones; a removed
 * hook must be the last live position of its event, else the hooks after it would shift index. */
export function checkHistory(specs: HookSpec[], history: Slot[]): string[] {
  const errors: string[] = [];
  const highest = new Map<string, number>();
  const bySlot = new Map<string, Slot>();
  history.forEach((slot, i) => {
    const at = `slots.toml slot[${i}] ${slot.script}`;
    const top = highest.get(slot.event);
    if (top !== undefined && slot.position <= top)
      errors.push(
        `${at}: ${slot.event} position ${slot.position} does not follow ${top}; positions are append-only`,
      );
    highest.set(slot.event, Math.max(top ?? -1, slot.position));
    if (bySlot.has(slot.script)) errors.push(`${at}: listed more than once`);
    else bySlot.set(slot.script, slot);
  });
  const live = new Set(specs.map((spec) => spec.script));
  for (const spec of specs) {
    const slot = bySlot.get(spec.script);
    if (slot === undefined)
      errors.push(
        `${spec.script} has no slots.toml entry; append a [[slot]] with its event and position`,
      );
    else if (
      slot.retired ||
      slot.event !== spec.event ||
      slot.position !== spec.position
    )
      errors.push(
        `${spec.script}: hooks.toml says ${spec.event} position ${spec.position}, slots.toml says ${slot.event} position ${slot.position}${slot.retired ? " (retired)" : ""}; positions never change`,
      );
  }
  for (const slot of history) {
    if (live.has(slot.script)) continue;
    if (!slot.retired) {
      errors.push(
        `${slot.script} is gone from hooks.toml; mark its slots.toml entry retired = true`,
      );
      continue;
    }
    for (const spec of specs.filter(
      (s) => s.event === slot.event && s.position > slot.position,
    ))
      errors.push(
        `removing ${slot.script} (${slot.event} position ${slot.position}) would shift ${spec.script} (position ${spec.position}); only the last position may be removed`,
      );
  }
  return errors;
}

// Every error is collected, not the first one — a fixed typo should not reveal the next.
export function parseRegistry(
  raw: unknown,
  scriptExists: (name: string) => boolean,
  history?: Slot[],
): { specs: HookSpec[]; errors: string[] } {
  const errors: string[] = [];
  const specs: HookSpec[] = [];
  const registry = RegistrySchema.safeParse(raw);
  if (!registry.success || registry.data.hook.length === 0) {
    return { specs, errors: ["no [[hook]] entries"] };
  }
  const claimed = new Map<string, number>(); // `${event} ${position}` -> hook index
  registry.data.hook.forEach((entry, i) => {
    const at = `hook[${i}]`;
    const before = errors.length;
    // A non-table entry reads as an empty one: every field below is then absent.
    const parsed = JsonObject.safeParse(entry);
    const h = parsed.success ? parsed.data : {};
    const { script, event, matcher, timeout, vendors, position } = h;
    const failClosed = h["fail_closed"];
    if (typeof script !== "string" || !/^[\w.-]+\.ts$/u.test(script))
      errors.push(`${at}.script must be a bare <name>.ts`);
    else if (!scriptExists(script))
      errors.push(`${at}.script ${script} is not in agents/hooks`);
    if (typeof event !== "string" || event === "")
      errors.push(`${at}.event must be a non-empty string`);
    if (matcher !== undefined && typeof matcher !== "string")
      errors.push(`${at}.matcher must be a string`);
    if (typeof failClosed !== "boolean")
      errors.push(`${at}.fail_closed must be true or false`);
    if (timeout !== undefined && (typeof timeout !== "number" || timeout <= 0))
      errors.push(`${at}.timeout must be a positive number`);
    if (
      typeof position !== "number" ||
      !Number.isInteger(position) ||
      position < 0
    )
      errors.push(`${at}.position must be a non-negative integer`);
    const knownVendors = knownVendorsOf(vendors);
    if (
      !Array.isArray(vendors) ||
      vendors.length === 0 ||
      knownVendors.length !== vendors.length
    )
      errors.push(
        `${at}.vendors must be a non-empty subset of ${VENDORS.join(", ")}`,
      );
    if (
      errors.length === before &&
      typeof script === "string" &&
      typeof event === "string" &&
      typeof failClosed === "boolean" &&
      typeof position === "number"
    ) {
      const key = `${event} ${position}`;
      const other = claimed.get(key);
      if (other !== undefined)
        errors.push(
          `${at}.position ${position} on ${event} duplicates hook[${other}]`,
        );
      else claimed.set(key, i);
      specs.push({
        script,
        event,
        ...(typeof matcher === "string" ? { matcher } : {}),
        fail_closed: failClosed,
        ...(typeof timeout === "number" ? { timeout } : {}),
        vendors: knownVendors,
        position,
      });
    }
  });
  if (history !== undefined) errors.push(...checkHistory(specs, history));
  return { specs, errors };
}

/** The registry beside the hooks it names: parsed specs, or every error found. The append-only
 * history in `slots.toml` beside it is checked when present. */
export async function loadRegistry(hooksDir: string): Promise<{
  specs: HookSpec[];
  errors: string[];
}> {
  const raw = Bun.TOML.parse(await readFile(`${hooksDir}/hooks.toml`, "utf8"));
  const registered = RegistrySchema.safeParse(raw);
  const existence = new Map<string, boolean>();
  if (registered.success) {
    const names = registered.data.hook.flatMap((entry) => {
      const parsed = JsonObject.safeParse(entry);
      const script = parsed.success ? parsed.data["script"] : undefined;
      return typeof script === "string" && /^[\w.-]+\.ts$/u.test(script)
        ? [script]
        : [];
    });
    await Promise.all(
      [...new Set(names)].map(async (name) => {
        existence.set(
          name,
          await access(`${hooksDir}/${name}`).then(
            () => true,
            () => false,
          ),
        );
      }),
    );
  }
  const slotsPath = `${hooksDir}/slots.toml`;
  const slotsPresent = await access(slotsPath).then(
    () => true,
    () => false,
  );
  if (!slotsPresent) {
    return parseRegistry(raw, (name) => existence.get(name) ?? false);
  }
  const slots = SlotsSchema.safeParse(
    Bun.TOML.parse(await readFile(slotsPath, "utf8")),
  );
  if (!slots.success) {
    const parsed = parseRegistry(raw, (name) => existence.get(name) ?? false);
    return {
      specs: parsed.specs,
      errors: [
        ...parsed.errors,
        `slots.toml is invalid: ${slots.error.message}`,
      ],
    };
  }
  const history: Slot[] = slots.data.slot.map((s) => ({
    script: s.script,
    event: s.event,
    position: s.position,
    retired: s.retired ?? false,
  }));
  return parseRegistry(raw, (name) => existence.get(name) ?? false, history);
}

export function commandFor(spec: HookSpec): string {
  return `sh ${RUNNER} ${spec.fail_closed ? "--fail-closed " : ""}${spec.script}`;
}

export const owned = (h: HookCommand): boolean =>
  typeof h["command"] === "string" && h["command"].includes(`${RUNNER} `);

/** `hooks` with every owned entry removed (emptied groups dropped), then the registry's entries
 * for `vendor` appended per event. Idempotent; a deleted registry entry disappears. */
export function wire(
  hooks: HooksConfig,
  specs: HookSpec[],
  vendor: Vendor,
): HooksConfig {
  const out: HooksConfig = {};
  for (const [event, groups] of Object.entries(hooks)) {
    const kept = groups
      .map((g) => {
        const filteredGroup = Object.assign({}, g);
        filteredGroup.hooks = g.hooks.filter((h) => !owned(h));
        return filteredGroup;
      })
      .filter((g) => g.hooks.length > 0);
    if (kept.length > 0) out[event] = kept;
  }
  // Per event, the declared position decides the order (a new entry cannot shift the others);
  // events keep their first-appearance order in `specs`, so the rendered key order is unchanged.
  const byEvent = new Map<string, HookSpec[]>();
  for (const spec of specs) {
    if (!spec.vendors.includes(vendor)) continue;
    byEvent.set(spec.event, [...(byEvent.get(spec.event) ?? []), spec]);
  }
  for (const [event, eventSpecs] of byEvent) {
    for (const spec of eventSpecs.toSorted((a, b) => a.position - b.position)) {
      const group: MatcherGroup = {
        ...(spec.matcher === undefined ? {} : { matcher: spec.matcher }),
        hooks: [
          {
            type: "command",
            command: commandFor(spec),
            ...(spec.timeout === undefined ? {} : { timeout: spec.timeout }),
          },
        ],
      };
      (out[event] ??= []).push(group);
    }
  }
  return out;
}
