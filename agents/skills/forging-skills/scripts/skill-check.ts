import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

let failures = 0;

function fail(directory: string, message: string): void {
  process.stdout.write(`FAIL ${directory}: ${message}\n`);
  failures += 1;
}

function warn(directory: string, message: string): void {
  process.stdout.write(`WARN ${directory}: ${message}\n`);
}

function frontmatter(lines: string[]): { lines: string[]; bodyStart: number } {
  if (lines[0]?.trim() !== "---") return { lines: [], bodyStart: 0 };
  const end = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---",
  );
  return end === -1
    ? { lines: [], bodyStart: 0 }
    : { lines: lines.slice(1, end), bodyStart: end + 1 };
}

function scalar(lines: string[], key: string): string | undefined {
  const index = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (index === -1) return undefined;
  const raw = lines[index]?.slice(key.length + 1).trim() ?? "";
  if (raw !== ">" && raw !== ">-" && raw !== "|" && raw !== "|-")
    return raw.replaceAll('"', "") || undefined;
  const folded: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (line !== "" && !/^\s/.test(line)) break;
    folded.push(line.trim());
  }
  return folded.join(" ").trim() || undefined;
}

function listedReferences(lines: string[]): string[] {
  const start = lines.findIndex((line) => line.startsWith("references:"));
  if (start === -1) return [];
  const refs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^\s*-\s*(.+)$/);
    if (match?.[1] !== undefined) {
      refs.push(match[1].replaceAll('"', ""));
      continue;
    }
    if (/^\S/.test(line)) break;
  }
  return refs;
}

async function checkDirectory(input: string): Promise<void> {
  const directory = input.replace(/\/$/, "");
  const skillPath = join(directory, "SKILL.md");
  if (!existsSync(skillPath)) {
    fail(directory, "SKILL.md missing");
    return;
  }
  const source = await Bun.file(skillPath).text();
  const lines = source.split("\n");
  const metadata = frontmatter(lines);
  if (metadata.lines.length === 0)
    warn(directory, "no YAML frontmatter (body loads with empty metadata)");

  const directoryName = basename(resolve(directory));
  const name = scalar(metadata.lines, "name") ?? directoryName;
  if (name !== directoryName && scalar(metadata.lines, "name") !== undefined) {
    fail(
      directory,
      `frontmatter name '${name}' != dir basename '${directoryName}'`,
    );
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) {
    fail(directory, `name '${name}' violates ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`);
  }
  if ([...name].length > 64)
    fail(directory, `name '${name}' exceeds 64 chars (${[...name].length})`);
  if (name.includes("--"))
    fail(directory, `name '${name}' has consecutive hyphens`);
  if (/(claude|anthropic)/i.test(name) && name !== "driving-claude") {
    fail(
      directory,
      `name '${name}' contains a reserved word (claude/anthropic)`,
    );
  }

  const description = scalar(metadata.lines, "description");
  const descriptionLine =
    metadata.lines.find((line) => line.startsWith("description:")) ?? "";
  if (/^description:\s*[^>|\s]/.test(descriptionLine)) {
    warn(
      directory,
      "plain-scalar description — any ': ' inside will break YAML parsing (observed 2026-07-02); use >-",
    );
  }
  if (description === undefined) {
    fail(directory, "description: missing or empty");
  } else if ([...description].length > 1500) {
    warn(
      directory,
      `description ${[...description].length} chars > 1500 (platform hard cap 1024 for API skills; listing cap owned by operating-the-harness)`,
    );
  }

  const body = lines.slice(metadata.bodyStart).join("\n");
  const referencesDirectory = join(directory, "references");
  if (existsSync(referencesDirectory)) {
    for (const entry of await readdir(referencesDirectory)) {
      if (entry.endsWith(".md") && !body.includes(entry))
        fail(
          directory,
          `references/${entry} exists but is never mentioned in SKILL.md`,
        );
    }
  }
  for (const reference of listedReferences(metadata.lines)) {
    const candidates = [
      join(directory, reference),
      join(referencesDirectory, reference),
      join(referencesDirectory, `${reference}.md`),
    ];
    if (!candidates.some(existsSync))
      fail(
        directory,
        `frontmatter references '${reference}' has no file (references/${reference}.md missing)`,
      );
  }
  const bodyLines =
    metadata.bodyStart === 0 ? 0 : lines.length - metadata.bodyStart;
  if (bodyLines > 500)
    warn(directory, `SKILL.md body ${bodyLines} lines > 500`);
}

async function main(): Promise<void> {
  const directories = Bun.argv.slice(2);
  for (const directory of directories.length === 0
    ? [process.cwd()]
    : directories)
    await checkDirectory(directory);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
