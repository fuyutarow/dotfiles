import { cli } from "cleye";

// Wire the vendor-neutral hooks (agents/hooks/hooks.toml) into every agent CLI's hook config.
// Consumer: `mise run hooks:wire` (write) and `mise run test` via tests/wire-hooks.test.ts (check).
// Output is verdict lines. Exit: 0 wired or already current / 1 --check found drift / 2 usage
// error, invalid registry, or FATAL.
//
// WHY. Skills were vendor-agnostic (agents/skills → link:skills → Claude AND Codex) but hooks were
// not: agents/claude/hooks was wired into Claude only. On 2026-09-26 a Codex session on r99 ran
// 1,530 cargo calls and rebuilt 145 GB of target/ with C: at 3% free — the storage-headroom gate
// that would have refused it existed, but only Claude ran it. The fix is the skills shape: one
// source dir (agents/hooks, linked to ~/.agents/hooks), one registry, N vendors.
//
// GENERATED, CHECKED IN. The vendor files stay committed and symlinked/rendered exactly as before;
// this script rewrites only the entries it OWNS — hook commands that run ~/.agents/hooks/run.sh —
// and leaves every vendor-specific entry where it is. Owned entries are removed, emptied matcher
// groups dropped, then the registry's entries appended per event, so a run is idempotent and a
// deleted registry entry disappears from every vendor.

const RUNNER = "~/.agents/hooks/run.sh";
const VENDORS = ["claude", "codex"] as const;
type Vendor = (typeof VENDORS)[number];

export type HookSpec = {
  script: string;
  event: string;
  matcher?: string;
  fail_closed: boolean;
  timeout?: number;
  vendors: Vendor[];
};

type HookCommand = { type: string; command?: string; timeout?: number };
type MatcherGroup = { matcher?: string; hooks: HookCommand[] };
export type HooksConfig = Record<string, MatcherGroup[]>;

class UsageError extends Error {}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`Unknown option '--${flag}'`);
  }
}

// Every error is collected, not the first one — a fixed typo should not reveal the next.
export function parseRegistry(
  raw: any,
  scriptExists: (name: string) => boolean,
): { specs: HookSpec[]; errors: string[] } {
  const errors: string[] = [];
  const specs: HookSpec[] = [];
  const list = raw?.hook;
  if (!Array.isArray(list) || list.length === 0) {
    return { specs, errors: ["no [[hook]] entries"] };
  }
  list.forEach((h: any, i: number) => {
    const at = `hook[${i}]`;
    const before = errors.length;
    if (typeof h?.script !== "string" || !/^[\w.-]+\.ts$/.test(h.script))
      errors.push(`${at}.script must be a bare <name>.ts`);
    else if (!scriptExists(h.script))
      errors.push(`${at}.script ${h.script} is not in agents/hooks`);
    if (typeof h?.event !== "string" || h.event === "")
      errors.push(`${at}.event must be a non-empty string`);
    if (h?.matcher !== undefined && typeof h.matcher !== "string")
      errors.push(`${at}.matcher must be a string`);
    if (typeof h?.fail_closed !== "boolean")
      errors.push(`${at}.fail_closed must be true or false`);
    if (
      h?.timeout !== undefined &&
      (typeof h.timeout !== "number" || h.timeout <= 0)
    )
      errors.push(`${at}.timeout must be a positive number`);
    if (
      !Array.isArray(h?.vendors) ||
      h.vendors.length === 0 ||
      !h.vendors.every((v: unknown) => VENDORS.includes(v as Vendor))
    )
      errors.push(
        `${at}.vendors must be a non-empty subset of ${VENDORS.join(", ")}`,
      );
    if (errors.length === before) specs.push(h as HookSpec);
  });
  return { specs, errors };
}

export function commandFor(spec: HookSpec): string {
  return `sh ${RUNNER} ${spec.fail_closed ? "--fail-closed " : ""}${spec.script}`;
}

const owned = (h: HookCommand) =>
  typeof h.command === "string" && h.command.includes(`${RUNNER} `);

export function wire(
  hooks: HooksConfig,
  specs: HookSpec[],
  vendor: Vendor,
): HooksConfig {
  const out: HooksConfig = {};
  for (const [event, groups] of Object.entries(hooks)) {
    const kept = groups
      .map((g) => ({ ...g, hooks: g.hooks.filter((h) => !owned(h)) }))
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

async function main(): Promise<number> {
  const parsed = cli(
    {
      name: "wire-hooks.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Wire the vendor-neutral hooks in agents/hooks/hooks.toml into agents/claude/settings.json and agents/codex/hooks.json. Rewrites only the entries that run ~/.agents/hooks/run.sh.",
      },
      flags: {
        check: {
          type: Boolean,
          default: false,
          description: "report drift and exit 1 instead of writing",
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0) {
    throw new UsageError(`Unexpected argument '${parsed._[0]}'`);
  }
  const { check } = parsed.flags;
  const root = process.env.DOTFILES ?? new URL("..", import.meta.url).pathname;
  const hooksDir = `${root}/agents/hooks`;

  const registry = Bun.TOML.parse(
    await Bun.file(`${hooksDir}/hooks.toml`).text(),
  );
  const { specs, errors } = parseRegistry(
    registry,
    (name) => Bun.file(`${hooksDir}/${name}`).size > 0,
  );
  if (errors.length > 0) {
    for (const e of errors) process.stdout.write(`invalid: ${e}\n`);
    return 2;
  }

  const targets: Record<Vendor, string> = {
    claude: `${root}/agents/claude/settings.json`,
    codex: `${root}/agents/codex/hooks.json`,
  };
  let drift = 0;
  for (const vendor of VENDORS) {
    const path = targets[vendor];
    const text = await Bun.file(path).text();
    const config = JSON.parse(text);
    const next = `${JSON.stringify({ ...config, hooks: wire(config.hooks ?? {}, specs, vendor) }, null, 2)}\n`;
    const rel = path.slice(root.length).replace(/^\//, "");
    if (next === text) {
      process.stdout.write(`current: ${rel}\n`);
      continue;
    }
    drift++;
    if (check) {
      process.stdout.write(`drift: ${rel} (run mise run hooks:wire)\n`);
    } else {
      await Bun.write(path, next);
      process.stdout.write(`wired: ${rel}\n`);
    }
  }
  return check && drift > 0 ? 1 : 0;
}

if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      process.stderr.write(
        `${err instanceof UsageError ? "usage" : "FATAL"}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(2);
    });
}
