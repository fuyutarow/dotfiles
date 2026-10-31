/** Return a task diagnostic when the running Bun is below the preset's typecheck floor. */
export function bunVersionError(version: string): string | undefined {
  const parsed = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u.exec(version);
  const parts = parsed?.slice(1, 4).map(Number);
  if (parts === undefined || parts.length !== 3)
    return `typecheck requires Bun >= 1.4.3 (could not parse version ${version})`;
  const [major, minor, patch] = parts;
  const belowFloor =
    major !== undefined &&
    minor !== undefined &&
    patch !== undefined &&
    (major < 1 ||
      (major === 1 && minor < 4) ||
      (major === 1 &&
        minor === 4 &&
        (patch < 3 || (patch === 3 && version.includes("-")))));
  if (
    major === undefined ||
    minor === undefined ||
    patch === undefined ||
    belowFloor
  )
    return `typecheck requires Bun >= 1.4.3 (found ${version})`;
  return undefined;
}

if (import.meta.main) {
  const error = bunVersionError(Bun.version);
  if (error !== undefined) {
    process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  }
}
