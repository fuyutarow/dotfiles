// Synthetic repos for scripts/lint-tool-declarations.ts: each test starts from a repo that passes and
// breaks exactly one hand-written list (or the declaration), then names what the check must say.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  fragmentList,
  readmeRows,
  toolDeclarationProblems,
} from "#root/lint-tool-declarations.ts";
import { probeFile } from "#root/tool-probe.ts";
import { parseToolDeclaration } from "@dotfiles/shared/src/tool-declaration.ts";

const PURPOSE = "Copies things; `c` calls it.";
const TOOL_TOML = `name = "demo"
kind = "A"
purpose = "${PURPOSE}"
shell = "shell.zsh"
consumers = ["zsh/aliases.zsh"]

[bins]
demo = "src/demo.ts"

[probes.roundtrip]
file = "src/doctor-demo.ts"
task = "doctor:demo"
`;

const FILES: Record<string, string> = {
  "package.json": JSON.stringify({
    bin: { demo: "tools/demo/src/demo.ts", other: "tools/other/src/other.ts" },
  }),
  "tools/demo/package.json": JSON.stringify({ bin: { demo: "src/demo.ts" } }),
  "tools/demo/tool.toml": TOOL_TOML,
  "tools/demo/shell.zsh": "democopy() { demo; }\n",
  "tools/demo/src/demo.ts": "export {};\n",
  "tools/demo/src/doctor-demo.ts": "export {};\n",
  "tools/other/package.json": JSON.stringify({ bin: {} }),
  "README.md": `| Bin | Kind | Reason |\n|---|---|---|\n| \`demo\` | A | ${PURPOSE} |\n`,
  "zsh/aliases.zsh":
    "TOOL_SHELL_FRAGMENTS=(\n  tools/demo/shell.zsh\n)\nq() { democopy; }\n",
  "mise.toml": `[tasks."doctor:demo"]\nrun = "bun scripts/tool-probe.ts demo roundtrip"\n`,
  "lint/tool-declarations-baseline.txt": "# comment\nother\n",
};
const REGISTRY = new Set(["tools/demo/package.json", "tools/demo/tool.toml"]);

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

async function repo(
  change: Record<string, string | null> = {},
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tool-declarations-"));
  roots.push(root);
  for (const [path, body] of Object.entries({ ...FILES, ...change })) {
    if (body === null) continue;
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), body);
  }
  return root;
}

async function problems(
  change: Record<string, string | null> = {},
  registry: ReadonlySet<string> = REGISTRY,
): Promise<string> {
  const root = await repo(change);
  const result = await toolDeclarationProblems(root, {
    registrySources: registry,
  });
  return result.problems.join("\n");
}

describe("a repo whose lists agree with its declaration", () => {
  test("has no problems and counts the undeclared tool", async () => {
    const root = await repo();
    const result = await toolDeclarationProblems(root, {
      registrySources: REGISTRY,
    });
    expect(result.problems).toEqual([]);
    expect(result.undeclared).toEqual(["other"]);
  });
});

