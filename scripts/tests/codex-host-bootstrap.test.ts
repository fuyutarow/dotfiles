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
import { declareRentedCodexHost } from "../codex-host-bootstrap.ts";
import { readCodexHostDeclaration } from "../../tools/agent-dispatch/src/workers/codex-host.ts";

const home = (): string => mkdtempSync(join(tmpdir(), "codex-host-bootstrap-"));

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
    path: join(root, ".config/codex-run/host.toml"),
  };
}

describe("rented codex host bootstrap", () => {
  test("container + measured user namespace refusal + explicit rental writes a valid private declaration", () => {
    const r = run();
    expect(r.result).toBe("written");
    expect(r.lines).toEqual(["wrote ~/.config/codex-run/host.toml (0600)"]);
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
    expect(statSync(join(r.root, ".config/codex-run")).mode & 0o777).toBe(
      0o700,
    );
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
    const path = join(root, ".config/codex-run/host.toml");
    mkdirSync(join(root, ".config/codex-run"), { recursive: true });
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
    expect(lines).toEqual([
      "existing ~/.config/codex-run/host.toml; left untouched",
    ]);
    expect(readFileSync(path, "utf8")).toBe("owned by the user\n");
  });
});
