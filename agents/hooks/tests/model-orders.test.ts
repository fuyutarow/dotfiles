import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Floors,
  type Order,
  compareVersions,
  judge,
  modelName,
  ordersIn,
  parseFloorConfig,
  simpleCommands,
} from "../../../tools/shared/src/model-orders.ts";

const parseToml = (text: string): unknown => Bun.TOML.parse(text);

// The REAL floors: these tests are also the guard that the shipped file parses and says what the
// policy says (sol >= 6.1, grok >= 4.7, ...).
const loaded = parseFloorConfig(
  parseToml(
    readFileSync(join(import.meta.dir, "..", "model-floor.toml"), "utf8"),
  ),
);
expect(loaded.ok).toBe(true);
const FLOORS: Floors = loaded.ok ? loaded.floors : new Map();

/** The verdicts for every order in a command ("ok" when it passes). */
function verdicts(command: string): string[] {
  return ordersIn(command).map((o) => judge(o, FLOORS) ?? "ok");
}
const only = (command: string): Order => {
  const orders = ordersIn(command);
  expect(orders).toHaveLength(1);
  const first = orders[0];
  return (
    first ?? {
      cli: "codex",
      model: { kind: "absent" },
      needsModel: false,
      label: "codex",
    }
  );
};

describe("simpleCommands: words the way a shell cuts them", () => {
  test("quotes make one word and are removed", () => {
    expect(simpleCommands(`echo "a b" 'c d' e\\ f`)).toEqual([
      ["echo", "a b", "c d", "e f"],
    ]);
  });
  test("; & && | || newline ( ) $( and backtick end a command", () => {
    expect(simpleCommands("a; b && c | d || e\nf $(g) `h`")).toEqual([
      ["a"],
      ["b"],
      ["c"],
      ["d"],
      ["e"],
      ["f"],
      ["g"],
      ["h"],
    ]);
  });
  test("a heredoc body is data: it is skipped through its closing line", () => {
    const cmd = "cat <<'EOF' > f\ncodex exec -m gpt-5.6-sol\nEOF\nls";
    expect(simpleCommands(cmd)).toEqual([["cat", ">", "f"], ["ls"]]);
  });
  test("<<- strips leading tabs on the closing line; two heredocs on one line", () => {
    expect(simpleCommands("cat <<-A <<B\n\tx\n\tA\ny\nB\nls")).toEqual([
      ["cat"],
      ["ls"],
    ]);
  });
  test("a comment runs to the end of the line, but # inside a word is text", () => {
    expect(simpleCommands("ls # codex exec -m x\necho a#b")).toEqual([
      ["ls"],
      ["echo", "a#b"],
    ]);
  });
  test("a backslash before newline joins the lines", () => {
    expect(simpleCommands("ls \\\n-la")).toEqual([["ls", "-la"]]);
  });
  test('double-quote escapes: only \\" \\\\ \\$ \\` are escapes', () => {
    expect(simpleCommands(String.raw`echo "a\"b" "c\d"`)).toEqual([
      ["echo", 'a"b', "c\\d"],
    ]);
  });
});

