import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileKey, fileKeyAsync } from "../src/sockets.ts";

test("async socket helpers agree with synchronous counterparts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sockets-async-"));
  const file = join(dir, "smart-open-user--host.sock");
  await writeFile(file, "not a socket");
  expect(await fileKeyAsync(file)).toEqual(fileKey(file));
  expect(await fileKeyAsync(join(dir, "missing"))).toEqual(
    fileKey(join(dir, "missing")),
  );
});
