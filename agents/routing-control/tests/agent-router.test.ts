import { afterAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../hooks/zod.ts";
import { ROSTER_PATH } from "../../models/roster.ts";

// agent-router: the one entry point. A fake codex-run stands in for the worker (it records its argv and
// prints a receipt), a local server stands in for Jev, and every state file goes to a scratch dir.

const CLI = join(import.meta.dir, "..", "agent-router.ts");
const scratch = mkdtempSync(join(tmpdir(), "agent-router-test-"));
const server = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const body = await req.text();
    const confidence = body.includes("LOWCONF") ? 0.2 : 0.9;
    return Response.json({
      model: "fake-jev",
      answers: { worker: { type: "choice", choice: "luna-max", confidence, probabilities: { "luna-max": confidence } } },
      usage: { input_tokens: 10, output_tokens: 2 },
    });
  },
});
afterAll(() => {
  void server.stop(true);
  rmSync(scratch, { recursive: true, force: true });
});

const FAKE = join(scratch, "fake-codex-run.ts");
writeFileSync(
  FAKE,
  `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(join(scratch, "argv.log"))}, JSON.stringify(Bun.argv.slice(2)) + "\\n");
const exit = Number(process.env.FAKE_EXIT ?? "0");
console.log(JSON.stringify({ schema: 1, outcome: exit === 0 ? "ok" : "codex-failed", elapsed_s: 1.5, usage: { input_tokens: 100, output_tokens: 7 } }));
process.exit(exit);
`,
);

