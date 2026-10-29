import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import {
  commandFor,
  type HookSpec,
  type HooksConfig,
  parseRegistry,
  loadRegistry,
  HooksConfigSchema,
  wire,
} from "../hook-registry.ts";

const ROOT = join(import.meta.dir, "..", "..");

test("Codex metadata bridge is canonical, Codex-only and wired once without replacing external Herdr ownership", async () => {
  const { specs, errors } = loadRegistry(join(ROOT, "agents/hooks"));
  expect(errors).toEqual([]);
  const metadata = specs.filter(
    (spec) => spec.script === "report-codex-herdr-metadata.ts",
  );
  expect(metadata).toEqual([
    {
      script: "report-codex-herdr-metadata.ts",
      event: "PostToolUse",
      matcher: "*",
      fail_closed: false,
      timeout: 10,
      vendors: ["codex"],
    },
  ]);
  const vendor = jsonOf(z.object({ hooks: HooksConfigSchema })).safeParse(
    await Bun.file(join(ROOT, "agents/codex/hooks.json")).text(),
  );
  expect(vendor.success).toBe(true);
  if (!vendor.success) return;
  expect(JSON.stringify(vendor.data.hooks)).not.toContain(
    "report-codex-herdr-metadata.ts",
  );
  const once = wire(vendor.data.hooks, specs, "codex");
  const twice = wire(once, specs, "codex");
  expect(twice).toEqual(once);
  expect(
    once["PostToolUse"]
      ?.flatMap((group) => group.hooks)
      .filter(
        (hook) =>
          hook["command"] ===
          "sh ~/.agents/hooks/run.sh report-codex-herdr-metadata.ts",
      ),
  ).toHaveLength(1);
  expect(JSON.stringify(wire({}, specs, "claude"))).not.toContain(
    "report-codex-herdr-metadata.ts",
  );
  expect(
    once["SessionStart"]
      ?.flatMap((group) => group.hooks)
      .filter(
        (hook) =>
          hook["command"] === "sh ~/.codex/herdr-agent-state.sh session",
      ),
  ).toHaveLength(1);
  const identities = z
    .object({
      hook: z.array(z.object({ slug: z.string(), script: z.string() })),
      vendor_hook: z.array(z.object({ slug: z.string(), script: z.string() })),
    })
    .safeParse(
      Bun.TOML.parse(
        await Bun.file(join(ROOT, "agents/hooks/hooks.toml")).text(),
      ),
    );
  expect(identities.success).toBe(true);
  if (!identities.success) return;
  const all = [...identities.data.hook, ...identities.data.vendor_hook];
  expect(new Set(all.map((identity) => identity.slug)).size).toBe(all.length);
  expect(new Set(all.map((identity) => identity.script)).size).toBe(all.length);
});

const storage: HookSpec = {
  script: "enforce-storage-headroom.ts",
  event: "PreToolUse",
  matcher: "Bash",
  fail_closed: true,
  vendors: ["claude", "codex"],
};

const vendorOnly: HooksConfig = {
  PreToolUse: [
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: "sh ~/.claude/hooks/run.sh assign-command.ts",
        },
        {
          type: "command",
          command: "sh ~/.agents/hooks/run.sh --fail-closed stale.ts",
        },
      ],
    },
  ],
  Stop: [
    {
      hooks: [
        { type: "command", command: "sh ~/.agents/hooks/run.sh gone.ts" },
      ],
    },
  ],
};

describe("wire", () => {
  test("the committed vendor files carry no registry-owned entry (one writer: lint:one-writer)", () => {
    const r = spawnSync(
      process.execPath,
      [join(ROOT, "scripts/one-writer-check.ts")],
      {
        encoding: "utf8",
        env: { ...process.env, DOTFILES: ROOT },
      },
    );
    expect(r.stdout).not.toContain("two writers:");
    expect(r.status).toBe(0);
  });

  test("the storage gate is wired into BOTH Claude and Codex", () => {
    for (const vendor of ["claude", "codex"] as const) {
      const out = wire({}, [storage], vendor);
      expect(out["PreToolUse"]?.[0]).toEqual({
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command:
              "sh ~/.agents/hooks/run.sh --fail-closed enforce-storage-headroom.ts",
          },
        ],
      });
    }
  });

  test("owned entries are replaced, vendor-specific ones kept, emptied groups dropped", () => {
    const out = wire(vendorOnly, [storage], "codex");
    expect(out["Stop"]).toBeUndefined();
    expect(out["PreToolUse"]).toEqual([
      {
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command: "sh ~/.claude/hooks/run.sh assign-command.ts",
          },
        ],
      },
      {
        matcher: "Bash",
        hooks: [{ type: "command", command: commandFor(storage) }],
      },
    ]);
  });

  test("idempotent", () => {
    const once = wire(vendorOnly, [storage], "claude");
    expect(wire(once, [storage], "claude")).toEqual(once);
  });

  test("a hook listed for one vendor never reaches the other", () => {
    const claudeOnly = { ...storage, vendors: ["claude" as const] };
    expect(wire({}, [claudeOnly], "codex")).toEqual({});
  });

  test("fail_closed=false omits the flag; timeout is carried", () => {
    const soft = { ...storage, fail_closed: false, timeout: 15 };
    expect(wire({}, [soft], "claude")["PreToolUse"]?.[0]?.hooks[0]).toEqual({
      type: "command",
      command: "sh ~/.agents/hooks/run.sh enforce-storage-headroom.ts",
      timeout: 15,
    });
  });
});

describe("parseRegistry", () => {
  test("reports every invalid field in one pass", () => {
    const { specs, errors } = parseRegistry(
      {
        hook: [
          {
            script: "../x.ts",
            event: "",
            fail_closed: "yes",
            vendors: ["cursor"],
          },
          {
            script: "missing.ts",
            event: "PreToolUse",
            fail_closed: true,
            vendors: ["codex"],
          },
        ],
      },
      () => false,
    );
    expect(specs).toEqual([]);
    expect(errors).toEqual([
      "hook[0].script must be a bare <name>.ts",
      "hook[0].event must be a non-empty string",
      "hook[0].fail_closed must be true or false",
      "hook[0].vendors must be a non-empty subset of claude, codex",
      "hook[1].script missing.ts is not in agents/hooks",
    ]);
  });

  test("the real registry is valid", async () => {
    const raw = Bun.TOML.parse(
      await Bun.file(join(ROOT, "agents/hooks/hooks.toml")).text(),
    );
    const { errors } = parseRegistry(
      raw,
      (n) => Bun.file(join(ROOT, "agents/hooks", n)).size > 0,
    );
    expect(errors).toEqual([]);
  });
});
