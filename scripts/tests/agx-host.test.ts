import { describe, expect, test } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { declareRentedCodexHost } from "../agx-host.ts";
import { readCodexHostDeclaration } from "../agx-host-declaration.ts";

const home = (): string => mkdtempSync(join(tmpdir(), "agx-host-"));

describe("codex host declaration reader", () => {
  test("accepts a valid declaration and trims its reason", () => {
    const path = join(home(), "host.toml");
    writeFileSync(path, 'schema = 1\nunsandboxed_reason = "  rented box  "\n');
    expect(readCodexHostDeclaration(path)).toEqual({
      kind: "valid",
      declaration: { unsandboxedReason: "rented box" },
    });
  });

  test.each([
    'schema = 1\nunsandboxed_reason = "unterminated',
    'schema = 2\nunsandboxed_reason = "rented box"\n',
    'schema = "1"\nunsandboxed_reason = "rented box"\n',
    'schema = 1\nunsandboxed_reason = "  "\n',
    "schema = 1\n",
    "schema = 1\nunsandboxed_reason = 17\n",
    'schema = 1\nunsandboxed_reason = "rented box"\nextra = true\n',
  ])("rejects an invalid declaration: %s", (contents) => {
    const path = join(home(), "host.toml");
    writeFileSync(path, contents);
    const result = readCodexHostDeclaration(path);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid")
      expect(result.reason).toContain(
        `${path} is not a valid host declaration`,
      );
  });

  test("reports a missing declaration as absent", () => {
    expect(readCodexHostDeclaration(join(home(), "agx/host.toml"))).toEqual({
      kind: "absent",
    });
  });

  test("reports a legacy declaration with the same migration diagnostic", () => {
    const root = home();
    const path = join(root, "agx/host.toml");
    const legacyPath = join(root, "codex-run/host.toml");
    mkdirSync(join(root, "codex-run"));
    writeFileSync(
      legacyPath,
      'schema = 1\nunsandboxed_reason = "rented box"\n',
    );
    expect(readCodexHostDeclaration(path)).toEqual({
      kind: "invalid",
      reason: `legacy host declaration found; run: mv "${legacyPath}" "${path}"`,
    });
  });
});

function run(
  overrides: Partial<Parameters<typeof declareRentedCodexHost>[0]> = {},
) {
  const root = home();
  const lines: string[] = [];
  const result = declareRentedCodexHost({
    home: root,
    rented: true,
    hostname: "vast-box-17",
    date: "2026-10-08",
    probes: {
      isContainer: () => true,
      unshareUserNamespace: () => ({
        code: 1,
        detail: "Operation not permitted",
      }),
    },
    say: (line) => {
      lines.push(line);
    },
    ...overrides,
  });
  return {
    root,
    lines,
    result,
    path: join(root, ".config/agx/host.toml"),
  };
}

describe("rented codex host bootstrap", () => {
  test("container + measured user namespace refusal + explicit rental writes a valid private declaration", () => {
    const r = run();
    expect(r.result).toBe("written");
    expect(r.lines).toEqual(["wrote ~/.config/agx/host.toml (0600)"]);
    const declaration = readCodexHostDeclaration(r.path);
    expect(declaration.kind).toBe("valid");
    if (declaration.kind === "valid")
      expect(declaration.declaration.unsandboxedReason).toContain(
        "vast-box-17",
      );
    const text = readFileSync(r.path, "utf8");
    expect(text).toContain("2026-10-08");
    expect(text).toContain("unshare -U true exited 1");
    expect(statSync(r.path).mode & 0o777).toBe(0o600);
    expect(statSync(join(r.root, ".config/agx")).mode & 0o777).toBe(0o700);
  });

  test.each([
    ["not a rented container", { rented: false }],
    [
      "not a container",
      {
        probes: {
          isContainer: (): boolean => false,
          unshareUserNamespace: () => ({ code: 1, detail: "denied" }),
        },
      },
    ],
    [
      "user namespaces are available",
      {
        probes: {
          isContainer: (): boolean => true,
          unshareUserNamespace: () => ({ code: 0, detail: "" }),
        },
      },
    ],
  ] as const)(
    "failed gate writes nothing and reports why: %s",
    (reason, overrides) => {
      const r = run(overrides);
      expect(r.result).toBe("skipped");
      expect(r.lines).toHaveLength(1);
      expect(r.lines[0]).toContain(reason);
      expect(() => lstatSync(r.path)).toThrow();
    },
  );

  test("an existing declaration is left untouched", () => {
    const root = home();
    const path = join(root, ".config/agx/host.toml");
    mkdirSync(join(root, ".config/agx"), { recursive: true });
    writeFileSync(path, "owned by the user\n", { mode: 0o640 });
    const lines: string[] = [];
    const result = declareRentedCodexHost({
      home: root,
      rented: true,
      hostname: "new-host",
      date: "2026-10-08",
      probes: {
        isContainer: () => true,
        unshareUserNamespace: () => ({ code: 1, detail: "denied" }),
      },
      say: (line) => {
        lines.push(line);
      },
    });
    expect(result).toBe("existing");
    expect(lines).toEqual(["existing ~/.config/agx/host.toml; left untouched"]);
    expect(readFileSync(path, "utf8")).toBe("owned by the user\n");
  });
});
