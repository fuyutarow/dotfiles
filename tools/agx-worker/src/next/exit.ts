import { writeSync } from "node:fs";

export const exitWithError = (message: string, code: number): never => {
  writeSync(process.stderr.fd, message);
  process.exit(code);
};
