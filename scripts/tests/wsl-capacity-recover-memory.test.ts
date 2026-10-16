import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeHostMemory } from "../wsl-capacity-recover.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "wsl-memory-interop-"));
  roots.push(root);
  const powershell = join(root, "powershell.exe");
  const socket = join(root, "335_interop");
  const attempts = join(root, "attempts");
  await writeFile(socket, "");
  await writeFile(
    powershell,
    `#!${process.execPath}
import { appendFile } from 'node:fs/promises';
await appendFile(process.env.ATTEMPTS, (process.env.WSL_INTEROP ?? 'unset') + '\\n');
const args = process.argv.slice(2);
const script = Buffer.from(args[3] ?? '', 'base64').toString('utf16le');
if (args[0] !== '-NoProfile' || args[1] !== '-NonInteractive' || args[2] !== '-EncodedCommand' || !script.includes('Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory')) process.exit(2);
if (process.env.WSL_INTEROP !== process.env.LIVE_INTEROP) {
  process.stderr.write('powershell.exe: Invalid argument\\n');
  process.exit(1);
}
process.stdout.write(process.env.MEMORY_OUTPUT ?? 'available_mb=3082\\r\\npage_reads_s=0\\r\\n');
`,
  );
  await chmod(powershell, 0o755);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LIVE_INTEROP: socket,
    ATTEMPTS: attempts,
  };
  delete env.WSL_INTEROP;
  return { powershell, interopDirectory: root, env, socket, attempts };
}

test("measurement recovers the unit's missing WSL_INTEROP and skips a stale socket", async () => {
  const options = await fixture();
  const stale = join(options.interopDirectory, "999_interop");
  await writeFile(stale, "stale");
  await utimes(options.socket, 1, 1);
  expect(await probeHostMemory(options)).toEqual({
    availableMb: 3082,
    pageReadsPerSecond: 0,
  });
  expect(options.env.WSL_INTEROP).toBeUndefined();
  expect((await readFile(options.attempts, "utf8")).trim().split("\n")).toEqual(
    ["unset", stale, options.socket],
  );
});

test("measurement bounds socket retries even when many stale entries remain", async () => {
  const options = await fixture();
  await rm(options.socket);
  for (let i = 1; i <= 6; i += 1) {
    await writeFile(join(options.interopDirectory, `${i}_interop`), "stale");
  }
  expect(await probeHostMemory(options)).toBeNull();
  // One direct invocation plus at most four discovered sockets.
  expect(
    (await readFile(options.attempts, "utf8")).trim().split("\n"),
  ).toHaveLength(5);
});

test("measurement preserves an explicitly inherited interop socket", async () => {
  const options = await fixture();
  expect(
    await probeHostMemory({
      ...options,
      env: { ...options.env, WSL_INTEROP: options.socket },
    }),
  ).toEqual({ availableMb: 3082, pageReadsPerSecond: 0 });
  expect(
    await probeHostMemory({
      ...options,
      env: { ...options.env, WSL_INTEROP: "explicit-invalid" },
    }),
  ).toBeNull();
});

test("unavailable sockets and malformed measurement remain unknown", async () => {
  const options = await fixture();
  expect(
    await probeHostMemory({
      ...options,
      interopDirectory: join(options.interopDirectory, "absent"),
    }),
  ).toBeNull();
  expect(
    await probeHostMemory({
      ...options,
      env: {
        ...options.env,
        WSL_INTEROP: options.socket,
        MEMORY_OUTPUT: "not a measurement",
      },
    }),
  ).toBeNull();
});
