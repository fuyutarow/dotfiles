// Production roots are derived from the declarations that expose files to users.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "@dotfiles/shared/src/zod.ts";

const repoRoot = resolve(import.meta.dir, "..");
const finding = z.object({
  file: z.string().min(1),
  kind: z.string().min(1),
  name: z.string().min(1),
});
const exceptions = z.object({
  exception: z.array(
    finding.extend({
      reason: z.string().trim().min(1),
      keeper: z.string().trim().min(1),
    }),
  ),
});
const report = z.object({ issues: z.array(z.record(z.string(), z.unknown())) });
const items = z.array(z.object({ name: z.string().min(1) }));
type Finding = z.infer<typeof finding>;
const key = (f: Finding) => JSON.stringify([f.file, f.kind, f.name]);
function skillReference(skill: string, reference: string): string {
  if (reference.startsWith("~/dotfiles/"))
    return reference.slice("~/dotfiles/".length);
  if (reference.startsWith("agents/")) return reference;
  return `${dirname(skill)}/${reference}`;
}
function fatal(message: string): never {
  process.stderr.write(`FATAL knip gate: ${message}\n`);
  return process.exit(1);
}
function readSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : fatal(result.error.message);
}

export function evaluateKnipOutput(reportText: string, exceptionText: string) {
  const parsed = report.safeParse(Bun.JSONC.parse(reportText));
  const ledger = exceptions.safeParse(Bun.TOML.parse(exceptionText));
  if (!parsed.success || !ledger.success)
    return {
      findings: [],
      messages: ["FATAL invalid Knip report or exception ledger"],
    };
  const findings: Finding[] = [];
  for (const issue of parsed.data.issues) {
    const file = readSchema(z.string().min(1), issue["file"]);
    const rows = Object.entries(issue).filter(([kind]) => kind !== "file");
    findings.push(
      ...rows.flatMap(([kind, value]) =>
        readSchema(items, value).map((item) => ({
          file,
          kind,
          name: item.name,
        })),
      ),
    );
  }
  const found = new Set(findings.map((f) => key(f)));
  const allowed = new Set(ledger.data.exception.map((f) => key(f)));
  if (allowed.size !== ledger.data.exception.length)
    return { findings, messages: ["FATAL duplicate Knip exceptions"] };
  const messages = [
    ...findings
      .filter((f) => !allowed.has(key(f)))
      .map((f) => `UNLISTED ${f.file} ${f.kind} ${f.name}`),
    ...ledger.data.exception
      .filter((f) => !found.has(key(f)))
      .map((f) => `STALE ${f.file} ${f.kind} ${f.name}`),
  ];
  return { findings, messages };
}

// Only operating-system supplied commands and bootstrap installers are listed here;
// package commands come from the repository's installer declarations below.
const osBinaries = [
  "brew", // Homebrew bootstraps the declared packages.
  "osascript",
  "pbcopy",
  "defaults",
  "softwareupdate",
  "killall", // macOS
  "notify-send",
  "chsh",
  "pgrep",
  "lsattr", // Linux (lsattr: e2fsprogs)
];

export function declaredBinaries(
  brewfiles: string[],
  commandMap: string,
  miseText: string,
  installer: string,
): string[] {
  const packages = new Set<string>();
  const declarations = brewfiles.flatMap((source) =>
    Array.from(source.matchAll(/^\s*(?:brew|cask)\s+["']([^"']+)["']/gmu)),
  );
  for (const match of declarations) {
    const name = match[1]?.split("/").at(-1);
    if (name !== undefined) packages.add(name);
  }
  const binaries = new Set(osBinaries);
  const mapped = new Set<string>();
  for (const line of commandMap.split("\n")) {
    const [name, commands] = line.split("\t");
    if (name === undefined || commands === undefined || !packages.has(name))
      continue;
    mapped.add(name);
    if (commands === "-") continue;
    for (const command of commands.trim().split(/\s+/u)) binaries.add(command);
  }
  for (const name of packages) if (!mapped.has(name)) binaries.add(name);
  const mise = readSchema(
    z.object({ tools: z.record(z.string(), z.unknown()) }).loose(),
    Bun.TOML.parse(miseText),
  );
  for (const name of Object.keys(mise.tools))
    binaries.add(name.split("/").at(-1) ?? name);
  // install-mcp.ts declares both the uv package and its configurable command.
  if (
    /"tool",\s*"install",\s*"--upgrade",\s*"cocoindex-code\[full\]"/u.test(
      installer,
    )
  ) {
    const command = installer.match(
      /const cccBin = values\.cccBin \?\? "([^"]+)"/u,
    )?.[1];
    if (command !== undefined) binaries.add(command);
  }
  return [...binaries].toSorted();
}