describe("ordersIn: what actually RUNS a model CLI", () => {
  test("codex exec with -m, --model, --model=, -mX and -c model=", () => {
    for (const cmd of [
      "codex exec -m gpt-6.1-sol 'hi'",
      "codex exec --model gpt-6.1-sol 'hi'",
      "codex exec --model=gpt-6.1-sol 'hi'",
      "codex exec -mgpt-6.1-sol 'hi'",
      `codex exec -c 'model="gpt-6.1-sol"' 'hi'`,
      "codex exec --config model=gpt-6.1-sol 'hi'",
      "codex exec --config=model=gpt-6.1-sol 'hi'",
    ]) {
      const o = only(cmd);
      expect(o.cli).toBe("codex");
      expect(o.model).toEqual({ kind: "literal", slug: "gpt-6.1-sol" });
      expect(o.needsModel).toBe(true);
    }
  });
  test("a -c override of something other than model is not a model", () => {
    expect(
      only(`codex exec -c 'model_reasoning_effort="high"' 'hi'`).model,
    ).toEqual({
      kind: "absent",
    });
  });
  test("a bare codex exec / e / review names no model and must", () => {
    for (const cmd of ["codex exec 'hi'", "codex e 'hi'", "codex review"]) {
      const o = only(cmd);
      expect(o.model).toEqual({ kind: "absent" });
      expect(o.needsModel).toBe(true);
    }
  });
  test("codex exec resume/fork continues a session: not a new order", () => {
    expect(ordersIn("codex exec resume --last")).toEqual([]);
    expect(ordersIn("codex exec fork abc")).toEqual([]);
  });
  test("codex without an ordering subcommand is not an order", () => {
    for (const cmd of [
      "codex --version",
      "codex login",
      "codex mcp list",
      "codex",
    ]) {
      expect(ordersIn(cmd)).toEqual([]);
    }
  });
  test("codex --oss runs a local model: no floor applies", () => {
    expect(ordersIn("codex exec --oss -m gpt-oss:20b 'hi'")).toEqual([]);
  });
  test("a model passed to a non-ordering codex call is still judged", () => {
    expect(only("codex -m gpt-5.6-sol").needsModel).toBe(false);
  });
  test("flag values are not mistaken for the subcommand", () => {
    const o = only("codex -c model=gpt-6.1-sol -s read-only exec 'hi'");
    expect(o.label).toBe("codex exec");
  });
  test("grok: an explicit model is an order; none is the vendor default", () => {
    expect(only("grok -p 'x' -m grok-4.7").model).toEqual({
      kind: "literal",
      slug: "grok-4.7",
    });
    expect(only("grok -p 'x' --model=grok-4.5").model).toEqual({
      kind: "literal",
      slug: "grok-4.5",
    });
    expect(ordersIn("grok -p 'x'")).toEqual([]);
    expect(ordersIn("grok models")).toEqual([]);
  });
  test("claude: an explicit --model is an order; agents/mcp are not", () => {
    expect(only("claude -p 'x' --model opus").model).toEqual({
      kind: "literal",
      slug: "opus",
    });
    expect(ordersIn("claude agents --json")).toEqual([]);
    expect(ordersIn("claude -p 'x'")).toEqual([]);
  });
  test("agy -p must name its model; a model without -p is judged too", () => {
    const bare = only("agy -p 'x'");
    expect(bare.model).toEqual({ kind: "absent" });
    expect(bare.needsModel).toBe(true);
    expect(
      only(`agy --model "Claude Sonnet 4.6 (Thinking)" -p 'x'`).model,
    ).toEqual({
      kind: "literal",
      slug: "Claude Sonnet 4.6 (Thinking)",
    });
    expect(ordersIn("agy models")).toEqual([]);
  });
  test("a MENTION is not an order: echo, quoted text, a commit message, a heredoc", () => {
    for (const cmd of [
      "echo codex exec -m gpt-5.6-sol",
      `echo "codex exec -m gpt-5.6-sol"`,
      `rr text 'codex exec -m gpt-5.6-sol'`,
      `git commit -m "docs: codex exec -m gpt-5.6-sol is retired"`,
      `mise run commit -- -m "$(cat <<'EOF'\nuse codex exec -m gpt-5.6-sol\nEOF\n)" -- f`,
      "cat <<'EOF'\ncodex exec -m gpt-5.6-sol\nEOF",
      "ls codex-update.ts",
      "bun test tools/agent-dispatch",
      "which codex",
    ]) {
      expect(ordersIn(cmd)).toEqual([]);
    }
  });
  test("wrappers are looked through: env, timeout, sudo, time, absolute path, systemd-run, bash -c", () => {
    for (const cmd of [
      "env A=1 codex exec -m gpt-5.6-sol 'x'",
      "A=1 B=2 codex exec -m gpt-5.6-sol 'x'",
      "timeout 300 codex exec -m gpt-5.6-sol 'x'",
      "timeout -s KILL 300 codex exec -m gpt-5.6-sol 'x'",
      "sudo -u me codex exec -m gpt-5.6-sol 'x'",
      "time nice -n 5 codex exec -m gpt-5.6-sol 'x'",
      "/usr/local/bin/codex exec -m gpt-5.6-sol 'x'",
      "systemd-run --user --unit=x -- codex exec -m gpt-5.6-sol 'x'",
      "agent-resource-run --manifest m.json -- codex exec -m gpt-5.6-sol 'x'",
      `bash -c "codex exec -m gpt-5.6-sol 'x'"`,
      `bash -lc 'timeout 60 codex exec -m gpt-5.6-sol x'`,
      "cd /tmp && (codex exec -m gpt-5.6-sol 'x')",
      "echo $(codex exec -m gpt-5.6-sol 'x')",
    ]) {
      expect(only(cmd).model).toEqual({ kind: "literal", slug: "gpt-5.6-sol" });
    }
  });
  test("a NAME=slug assignment earlier in the same command is followed", () => {
    expect(only(`M=gpt-6.1-sol; codex exec -m "$M" 'x'`).model).toEqual({
      kind: "literal",
      slug: "gpt-6.1-sol",
    });
    expect(
      only(`export_x=1 M=gpt-6.1-sol codex exec -m \${M} 'x'`).model,
    ).toEqual({
      kind: "literal",
      slug: "gpt-6.1-sol",
    });
  });
  test("a variable that cannot be resolved is unresolved, not guessed", () => {
    expect(only(`codex exec -m "$MODEL" 'x'`).model).toEqual({
      kind: "unresolved",
      raw: "$MODEL",
    });
    expect(only("codex exec -m $(cat m) 'x'").model.kind).toBe("unresolved");
  });
  test("several orders in one command are all found", () => {
    expect(
      ordersIn(
        "codex exec -m gpt-5.6-sol 'a' | tee o; grok -p 'b' -m grok-4.5",
      ).map((o) => o.cli),
    ).toEqual(["codex", "grok"]);
  });
});

