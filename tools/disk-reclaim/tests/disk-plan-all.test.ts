import { expect, test } from "bun:test";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { main } from "../src/disk.ts";
import { diskTargetNames } from "../src/disk-targets/index.ts";
import { planTarget } from "../src/disk-target-plan.ts";

test("all targets preserve mixed adapter outcomes in one result", async () => {
  let output = "";
  let probes = 0;
  let actions = 0;
  const previous = process.exitCode;
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    process.exitCode = previous ?? 0;
  });
  await main(
    ["plan", "targets", "--all", "--no-progress"],
    undefined,
    (text) => {
      output += text;
    },
    undefined,
    undefined,
    undefined,
    {
      probe: () => {
        probes++;
        return Promise.resolve({
          out: "[]",
          err: "",
          exit: 0,
          timedOut: false,
        });
      },
      miseTarget: {
        name: "mise-configs",
        tier: "blind",
        available: () => ({ available: true, skip_reason: null }),
        plan: () => [],
        act: () => {
          actions++;
          return { ok: false, bytes_freed: null, error: "unexpected" };
        },
      },
    },
  );
  const parsed = jsonOf(
    z.object({
      schema: z.string(),
      scope: z.object({ targets: z.array(z.string()) }),
      outcome: z.string(),
      items: z.array(z.object({ target: z.string(), verdict: z.string() })),
    }),
  ).safeParse(output);
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  expect(parsed.data.schema).toBe("disk.result/1");
  expect(new Set(parsed.data.scope.targets)).toEqual(diskTargetNames);
  expect(parsed.data.outcome).toBe("unknown");
  expect(
    parsed.data.items.find((item) => item.target === "workspaces")?.verdict,
  ).toBe("unknown");
  expect(probes).toBe(7);
  expect(actions).toBe(0);
  expect(process.exitCode).toBe(4);
});

test("unknown plan target cannot reach toolchains probe", async () => {
  const result = await planTarget(
    "not-a-target",
    1000,
    new AbortController().signal,
  );
  expect(result.error).toContain("plan adapter unavailable");
});

test("tier selection uses the registered plan-only targets", async () => {
  let output = "";
  const previous = process.exitCode;
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    process.exitCode = previous ?? 0;
  });
  await main(
    ["plan", "targets", "--tier", "plan-only", "--no-progress"],
    undefined,
    (text) => {
      output += text;
    },
  );
  const parsed = jsonOf(
    z.object({
      scope: z.object({ targets: z.array(z.string()) }),
      items: z.array(z.object({ target: z.string(), verdict: z.string() })),
    }),
  ).safeParse(output);
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  expect(parsed.data.scope.targets).toEqual(["vhdx", "audit"]);
  expect(parsed.data.items.map((item) => item.verdict)).toEqual([
    "unknown",
    "unknown",
  ]);
});
