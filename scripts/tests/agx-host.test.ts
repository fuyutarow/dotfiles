import { describe, expect, test } from "bun:test";
import { mkdtemp, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import { checkAgxHost, declareRentedCodexHost } from "../agx-host.ts";

const FIXTURE = join(import.meta.dir, "fixtures/agx-host/command.ts");
const ROOT = join(import.meta.dir, "../..");

async function setup(check = 1, declare = 0) {
  const home = await mkdtemp(join(tmpdir(), "agx-host-"));
  await Bun.write(join(home, "check.exit"), String(check));
  await Bun.write(join(home, "declare.exit"), String(declare));
  return home;
}

async function calls(home: string) {
  return (await Bun.file(join(home, "calls.jsonl")).text())
    .trim()
    .split("\n")
    .map((line) => {
      const parsed = jsonOf(z.array(z.string())).safeParse(line);
      expect(parsed.success).toBe(true);
      return parsed.data;
    });
}

async function run(
  check = 1,
  declare = 0,
  overrides: Partial<Parameters<typeof declareRentedCodexHost>[0]> = {},
) {
  const home = await setup(check, declare);
  const lines: string[] = [];
  const result = await declareRentedCodexHost({
    home,
    command: [process.execPath, FIXTURE],
    rented: true,
    hostname: "vast-box-17",
    date: "2026-10-08",
    probes: {
      isContainer: (): boolean => true,
      unshareUserNamespace: () =>
        Promise.resolve({
          code: 1,
          detail: "Operation not permitted",
        }),
    },
    say: (line) => {
      lines.push(line);
    },
    ...overrides,
  });
  return { result, lines, calls: await calls(home) };
}

describe("released host command provisioning", () => {
  test("absence plus all measured gates delegates declaration with one literal reason argument", async () => {
    const r = await run();
    expect(r.result).toBe("written");
    expect(r.calls).toEqual([
      ["check", "--json"],
      [
        "declare",
        "--unsandboxed-reason",
        "Rented Vast container vast-box-17; unshare -U true exited 1 (Operation not permitted); measured 2026-10-08.",
      ],
    ]);
    expect(r.lines).toEqual([
      "wrote agx host declaration: /owner/selected/declaration",
    ]);
  });

  test("valid declaration is left untouched without probing", async () => {
    const r = await run(0, 0, {
      probes: {
        isContainer: (): boolean => {
          expect.unreachable("must not probe");
        },
        unshareUserNamespace: () => {
          expect.unreachable("must not probe");
        },
      },
    });
    expect(r.result).toBe("existing");
    expect(r.calls).toEqual([["check", "--json"]]);
  });

  test.each([2, 75])(
    "exit %s refuses instead of treating it as absence",
    async (code) => {
      const r = await run(code, 0, {
        probes: {
          isContainer: (): boolean => {
            expect.unreachable("must not probe invalid declaration");
          },
          unshareUserNamespace: () => {
            expect.unreachable("must not probe");
          },
        },
      });
      expect(r.result).toBe("invalid");
      expect(r.lines[0]).toContain("agx host check failed");
      expect(r.calls).toEqual([["check", "--json"]]);
    },
  );

  test("declare refusal (including concurrent create) surfaces as failure", async () => {
    const r = await run(1, 2);
    expect(r.result).toBe("invalid");
    expect(r.lines[0]).toContain("declaration refused: existing entry");
  });

  test.each([
    ["not a rented container", { rented: false }],
    [
      "not a container",
      {
        probes: {
          isContainer: (): boolean => false,
          unshareUserNamespace: () =>
            Promise.resolve({ code: 1, detail: "denied" }),
        },
      },
    ],
    [
      "user namespaces are available",
      {
        probes: {
          isContainer: (): boolean => true,
          unshareUserNamespace: () => Promise.resolve({ code: 0, detail: "" }),
        },
      },
    ],
  ] as const)("failed gate never declares: %s", async (reason, overrides) => {
    const r = await run(1, 0, overrides);
    expect(r.result).toBe("skipped");
    expect(r.lines[0]).toContain(reason);
    expect(r.calls).toEqual([["check", "--json"]]);
  });
});

describe("mise release routing and CLI exit mapping", () => {
  test.each([0, 1, 2])(
    "check preserves released exit %s and JSON output",
    async (code) => {
      const home = await setup(code);
      const mise = join(home, "mise");
      // Fixture substituted for the driven binary; pass through the host arguments only.
      await Bun.write(
        mise,
        `#!${process.execPath}\nconst args = process.argv.slice(2);\nif (JSON.stringify(args.slice(0, 8)) !== JSON.stringify(["-C", ${JSON.stringify(ROOT)}, "exec", "--", "agx", "worker", "host", "check"])) process.exit(99);\nconst child = Bun.spawn([${JSON.stringify(process.execPath)}, ${JSON.stringify(FIXTURE)}, ...args.slice(7)], { stdout: "inherit", stderr: "inherit" });\nprocess.exitCode = await child.exited;\n`,
      );
      await chmod(mise, 0o700);
      const proc = Bun.spawn(
        [process.execPath, join(ROOT, "scripts/agx-host.ts"), "--check"],
        {
          env: {
            ...process.env,
            HOME: home,
            PATH: `${home}:${process.env["PATH"] ?? ""}`,
          },
          stdout: "pipe",
          stderr: "pipe",
          signal: AbortSignal.timeout(10_000),
        },
      );
      const [out, err, exit] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      expect(err).toBe("");
      expect(exit).toBe(code);
      expect(
        jsonOf(z.object({ status: z.string() })).safeParse(out).data?.status,
      ).toBe(["valid", "absent", "invalid"][code]);
      expect(await calls(home)).toEqual([["check", "--json"]]);
    },
  );

  test("public check helper maps unexpected failures to exit 2", async () => {
    const home = await setup(75);
    expect((await checkAgxHost(home, [process.execPath, FIXTURE])).code).toBe(
      2,
    );
  });
});