describe("compareVersions", () => {
  test("numeric and zero-padded: 6 < 6.1 < 6.2 < 7, 6 === 6.0, 6.10 > 6.9", () => {
    expect(compareVersions("6", "6.1")).toBe(-1);
    expect(compareVersions("6.1", "6.2")).toBe(-1);
    expect(compareVersions("6.2", "7")).toBe(-1);
    expect(compareVersions("6", "6.0")).toBe(0);
    expect(compareVersions("6.10", "6.9")).toBe(1);
    expect(compareVersions("5.6", "6")).toBe(-1);
  });
});

describe("modelName", () => {
  test("each vendor's shape", () => {
    expect(modelName("gpt-6.1-sol", "codex")).toEqual({
      vendor: "openai",
      family: "sol",
      version: "6.1",
    });
    expect(modelName("grok-4.7-build-fast", "grok")).toEqual({
      vendor: "xai",
      family: "grok",
      version: "4.7",
    });
    expect(modelName("claude-haiku-4-5-20251001", "claude")).toEqual({
      vendor: "anthropic",
      family: "haiku",
      version: "4.5",
    });
    expect(modelName("claude-3-5-sonnet-20241022", "claude")).toEqual({
      vendor: "anthropic",
      family: "sonnet",
      version: "3.5",
    });
    expect(modelName("gemini-3.6-flash-high", "agy")).toEqual({
      vendor: "google",
      family: "flash",
      version: "3.6",
    });
    expect(modelName("gemini-3.5-flash-lite", "agy")?.family).toBe(
      "flash-lite",
    );
  });
  test("agy display strings are normalised", () => {
    expect(modelName("Claude Sonnet 4.6 (Thinking)", "agy")).toEqual({
      vendor: "anthropic",
      family: "sonnet",
      version: "4.6",
    });
    expect(modelName("Gemini 3.6 Flash (Medium)", "agy")).toEqual({
      vendor: "google",
      family: "flash",
      version: "3.6",
    });
  });
  test("a shape it does not know is undefined", () => {
    expect(modelName("gpt-5.5", "codex")).toBeUndefined();
    expect(modelName("o3", "codex")).toBeUndefined();
    expect(modelName("grok-code-fast-1", "grok")).toBeUndefined();
  });
});

