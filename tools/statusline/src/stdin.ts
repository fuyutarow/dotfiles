let pending: Promise<string> | undefined;
export const readInput = () =>
  (pending ??= process.stdin.isTTY ? Promise.resolve("") : Bun.stdin.text());
