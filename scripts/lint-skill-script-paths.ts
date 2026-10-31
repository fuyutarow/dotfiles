const root = import.meta.dir.replace(/\/scripts$/u, "");
const files = [
  "mise.toml",
  ...(await Array.fromAsync(
    new Bun.Glob("agents/skills/**/templates/**/*.mise.toml").scan({
      cwd: root,
    }),
  )),
  ...(await Array.fromAsync(
    new Bun.Glob("agents/skills/**/SKILL.md").scan({ cwd: root }),
  )),
  ...[
    ...(await Array.fromAsync(
      new Bun.Glob("scripts/**/*.ts").scan({ cwd: root }),
    )),
  ].filter((path) => !path.startsWith("scripts/tests/")),
];
const repositoryPathPattern =
  /(?:\.\.\/)*agents\/skills\/[a-z0-9-]+\/scripts\/[a-z0-9-]+\.ts/gu;
const installedPathPattern =
  /[^\s"'`]*?\.(?:claude|agents)\/skills\/[a-z0-9-]+\/scripts\/[a-z0-9-]+\.ts/gu;
const findings: string[] = [];

for (const file of files) {
  const source = await Bun.file(`${root}/${file}`).text();
  const fileFindings = source.split("\n").flatMap((line, index) => {
    if (/^\s*(?:import|export)\b/u.test(line) || /\bfrom\s*["']/u.test(line))
      return [];
    const patterns =
      file.includes("/templates/") || file.endsWith("/SKILL.md")
        ? [repositoryPathPattern, installedPathPattern]
        : [installedPathPattern];
    return patterns
      .flatMap((pattern) => Array.from(line.matchAll(pattern)))
      .map((match) => {
        const bin =
          match[0].split("/").at(-1)?.replace(/\.ts$/u, "") ?? "helper";
        return `${file}:${index + 1}: ${match[0]}; call the ${bin} PATH bin`;
      });
  });
  findings.push(...fileFindings);
}

if (findings.length > 0) {
  for (const finding of findings) process.stderr.write(`FAIL ${finding}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `PASS: no skill-internal script paths in ${files.length} checked files\n`,
  );
}
