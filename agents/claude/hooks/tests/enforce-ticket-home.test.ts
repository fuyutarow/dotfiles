import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseJson, strAt } from "../../../hooks/narrow.ts";
import { jsonOf, z } from "../../../hooks/zod.ts";

const ROOT = resolve(import.meta.dir, "../../../..");
const HOOK = join(ROOT, "agents/claude/hooks/enforce-ticket-home.ts");
const TICKET = '+++\nname = "x"\noutcome = "done"\n+++\nbody\n';
const PROSE = "# Ordinary markdown\nThis remains writable anywhere.\n";
const VendorConfig = z.looseObject({
  hooks: z.looseObject({
    PreToolUse: z.array(
      z.looseObject({
        matcher: z.string().optional(),
        hooks: z.array(z.looseObject({ command: z.string() })),
      }),
    ),
  }),
});

async function repo(prefix: string, config = "") {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(root, ".git"));
  if (config !== "") await writeFile(join(root, ".agx.toml"), config);
  return root;
}

async function run(tool_name: string, tool_input: unknown, cwd: string) {
  const child = Bun.spawn([process.execPath, HOOK], {
    stdin: new Blob([JSON.stringify({ tool_name, tool_input, cwd })]),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(0);
  expect(stderr).toBe("");
  return parseJson(stdout);
}

async function expectDenied(path: string, cwd: string) {
  const output = await run("Write", { file_path: path, content: TICKET }, cwd);
  expect(strAt(output, "hookSpecificOutput", "permissionDecision")).toBe(
    "deny",
  );
  const reason = strAt(
    output,
    "hookSpecificOutput",
    "permissionDecisionReason",
  );
  expect(reason).toContain("expected ");
  expect(reason).toContain("tkt new <slug> --repo ");
}

test("denies ticket-shaped writes outside the default ticket home", async () => {
  const root = await repo("ticket-home-default-");
  await expectDenied("/tmp/x.md", root);
  await expectDenied(join(homedir(), ".cache/coord/tickets/x.md"), root);
  await expectDenied(join(root, "notes/x.md"), root);
  const allowed = await run(
    "Write",
    {
      file_path: join(root, ".agents/tickets/x.md"),
      content: TICKET,
    },
    root,
  );
  expect(allowed).toBeUndefined();
});

test("accepts the .agx.toml absolute ticket home", async () => {
  const root = await repo("ticket-home-config-");
  const external = join(root, "absolute-ticket-home");
  await mkdir(external);
  await writeFile(
    join(root, ".agx.toml"),
    `tickets = ${JSON.stringify(external)}\n`,
  );
  const allowed = await run(
    "Write",
    {
      file_path: join(external, "x.md"),
      content: TICKET,
    },
    root,
  );
  expect(allowed).toBeUndefined();
  await expectDenied(join(root, "notes/x.md"), root);
});

test("allows ordinary Markdown anywhere and applies the same rule to Edit and MultiEdit", async () => {
  const root = await repo("ticket-home-edits-");
  expect(
    await run("Write", { file_path: "/tmp/notes.md", content: PROSE }, root),
  ).toBeUndefined();
  const path = join(root, "notes/x.md");
  await mkdir(join(root, "notes"));
  await writeFile(path, "name = 'draft'\noutcome = 'draft'\n");
  for (const tool of ["Edit", "MultiEdit"]) {
    const tool_input =
      tool === "Edit"
        ? {
            file_path: path,
            old_string: "name = 'draft'\noutcome = 'draft'\n",
            new_string: TICKET,
          }
        : {
            file_path: path,
            edits: [
              {
                old_string: "name = 'draft'\noutcome = 'draft'\n",
                new_string: TICKET,
              },
            ],
          };
    const output = await run(tool, tool_input, root);
    expect(strAt(output, "hookSpecificOutput", "permissionDecision")).toBe(
      "deny",
    );
  }
});

test("Bash heredoc redirects and tee use the parsed ticket write target", async () => {
  const root = await repo("ticket-home-bash-");
  for (const command of [
    `cat > ${join(root, "notes/x.md")} <<'TICKET'\n${TICKET}TICKET\n`,
    `tee ${join(root, "notes/y.md")} <<'TICKET'\n${TICKET}TICKET\n`,
  ]) {
    const output = await run("Bash", { command }, root);
    expect(strAt(output, "hookSpecificOutput", "permissionDecision")).toBe(
      "deny",
    );
  }
  expect(
    await run(
      "Bash",
      {
        command: `tee -- ~/.agents/tickets/x.md <<'TICKET'\n${TICKET}TICKET\n`,
      },
      root,
    ),
  ).toBeUndefined();
  expect(
    await run(
      "Bash",
      { command: `cat > ${join(root, "notes.md")} <<'EOF'\n${PROSE}EOF\n` },
      root,
    ),
  ).toBeUndefined();
});

test("declared hook registration covers the Claude and Codex write tools", async () => {
  const registry = await Bun.file(join(ROOT, "agents/hooks/hooks.toml")).text();
  expect(registry).toContain('slug = "agx:ticket-home"');
  for (const path of [
    "agents/claude/settings.json",
    "agents/codex/hooks.json",
  ]) {
    const config = jsonOf(VendorConfig).safeParse(
      await Bun.file(join(ROOT, path)).text(),
    );
    expect(config.success).toBe(true);
    if (!config.success) continue;
    const registration = config.data.hooks.PreToolUse.flatMap((row) =>
      row.hooks.map((hook) => ({ ...row, ...hook })),
    ).find((row) => row.command.includes("enforce-ticket-home.ts"));
    expect(registration?.matcher).toBe("Bash|Write|Edit|MultiEdit");
    expect(registration?.command).toContain("--fail-closed");
  }
});