describe("judge — the floors as shipped", () => {
  test("codex: sol >= 6.1 passes, anything older is named with the smallest edit", () => {
    expect(verdicts("codex exec -m gpt-6.1-sol x")).toEqual(["ok"]);
    expect(verdicts("codex exec -m gpt-6.2-sol x")).toEqual(["ok"]);
    expect(verdicts("codex exec -m gpt-7-sol x")).toEqual(["ok"]);
    const old = verdicts("codex exec -m gpt-5.6-sol x")[0] ?? "";
    expect(old).toContain("below the openai sol floor >= 6.1");
    expect(old).toContain("gpt-6.1-sol");
    expect(verdicts("codex exec -m gpt-6-sol x")[0]).toContain(
      "generation 6, below",
    );
  });
  test("codex: every family has its own floor (terra 5.6, luna 6, astra 6)", () => {
    expect(verdicts("codex exec -m gpt-5.6-terra x")).toEqual(["ok"]);
    expect(verdicts("codex exec -m gpt-5.5-terra x")[0]).toContain(
      "terra floor >= 5.6",
    );
    expect(verdicts("codex exec -m gpt-6-luna x")).toEqual(["ok"]);
    expect(verdicts("codex exec -m gpt-5.6-luna x")[0]).toContain(
      "luna floor >= 6",
    );
    expect(verdicts("codex exec -m gpt-6-astra x")).toEqual(["ok"]);
  });
  test("codex: an unknown family or a non-family slug is denied, not allowed by default", () => {
    expect(verdicts("codex exec -m gpt-7-nova x")[0]).toContain("has no floor");
    expect(verdicts("codex exec -m gpt-5.5 x")[0]).toContain(
      "not a current-generation codex",
    );
    expect(verdicts("codex exec -m o3 x")[0]).toContain(
      "not a current-generation codex",
    );
  });
  test("codex: a bare exec is denied and the message says what to type", () => {
    const v = verdicts("codex exec 'hi'")[0] ?? "";
    expect(v).toContain("names no model");
    expect(v).toContain("-m gpt-6.1-sol");
  });
  test("grok: >= 4.7, variants follow the generation", () => {
    expect(verdicts("grok -p x -m grok-4.7")).toEqual(["ok"]);
    expect(verdicts("grok -p x -m grok-4.7-build-fast")).toEqual(["ok"]);
    expect(verdicts("grok -p x -m grok-5")).toEqual(["ok"]);
    expect(verdicts("grok -p x -m grok-4.6")[0]).toContain(
      "below the xai grok floor >= 4.7",
    );
    expect(verdicts("grok -p x -m grok-4.5")[0]).toContain("grok-4.7");
    expect(verdicts("grok -p x -m grok-code-fast-1")[0]).toContain(
      "not a current-generation",
    );
  });
  test("claude: aliases mean the newest; ids are held to the floor", () => {
    for (const m of ["opus", "sonnet", "haiku", "fable", "opus[1m]"]) {
      expect(verdicts(`claude -p x --model ${m}`)).toEqual(["ok"]);
    }
    expect(verdicts("claude -p x --model claude-opus-5-5")).toEqual(["ok"]);
    expect(verdicts("claude -p x --model claude-sonnet-5-5")).toEqual(["ok"]);
    expect(verdicts("claude -p x --model claude-fable-5-1")).toEqual(["ok"]);
    expect(verdicts("claude -p x --model claude-haiku-4-5-20251001")).toEqual([
      "ok",
    ]);
    expect(verdicts("claude -p x --model claude-opus-5")[0]).toContain(
      "opus floor >= 5.5",
    );
    expect(verdicts("claude -p x --model claude-opus-4-8")[0]).toContain(
      "generation 4.8",
    );
    expect(verdicts("claude -p x --model claude-sonnet-4-6")[0]).toContain(
      "sonnet floor >= 5.5",
    );
    expect(
      verdicts("claude -p x --model claude-3-5-sonnet-20241022")[0],
    ).toContain("generation 3.5");
  });
  test("claude refuses another vendor's model", () => {
    expect(verdicts("claude -p x --model gpt-6.1-sol")[0]).toContain(
      "openai model, which claude does not run",
    );
  });
  test("agy: Gemini and Claude by their own floors; names it cannot read are left to agy", () => {
    expect(verdicts(`agy -p x --model "Gemini 3.6 Flash (Medium)"`)).toEqual([
      "ok",
    ]);
    expect(verdicts("agy -p x --model gemini-3.1-pro-high")).toEqual(["ok"]);
    expect(verdicts("agy -p x --model gemini-3.1-flash-lite")[0]).toContain(
      "flash-lite floor >= 3.5",
    );
    expect(
      verdicts(`agy -p x --model "Claude Sonnet 4.6 (Thinking)"`)[0],
    ).toContain("sonnet floor >= 5.5");
    expect(verdicts("agy -p x --model gpt-oss-120b-medium")).toEqual(["ok"]);
    expect(verdicts("agy -p x --model flash-medium")).toEqual(["ok"]);
    expect(verdicts("agy -p 'x'")[0]).toContain("names no model");
  });
  test("an unresolvable model is a problem that says how to fix it", () => {
    expect(verdicts(`codex exec -m "$M" x`)[0]).toContain("not a literal name");
  });
});

describe("parseFloorConfig lists every problem", () => {
  test("a clean table", () => {
    expect(
      parseFloorConfig({
        schema: 1,
        family: [{ vendor: "xai", family: "grok", min: "4.7" }],
      }).ok,
    ).toBe(true);
  });
  test("each defect is reported, not just the first", () => {
    const r = parseFloorConfig({
      schema: 2,
      family: [
        { vendor: "nope", family: "x", min: "1" },
        { vendor: "xai", family: "Bad Name", min: "1" },
        { vendor: "xai", family: "grok", min: "four" },
        { vendor: "xai", family: "grok", min: "4.7" },
        { vendor: "xai", family: "grok", min: "4.8" },
      ],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // schema, vendor, family, min, and the duplicate; the one valid row adds nothing.
    expect(r.errors).toHaveLength(5);
    expect(r.errors.join("\n")).toContain("`schema` must be 1");
    expect(r.errors.join("\n")).toContain("listed twice");
  });
  test("not a table, and no rows", () => {
    expect(parseFloorConfig("x").ok).toBe(false);
    const r = parseFloorConfig({ schema: 1 });
    expect(r.ok).toBe(false);
  });
});