export async function roots(root: string): Promise<string[]> {
  const paths = new Set<string>();
  const add = async (path: string) => {
    const normalized = path.replace(/^\.\//u, "");
    if (
      /\.(?:[cm]?[jt]sx?)$/u.test(normalized) &&
      (await Bun.file(join(root, normalized)).exists())
    )
      paths.add(normalized);
  };
  // This subprocess path is assembled at runtime.
  await add("tools/shared/src/readonly-exec.ts");
  const pkg = readSchema(
    z.object({ bin: z.record(z.string(), z.string()) }),
    Bun.JSONC.parse(await Bun.file(join(root, "package.json")).text()),
  );
  for (const path of Object.values(pkg.bin)) await add(path);
  // Goal Kernel is a documented operator CLI even though it is not published as a package bin.
  await add("agents/goal-kernel/cli.ts");
  // The research-control trace checker is invoked directly as documented in its README.
  await add("agents/research-control/cli.ts");
  const mise = Bun.TOML.parse(await Bun.file(join(root, "mise.toml")).text());
  const tasks = readSchema(
    z.record(z.string(), z.object({ run: z.unknown().optional() }).loose()),
    readSchema(z.object({ tasks: z.unknown() }), mise).tasks,
  );
  for (const task of Object.values(tasks)) {
    const commands = [task.run]
      .flat()
      .flatMap((value) => (typeof value === "string" ? [value] : []));
    const matches = commands.flatMap((command) =>
      Array.from(
        command.matchAll(
          /(?:\bbun|"\$\(mise which bun\)")\s+(?:["']?)(?:(?:~\/dotfiles\/|\$\{MISE_PROJECT_ROOT\}\/|\.\/))?([\w./-]+\.(?:ts|js))\b/gu,
        ),
      ),
    );
    for (const match of matches) await add(match[1] ?? "");
  }
  for await (const unit of new Bun.Glob("systemd/*.service").scan({
    cwd: root,
  })) {
    const text = await Bun.file(join(root, unit)).text();
    for (const match of text.matchAll(
      /^ExecStart=\/usr\/bin\/env\s+bun\s+%h\/dotfiles\/([\w./-]+\.(?:ts|js))\b/gmu,
    ))
      await add(match[1] ?? "");
  }
  const hooks = Bun.TOML.parse(
    await Bun.file(join(root, "agents/hooks/hooks.toml")).text(),
  );
  const hookData = readSchema(
    z.object({ hook: z.unknown(), vendor_hook: z.unknown() }),
    hooks,
  );
  for (const row of readSchema(
    z.array(z.object({ script: z.string() })),
    hookData.hook,
  ))
    await add(`agents/hooks/${row.script}`);
  for (const row of readSchema(
    z.array(z.object({ script: z.string() })),
    hookData.vendor_hook,
  ))
    await add(`agents/${row.script}`);
  for await (const skill of new Bun.Glob("agents/skills/*/SKILL.md").scan({
    cwd: root,
  })) {
    const text = await Bun.file(join(root, skill)).text();
    for (const match of text.matchAll(
      /(?:~\/dotfiles\/)?(?:[\w.-]+\/)*scripts\/[\w./-]+\.(?:ts|js)\b/gu,
    )) {
      await add(skillReference(skill, match[0]));
    }
    for (const match of text.matchAll(
      /~\/dotfiles\/(scripts\/[\w./-]+\.(?:ts|js))\b/gu,
    ))
      await add(match[1] ?? "");
  }
  // These declarations invoke Bun subprocesses or systemd services, not imports.
  for (const [source, reference, path] of [
    ["scripts/link-dots.ts", "scripts/render-home.ts"],
    ["scripts/lint-skills-floor.ts", "scripts/tracked-files.ts"],
    [
      "wsl/guest-capacity-recover.service.wsl",
      "scripts/guest-capacity-recover.ts",
    ],
    ["wsl/wsl-capacity-recover.service.wsl", "scripts/wsl-capacity-recover.ts"],
    ["topgrade/topgrade.toml", "agents/codex/codex-update.ts"],
    ["agents/codex/codex-runtime.ts", "agents/codex/codex-wsl.ts"],
    ["agents/codex/windows-assets.ts", "agents/codex/windows-hook.ts"],
    [
      "tools/agent-resource-run/src/agent-resource-run.ts",
      "scope-entry.ts",
      "tools/agent-resource-run/src/scope-entry.ts",
    ],
    [
      "tools/agent-resource-run/src/agent-resource-run.ts",
      "scope-controller.ts",
      "tools/agent-resource-run/src/scope-controller.ts",
    ],
    [
      "tools/smart-open/smart-open-receiver.plist.mac",
      "tools/smart-open/src/receive.ts",
    ],
    [
      "tools/repo-retrieve/README.md",
      "views/research-record-v1.ts",
      "tools/repo-retrieve/views/research-record-v1.ts",
    ],
  ].map(([origin, second, third]) => [origin, second, third ?? second])) {
    if (
      source !== undefined &&
      reference !== undefined &&
      path !== undefined &&
      (await Bun.file(join(root, source)).text()).includes(reference)
    )
      await add(path);
  }
  // Claude invokes helpers as Bun subprocesses from its quote hook.
  const quoteHook = await Bun.file(
    join(root, "agents/claude/hooks/quote-command.ts"),
  ).text();
  for (const name of ["copy-via-herdr-pane.ts", "resolve-agent-name.ts"]) {
    if (quoteHook.includes(name)) await add(`agents/claude/hooks/${name}`);
  }
  // Codex invokes these through a deployed prompt and a registered shell shim.
  for (const [source, reference, path] of [
    [
      "agents/commands/quote.md",
      ".codex/hooks/quote-command.ts",
      "agents/codex/hooks/quote-command.ts",
    ],
    [
      "agents/codex/hooks/run-reply-language.sh",
      'exec "$p" "$dir/enforce-reply-language.ts"',
      "agents/codex/hooks/enforce-reply-language.ts",
    ],
  ]) {
    if (
      source !== undefined &&
      reference !== undefined &&
      path !== undefined &&
      (await Bun.file(join(root, source)).text()).includes(reference)
    )
      await add(path);
  }
  for (const doc of [
    "agents/goal-kernel/README.md",
    "agents/research-control/README.md",
  ]) {
    const text = await Bun.file(join(root, doc)).text();
    for (const match of text.matchAll(
      /agents\/(?:goal-kernel|research-control)\/[\w./-]+\.ts\b/gu,
    ))
      await add(match[0]);
  }
  for await (const manifest of new Bun.Glob("presets/*/preset.toml").scan({
    cwd: root,
  })) {
    const data = Bun.TOML.parse(await Bun.file(join(root, manifest)).text());
    for (const row of readSchema(
      z.array(z.object({ source: z.string() })),
      readSchema(z.object({ files: z.unknown() }), data).files,
    ))
      await add(`${dirname(manifest)}/${row.source}`);
  }
  // preset sync's source/destination pairs are declared in this tool, not in preset.toml.
  const preset = await Bun.file(
    join(root, "tools/preset/src/preset.ts"),
  ).text();
  for (const match of preset.matchAll(
    /["']((?:agents|tools)\/[\w./-]+\.(?:ts|js))["']\s*,\s*["'][\w./-]+\.(?:ts|js)["']/gu,
  ))
    await add(match[1] ?? "");
  return [...paths].toSorted();
}

async function main() {
  const workspaceSchema = z.object({ entry: z.array(z.string()) }).loose();
  const config = readSchema(
    z
      .object({
        workspaces: z.record(z.string(), workspaceSchema),
        ignoreBinaries: z.array(z.string()).optional(),
      })
      .loose(),
    Bun.JSONC.parse(await Bun.file(join(repoRoot, "knip.jsonc")).text()),
  );
  const rootConfig = config.workspaces["."];
  const toolsConfig = config.workspaces["tools/*"];
  if (rootConfig === undefined || toolsConfig === undefined)
    return fatal("missing workspace configuration");
  config.ignoreBinaries = declaredBinaries(
    await Promise.all(
      ["Brewfile.core", "Brewfile.ondemand"].map((path) =>
        Bun.file(join(repoRoot, path)).text(),
      ),
    ),
    await Bun.file(
      join(repoRoot, "tools/tool-tiers/src/tool-commands.tsv"),
    ).text(),
    await Bun.file(join(repoRoot, "mise.toml")).text(),
    await Bun.file(join(repoRoot, "scripts/install-mcp.ts")).text(),
  );
  const manifest = readSchema(
    z.object({ workspaces: z.array(z.string()) }),
    Bun.JSONC.parse(await Bun.file(join(repoRoot, "package.json")).text()),
  );
  const workspaces = new Set<string>();
  for (const pattern of manifest.workspaces) {
    for await (const path of new Bun.Glob(`${pattern}/package.json`).scan({
      cwd: repoRoot,
    }))
      workspaces.add(dirname(path));
  }
  const entries = await roots(repoRoot);
  rootConfig.entry = entries
    .filter(
      (p) =>
        ![...workspaces].some((workspace) => p.startsWith(`${workspace}/`)),
    )
    .map((p) => `${p}!`);
  for (const workspace of workspaces) {
    config.workspaces[workspace] ??= {
      ...toolsConfig,
      entry: [],
    };
    config.workspaces[workspace].entry.push(
      ...entries
        .filter((path) => path.startsWith(`${workspace}/`))
        .map((path) => `${path.slice(workspace.length + 1)}!`),
    );
  }
  const dir = await mkdtemp(join(tmpdir(), "dotfiles-knip-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
  const configPath = join(dir, "knip.json");
  await Bun.write(configPath, JSON.stringify(config));
  const child = Bun.spawn(
    [
      process.execPath,
      "x",
      "--no-install",
      "--bun",
      "knip",
      "--production",
      "--no-progress",
      "--reporter",
      "json",
      "--workspace",
      ".",
      ...[...workspaces]
        .toSorted()
        .flatMap((workspace) => ["--workspace", `./${workspace}`]),
      "--config",
      configPath,
    ],
    { cwd: repoRoot, stdout: "pipe", stderr: "pipe", timeout: 120_000 },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exit > 1 || stdout.trim() === "")
    return fatal(`knip exited ${exit}: ${stderr}`);
  const result = evaluateKnipOutput(
    stdout,
    await Bun.file(join(repoRoot, "lint/knip-exceptions.toml")).text(),
  );
  for (const line of result.messages) process.stdout.write(`${line}\n`);
  if (result.messages.length === 0)
    process.stdout.write(
      `PASS knip gate: ${result.findings.length} findings match exceptions; ${entries.length} declared roots\n`,
    );
  return result.messages.length === 0 ? 0 : 1;
}
if (import.meta.main)
  process.exitCode = await main().catch((error: unknown) => {
    process.stderr.write(`FATAL knip gate: ${String(error)}\n`);
    return 1;
  });
