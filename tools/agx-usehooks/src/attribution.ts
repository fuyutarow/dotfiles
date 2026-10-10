import { isAbsolute, relative, resolve, sep } from "node:path";

/** A cwd must be absolute and inside the project, including the root itself. */
export function projectCwd(cwd: string | undefined, root: string): boolean {
  if (cwd === undefined || !isAbsolute(cwd)) return false;
  const path = relative(resolve(root), resolve(cwd));
  return !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
}
