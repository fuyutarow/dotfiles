// The vendor-neutral hook registry (agents/hooks/hooks.toml) and how it wires into a vendor's hook
// config. Pure functions, zero-dep (zod comes from the committed agents/hooks/zod.ts bundle), so
// scripts/render-home.ts can wire at DEPLOY time on a half-set-up machine.
//
// WHY. Skills were vendor-agnostic (agents/skills → link:skills → Claude AND Codex) but hooks were
// not: agents/claude/hooks was wired into Claude only. On 2026-09-26 a Codex session on r99 ran
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

import { existsSync, readFileSync } from "node:fs";
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
};

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

// Every error is collected, not the first one — a fixed typo should not reveal the next.
export function parseRegistry(
  raw: unknown,
  scriptExists: (name: string) => boolean,
): { specs: HookSpec[]; errors: string[] } {
  const errors: string[] = [];
  const specs: HookSpec[] = [];
  const registry = RegistrySchema.safeParse(raw);
  if (!registry.success || registry.data.hook.length === 0) {
    return { specs, errors: ["no [[hook]] entries"] };
  }
  registry.data.hook.forEach((entry, i) => {
    const at = `hook[${i}]`;
    const before = errors.length;
    // A non-table entry reads as an empty one: every field below is then absent.
    const parsed = JsonObject.safeParse(entry);
    const h = parsed.success ? parsed.data : {};
    const { script, event, matcher, timeout, vendors } = h;
    const failClosed = h.fail_closed;
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
      typeof failClosed === "boolean"
    )
      specs.push({
        script,
        event,
        ...(typeof matcher === "string" ? { matcher } : {}),
        fail_closed: failClosed,
        ...(typeof timeout === "number" ? { timeout } : {}),
        vendors: knownVendors,
      });
  });
  return { specs, errors };
}

/** The registry beside the hooks it names: parsed specs, or every error found. */
export function loadRegistry(hooksDir: string): {
  specs: HookSpec[];
  errors: string[];
} {
  return parseRegistry(
    Bun.TOML.parse(readFileSync(`${hooksDir}/hooks.toml`, "utf8")),
    (name) => existsSync(`${hooksDir}/${name}`),
  );
}

export function commandFor(spec: HookSpec): string {
  return `sh ${RUNNER} ${spec.fail_closed ? "--fail-closed " : ""}${spec.script}`;
}

export const owned = (h: HookCommand): boolean =>
  typeof h.command === "string" && h.command.includes(`${RUNNER} `);

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
  for (const spec of specs) {
    if (!spec.vendors.includes(vendor)) continue;
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
    (out[spec.event] ??= []).push(group);
  }
  return out;
}
