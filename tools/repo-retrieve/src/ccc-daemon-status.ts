export type DaemonProject = { path: string; state: string };
export type DaemonStatus =
  | { kind: "projects"; projects: DaemonProject[] }
  | { kind: "empty" }
  | { kind: "unrecognized"; text: string };

export function parseDaemonStatus(stdout: string): DaemonStatus {
  const lines = stdout.split(/\r?\n/u);
  const projects: DaemonProject[] = [];
  let listed = false;
  let empty = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed === "Projects:") {
      listed = true;
      continue;
    }
    if (trimmed === "No projects loaded.") {
      empty = true;
      continue;
    }
    const row = trimmed.match(/^(\/.+?) \[([^\]]+)\]$/u);
    if (listed && row?.[1] !== undefined && row[2] !== undefined) {
      projects.push({ path: row[1], state: row[2] });
      continue;
    }
    if (
      /^(Daemon version:|Uptime:|Idle:|Indexing(?: in progress)?:)/u.test(
        trimmed,
      )
    )
      continue;
    return { kind: "unrecognized", text: stdout };
  }
  if (empty && (listed || projects.length > 0))
    return { kind: "unrecognized", text: stdout };
  if (projects.length > 0) return { kind: "projects", projects };
  if (listed || empty) return { kind: "empty" };
  return { kind: "unrecognized", text: stdout };
}
