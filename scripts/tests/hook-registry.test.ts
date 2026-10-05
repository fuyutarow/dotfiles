import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  commandFor,
  type HookSpec,
  type HooksConfig,
  parseRegistry,
  wire,
} from "../hook-registry.ts";

const ROOT = join(import.meta.dir, "..", "..");

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
          command: "sh ~/.claude/hooks/run.sh detect-ccc-gpu-hold.ts",
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
      { encoding: "utf8", env: { ...process.env, DOTFILES: ROOT } },
    );
    expect(r.stdout).not.toContain("two writers:");
    expect(r.status).toBe(0);
  });

  test("the storage gate is wired into BOTH Claude and Codex", () => {
    for (const vendor of ["claude", "codex"] as const) {
      const out = wire({}, [storage], vendor);
      expect(out.PreToolUse?.[0]).toEqual({
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
    expect(out.Stop).toBeUndefined();
    expect(out.PreToolUse).toEqual([
      {
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command: "sh ~/.claude/hooks/run.sh detect-ccc-gpu-hold.ts",
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
    expect(wire({}, [soft], "claude").PreToolUse?.[0]?.hooks[0]).toEqual({
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
