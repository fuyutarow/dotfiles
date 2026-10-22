import { jsonOf, z } from "../../shared/src/zod.ts";
import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import rootPackage from "../../../package.json" with { type: "json" };
import wsPackage from "../../agx-ws/package.json" with { type: "json" };
import ticketPackage from "../../agx-ticket/package.json" with { type: "json" };

test("only prefixed workspace and ticket bins are exported", () => {
  expect(Object.hasOwn(rootPackage.bin, "ws")).toBe(false);
  expect(Object.hasOwn(rootPackage.bin, "tkt")).toBe(false);
  expect(rootPackage.bin["agx-ws"]).toBe("tools/agx-ws/src/ws.ts");
  expect(rootPackage.bin["agx-ticket"]).toBe("tools/agx-ticket/src/tkt.ts");
  expect(rootPackage.bin["agx-status"]).toBe("tools/agx-status/src/status.ts");
  expect(rootPackage.bin["agx-msg"]).toBe("tools/xmsg/src/xmsg.ts");
  expect(rootPackage.bin.xmsg).toBe("tools/xmsg/src/xmsg.ts");
  expect(Object.hasOwn(wsPackage.bin, "ws")).toBe(false);
  expect(Object.hasOwn(ticketPackage.bin, "tkt")).toBe(false);
  expect(wsPackage.bin["agx-ws"]).toBe("src/ws.ts");
  expect(ticketPackage.bin["agx-ticket"]).toBe("src/tkt.ts");
});

const entry = join(import.meta.dir, "../src/agx.ts");
async function fixture() {
  const bin = await mkdtemp(join(tmpdir(), "agx-path-"));
  for (const tool of ["worker", "ws", "ticket", "status", "msg"]) {
    const path = join(bin, `agx-${tool}`);
    await writeFile(
      path,
      `#!${process.execPath}\nif(process.argv[2]==="--help") { process.stdout.write("agx-${tool} v99.0.0\\n\\n${tool} description from owner\\n"); process.exitCode=Number(process.env.FAKE_EXIT ?? 0); } else { process.stdout.write(JSON.stringify({tool:${JSON.stringify(tool)},args:process.argv.slice(2)})+"\\n"); process.exitCode=Number(process.env.FAKE_EXIT ?? 0); }\n`,
    );
    await chmod(path, 0o755);
  }
  return {
    bin,
    async [Symbol.asyncDispose]() {
      await rm(bin, { recursive: true, force: true });
    },
  };
}
async function run(bin: string, args: string[], exit = 0) {
  const child = Bun.spawn([process.execPath, entry, ...args], {
    env: { ...process.env, PATH: bin, FAKE_EXIT: String(exit) },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  const [stdout, stderr, code] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}
test("suite forwards exact argv through PATH and preserves exit status", async () => {
  await using f = await fixture();
  for (const [tool, args] of [
    ["worker", ["ls"]],
    ["ws", ["ls"]],
    ["ticket", ["--help"]],
    ["status", ["--json", "a b.md", "--", "-Z", "雪"]],
    ["msg", ["send", "--to", "fixture:session", "--message", "hello world"]],
  ] as const) {
    // Only --help used by suite discovery is special in these fake bins.
    const result = await run(f.bin, [tool, ...args], 37);
    expect(result.stderr).toBe("");
    if (tool === "ticket") {
      expect(result.stdout).toContain("ticket description from owner");
    } else {
      expect(decode(result.stdout)).toEqual({ tool, args: [...args] });
      expect(result.code).toBe(37);
    }
    expect(result.code).toBe(37);
  }
  const raw = ["run", "a b.md", "--", "-Z", "雪"];
  const result = await run(f.bin, ["worker", ...raw], 23);
  expect(decode(result.stdout)).toEqual({ tool: "worker", args: raw });
  expect(result.code).toBe(23);
});
test.each([
  "run",
  "dispatch",
  "check",
  "ls",
  "judge",
  "stats",
  "roster",
  "doctor",
  "jev",
  "unknown",
  "constructor",
  "__proto__",
  "retired-tool",
  "agx-run",
])("suite rejects '%s' without dispatching", async (verb) => {
  await using f = await fixture();
  const result = await run(f.bin, [verb, "ticket.md"], 19);
  expect(result.code).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe(
    `agx: unknown tool '${verb}'; expected worker, ticket, ws, status, msg\n`,
  );
});
test("suite owns its version and takes descriptions from PATH tools", async () => {
  await using f = await fixture();
  for (const flag of ["-V", "--version"]) {
    const result = await run(f.bin, [flag]);
    expect(result.stdout).toBe(`agx ${pkg.version}\n`);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
  }
  const help = await run(f.bin, ["-h"]);
  expect(help.code).toBe(0);
  expect(help.stdout).not.toContain("99.0.0");
  for (const tool of ["worker", "ticket", "ws", "status", "msg"])
    expect(help.stdout).toContain(`  ${tool}  ${tool} description from owner`);
});
test("suite source contains only dispatch and discovery, with no owner modules", async () => {
  const source = await Bun.file(entry).text();
  expect(source).not.toMatch(
    /records\.jsonl|XDG_STATE|AGX_STATE|writeFile|mkdir|fileURLToPath/u,
  );
  expect(source).not.toMatch(
    /from\s+["'][^"']*agx-(?:worker|ws|ticket|status|msg)/u,
  );
});

function decode(text: string) {
  const parsed = jsonOf(
    z.object({ tool: z.string(), args: z.array(z.string()) }),
  ).safeParse(text);
  expect(parsed.success).toBe(true);
  return parsed.success ? parsed.data : undefined;
}