function roster(name: string, edit: (t: string) => string): string {
  const path = join(scratch, `${name}.toml`);
  writeFileSync(path, edit(readFileSync(ROSTER_PATH, "utf8")));
  return path;
}
const withJev = (t: string): string =>
  t.replace(/^\[auto\.jev\][\s\S]*?(?=\n\[)/mu, `[auto.jev]\napi = "reseller"\nurl = "${server.url.href}"\n`);
const LIVE_JEV = roster("live", withJev);
const ALL_ON = roster("all-on", (t) => withJev(t).replaceAll("enabled = false", "enabled = true"));
const NO_EGRESS = roster("no-egress", (t) =>
  withJev(t).replace("no_egress = []", `no_egress = [${JSON.stringify(scratch)}]`),
);

const brief = (name: string, text: string): string => {
  const p = join(scratch, `${name}.md`);
  writeFileSync(p, text);
  return p;
};

// Async on purpose: the fake Jev server lives in THIS process, so a synchronous spawn would block
// the event loop it needs to answer.
async function router(args: string[], env: Record<string, string> = {}) {
  const r = Bun.spawn([process.execPath, CLI, ...args], {
    env: {
      ...process.env,
      AGENT_ROUTER_STATE_DIR: join(scratch, "state"),
      AGENT_ROUTER_CODEX_RUN: FAKE,
      DISPATCH_ROSTER_PATH: LIVE_JEV,
      TYPESAFE_API_KEY: "fixture-key",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  const [out, err, code] = await Promise.all([
    new Response(r.stdout).text(),
    new Response(r.stderr).text(),
    r.exited,
  ]);
  return { code, out, err };
}

const Receipt = z.looseObject({
  exit: z.number(),
  pick: z.looseObject({ source: z.string(), choice: z.string(), reason: z.string() }),
  worker: z.looseObject({ outcome: z.string() }),
});

describe("agent-router run", () => {
  const b = brief("task", "Fix the flaky test in scripts/tests.\n");

  test("an explicit row runs codex-run with that row, logs, and leaves no running marker", async () => {
    const r = await router(["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only", "--choice", "luna-high"]);
    expect(r.code).toBe(0);
    const receipt = jsonOf(Receipt).parse(r.out.trim());
    expect(receipt.pick.source).toBe("explicit");
    expect(receipt.worker.outcome).toBe("ok");
    expect(readFileSync(join(scratch, "argv.log"), "utf8")).toContain('"--choice","luna-high"');
    expect(readFileSync(join(scratch, "state", "runs.jsonl"), "utf8")).toContain('"kind":"run"');
    expect(readdirSync(join(scratch, "state", "active"))).toEqual([]);
  });

  test("the worker's exit code is agent-router's exit code", async () => {
    const r = await router(["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only", "--choice", "luna-high"], { FAKE_EXIT: "1" });
    expect(r.code).toBe(1);
    expect(jsonOf(Receipt).parse(r.out.trim()).worker.outcome).toBe("codex-failed");
  });

  test("auto: a confident Jev answer picks its row", async () => {
    const r = await router(["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only"]);
    const receipt = jsonOf(Receipt).parse(r.out.trim());
    expect(receipt.pick.source).toBe("jev");
    expect(receipt.pick.choice).toBe("luna-max");
  });

  test("auto: low confidence falls back to the default and says why", async () => {
    const low = brief("low", "LOWCONF something vague\n");
    const r = await router(["run", "--prompt-file", low, "--cd", scratch, "--sandbox", "read-only"]);
    const receipt = jsonOf(Receipt).parse(r.out.trim());
    expect(receipt.pick.source).toBe("default");
    expect(receipt.pick.choice).toBe("luna-high");
    expect(receipt.pick.reason).toContain("confidence 0.20");
  });

  test("auto: no key falls back to the default and names where it looked", async () => {
    const r = await router(["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only"], {
      TYPESAFE_API_KEY: "",
      PATH: "/usr/bin:/bin",
      HOME: scratch,
    });
    const receipt = jsonOf(Receipt).parse(r.out.trim());
    expect(receipt.pick.source).toBe("default");
    expect(receipt.pick.reason).toContain("no TYPESAFE_API_KEY");
  });

  test("auto: a cwd under no_egress never calls Jev", async () => {
    const r = await router(["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only"], { DISPATCH_ROSTER_PATH: NO_EGRESS });
    const receipt = jsonOf(Receipt).parse(r.out.trim());
    expect(receipt.pick.source).toBe("default");
    expect(receipt.pick.reason).toContain("no_egress");
  });

  test("a disabled row is refused before anything starts", async () => {
    const r = await router(["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only", "--choice", "sonnet-high"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("disabled in the roster");
  });

  test("an enabled Claude row is refused with the Agent call to make", async () => {
    const r = await router(["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only", "--choice", "sonnet-high"], { DISPATCH_ROSTER_PATH: ALL_ON });
    expect(r.code).toBe(2);
    expect(r.err).toContain(`subagent_type:"sonnet-high"`);
  });

  test("a bad --sandbox is refused", async () => {
    const r = await router(["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "danger-full-access"]);
    expect(r.code).toBe(2);
  });
});

describe("agent-router ls and stats", () => {
  test("a marker whose process is gone is reported as stale, not hidden", async () => {
    const active = join(scratch, "state", "active");
    mkdirSync(active, { recursive: true });
    writeFileSync(
      join(active, "dead.json"),
      JSON.stringify({ schema: 1, run_id: "dead", pid: 2_147_483_000, label: "gone", choice: "luna-high", pick_source: "explicit", started_at: "2026-10-05T00:00:00Z", cwd: scratch }),
    );
    const r = await router(["ls"]);
    expect(r.err).toContain("STALE");
    expect(r.out).toContain('"alive":false');
    rmSync(join(active, "dead.json"));
  });

  test("stats counts picks by source and runs by row", async () => {
    const r = await router(["stats"]);
    expect(r.code).toBe(0);
    const report = jsonOf(
      z.looseObject({ by_source: z.record(z.string(), z.number()), per_choice: z.record(z.string(), z.unknown()) }),
    ).parse(r.out.trim());
    expect(report.by_source.explicit).toBeGreaterThan(0);
    expect(report.by_source.jev).toBeGreaterThan(0);
    expect(report.by_source.default).toBeGreaterThan(0);
    expect(Object.keys(report.per_choice)).toContain("luna-max");
  });

  test("no state dir yet: ls and stats still answer", async () => {
    expect(existsSync(join(scratch, "empty"))).toBe(false);
    expect((await router(["ls"], { AGENT_ROUTER_STATE_DIR: join(scratch, "empty") })).err).toContain("nothing running");
    expect((await router(["stats"], { AGENT_ROUTER_STATE_DIR: join(scratch, "empty") })).code).toBe(0);
  });
});
