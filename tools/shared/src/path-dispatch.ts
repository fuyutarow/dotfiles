import { typeFlag } from "type-flag";

// argv-forwarding: PATH
export async function forwardPath(
  target: string,
  argv: string[],
): Promise<number> {
  const parsed = typeFlag({}, [...argv], { ignore: () => true });
  if (Object.keys(parsed.unknownFlags).length > 0) {
    process.stderr.write(`${target}: unexpected forwarding flag\n`);
    return 2;
  }
  // bounded: the selected CLI owns its foreground command lifetime.
  const child = Bun.spawn([target, ...argv], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return child.exited;
}
