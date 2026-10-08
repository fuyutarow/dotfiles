import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const realTmpdir = realpathSync(tmpdir());

export const tempRoot = (prefix: string): string =>
  mkdtempSync(join(realTmpdir, prefix));