describe("every hand-written list is compared with the declaration", () => {
  test("a declared bin missing from the root package.json", async () => {
    const out = await problems({
      "package.json": JSON.stringify({ bin: {} }),
    });
    expect(out).toContain(
      'bin "demo" is declared but missing from root package.json',
    );
  });

  test("a root bin that points elsewhere than declared", async () => {
    const out = await problems({
      "package.json": JSON.stringify({
        bin: { demo: "tools/demo/src/old.ts" },
      }),
    });
    expect(out).toContain(
      'bin "demo" is tools/demo/src/old.ts in root package.json, declared tools/demo/src/demo.ts',
    );
  });

  test("a root bin into the tool that no declaration names", async () => {
    const out = await problems({
      "package.json": JSON.stringify({
        bin: {
          demo: "tools/demo/src/demo.ts",
          extra: "tools/demo/src/extra.ts",
        },
      }),
    });
    expect(out).toContain(
      'root package.json bin "extra" points into the tool but is not declared',
    );
  });

  test("the tool's own package.json disagreeing", async () => {
    const out = await problems({
      "tools/demo/package.json": JSON.stringify({
        bin: { demo: "src/elsewhere.ts" },
      }),
    });
    expect(out).toContain("tools/demo/package.json");
  });

  test("a missing README row", async () => {
    const out = await problems({ "README.md": "| Bin | Kind | Reason |\n" });
    expect(out).toContain("no README tool-table row for `demo`");
  });

  test("a README row whose Reason differs from the purpose", async () => {
    const out = await problems({
      "README.md": "| `demo` | A | Something older. |\n",
    });
    expect(out).toContain(
      "README row Reason differs from the declared purpose",
    );
  });

  test("a README row with another Kind", async () => {
    const out = await problems({
      "README.md": `| \`demo\` | B | ${PURPOSE} |\n`,
    });
    expect(out).toContain('README row Kind is "B", declared "A"');
  });

  test("a tool the registry does not list", async () => {
    const out = await problems({}, new Set(["tools/demo/package.json"]));
    expect(out).toContain(
      "tools/demo/tool.toml is a source of no scripts/config-registry.ts row",
    );
  });

  test("a shell fragment that does not exist", async () => {
    const out = await problems({ "tools/demo/shell.zsh": null });
    expect(out).toContain(
      "declared shell fragment tools/demo/shell.zsh does not exist",
    );
  });

  test("a declared fragment missing from the aliases list", async () => {
    const out = await problems({
      "zsh/aliases.zsh": "TOOL_SHELL_FRAGMENTS=(\n)\nq() { democopy; }\n",
    });
    expect(out).toContain(
      "tools/demo/shell.zsh is declared but not in zsh/aliases.zsh TOOL_SHELL_FRAGMENTS",
    );
  });

  test("an aliases-list entry that no declaration names", async () => {
    const out = await problems({
      "zsh/aliases.zsh":
        "TOOL_SHELL_FRAGMENTS=(\n  tools/demo/shell.zsh\n  tools/ghost/shell.zsh\n)\nq() { democopy; }\n",
    });
    expect(out).toContain(
      "lists tools/ghost/shell.zsh, which no tool.toml declares",
    );
  });

  test("a probe file that does not exist", async () => {
    const out = await problems({ "tools/demo/src/doctor-demo.ts": null });
    expect(out).toContain(
      'probe "roundtrip" file tools/demo/src/doctor-demo.ts does not exist',
    );
  });

  test("a probe task absent from mise.toml, or running something else", async () => {
    expect(await problems({ "mise.toml": "" })).toContain(
      'task "doctor:demo" is not in mise.toml',
    );
    expect(
      await problems({
        "mise.toml": `[tasks."doctor:demo"]\nrun = "bun scripts/doctor-demo.ts"\n`,
      }),
    ).toContain("must run `scripts/tool-probe.ts demo roundtrip`");
  });

  test("a consumer that is gone or no longer mentions the tool", async () => {
    expect(
      await problems({
        "tools/demo/tool.toml": TOOL_TOML.replace(
          "zsh/aliases.zsh",
          "zsh/gone.zsh",
        ),
      }),
    ).toContain("consumer zsh/gone.zsh does not exist");
    expect(
      await problems({
        "tools/demo/tool.toml": TOOL_TOML.replace(
          "zsh/aliases.zsh",
          "tools/other/package.json",
        ),
      }),
    ).toContain(
      "consumer tools/other/package.json mentions none of: demo, democopy",
    );
  });

  test("a *.zsh file or src/doctor-*.ts the declaration does not name", async () => {
    const out = await problems({
      "tools/demo/extra.zsh": "x() { :; }\n",
      "tools/demo/src/doctor-extra.ts": "export {};\n",
    });
    expect(out).toContain(
      "tools/demo/extra.zsh is a shell fragment that tool.toml does not declare",
    );
    expect(out).toContain(
      "tools/demo/src/doctor-extra.ts is a probe that tool.toml does not declare",
    );
  });

  test("a declaration with an unknown field or invalid TOML", async () => {
    expect(
      await problems({
        "tools/demo/tool.toml": `${TOOL_TOML}\nflavour = "x"\n`,
      }),
    ).toContain("tools/demo/tool.toml:");
    expect(await problems({ "tools/demo/tool.toml": "name = [" })).toContain(
      "not valid TOML",
    );
  });

  test("a name that is not the directory", async () => {
    const out = await problems({
      "tools/demo/tool.toml": TOOL_TOML.replace(
        'name = "demo"',
        'name = "dem"',
      ),
    });
    expect(out).toContain('name "dem" must equal the directory "demo"');
  });
});

describe("tools without a declaration are a ratchet", () => {
  test("a new undeclared tool outside the baseline fails", async () => {
    const out = await problems({
      "tools/fresh/package.json": "{}",
    });
    expect(out).toContain(
      "tools/fresh has no tool.toml and is not in lint/tool-declarations-baseline.txt",
    );
  });

  test("a baseline line for a tool that now declares itself fails (count may only shrink, and says so)", async () => {
    const out = await problems({
      "lint/tool-declarations-baseline.txt": "other\ndemo\n",
    });
    expect(out).toContain("lists demo, which now declares itself or is gone");
    expect(out).toContain("count 2 → 1");
  });

  test("a missing baseline file fails", async () => {
    expect(
      await problems({ "lint/tool-declarations-baseline.txt": null }),
    ).toContain("is missing");
  });
});

describe("parsers and the probe lookup", () => {
  test("readmeRows keys rows by the first column", () => {
    const rows = readmeRows("| `a` | A | one. |\n| `b` | B | two. |\n");
    expect(rows.get("b")).toEqual({ kind: "B", reason: "two." });
  });

  test("fragmentList reads entries and ignores comments", () => {
    expect(
      fragmentList("TOOL_SHELL_FRAGMENTS=(\n  a/b.zsh # why\n  c/d.zsh\n)\n"),
    ).toEqual(["a/b.zsh", "c/d.zsh"]);
    expect(fragmentList("nothing here")).toBeUndefined();
  });

  test("parseToolDeclaration rejects a path that leaves the tool directory", () => {
    const parsed = parseToolDeclaration(
      TOOL_TOML.replace('shell = "shell.zsh"', 'shell = "../x.zsh"'),
    );
    expect(parsed.ok).toBe(false);
  });

  test("probeFile finds a probe through the declaration", async () => {
    const root = await repo();
    expect(await probeFile(root, "demo", "roundtrip")).toEqual({
      file: join(root, "tools/demo/src/doctor-demo.ts"),
    });
    expect(await probeFile(root, "demo", "nope")).toHaveProperty("error");
    expect(await probeFile(root, "other", "x")).toHaveProperty("error");
  });
});

describe("this repository", () => {
  test("smart-copy's lists agree with tools/smart-copy/tool.toml", async () => {
    const root = join(import.meta.dir, "..", "..");
    const { surfaces } = await import("#root/config-registry.ts");
    const result = await toolDeclarationProblems(root, {
      registrySources: new Set(
        surfaces().flatMap((surface) => surface.sources),
      ),
    });
    expect(result.problems).toEqual([]);
    const baseline = await readFile(
      join(root, "lint/tool-declarations-baseline.txt"),
      "utf8",
    );
    expect(baseline).not.toContain("smart-copy");
  });
});
