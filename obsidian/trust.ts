import { $ } from "bun";
import { cli } from "cleye";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { err, ok as success, type Result } from "neverthrow";
import { jsonOf, jsonText, z } from "../agents/hooks/zod.ts";

// Turn Obsidian's "Restricted mode" OFF for every registered vault, so the plugins apply.ts
// installs actually load. Run via `mise run mac:obsidian:trust`. Consumer: human, verdict lines.
// Authorized explicitly by the owner (2026-10-01): plugins are pinned by sha256 in plugins.json.
//
// WHERE THE SWITCH LIVES. Not in the vault: Obsidian keeps it in the app's localStorage as
// `enable-plugin-<vault id>` = "true" (read from the shipped app.asar: isEnabled() is exactly
// that comparison). localStorage is Chromium leveldb, which nothing outside the app should write.
// So this asks the app to write it: relaunch Obsidian with --remote-debugging-port=0 (Chromium
// picks a free port and records it in DevToolsActivePort), set the keys through the DevTools
// protocol, read them back, then quit and relaunch WITHOUT the port — the debug port is never
// left open past this script.
//
// RESTARTS OBSIDIAN. Obsidian saves notes as you type, so a graceful quit loses nothing.
//
// Exit: 0 keys set and read back / 2 FATAL (Obsidian did not quit, start, or confirm the write).

const SUPPORT = join(
  process.env.HOME ?? "",
  "Library/Application Support/obsidian",
);
const REGISTRY = join(SUPPORT, "obsidian.json");
const PORT_FILE = join(SUPPORT, "DevToolsActivePort");
const WAIT_MS = 20_000;
const COMMIT_MS = 8_000;
const LEVELDB = join(SUPPORT, "Local Storage/leveldb");

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): boolean {
  if (type === "unknown-flag" && flag === "__proto__") {
    return true;
  }
  return false;
}

// Every value from outside (the vault registry, DevTools JSON) is parsed, never asserted.
const RegistrySchema = z.object({ vaults: z.record(z.string(), z.unknown()) });
const PageSchema = z.object({
  type: z.string(),
  url: z.string(),
  webSocketDebuggerUrl: z.string(),
});
const EvaluateReplySchema = z.object({
  result: z.object({ result: z.object({ value: z.unknown() }) }),
});
const ReadBackSchema = z.record(z.string(), z.unknown());

async function vaultIds(): Promise<string[]> {
  if (!existsSync(REGISTRY)) return [];
  const reg = jsonOf(RegistrySchema).safeParse(await Bun.file(REGISTRY).text());
  if (!reg.success) return [];
  return Object.keys(reg.data.vaults).filter((id) => /^[0-9a-f]+$/u.test(id));
}

// Fresh leveldb writes land uncompressed in the *.log journal; a key absent from every file
// did not persist.
async function notOnDisk(keys: string[]): Promise<string[]> {
  const files = [...new Bun.Glob("*.{log,ldb}").scanSync(LEVELDB)];
  const blobs = await Promise.all(
    files.map(async (f) =>
      Buffer.from(await Bun.file(join(LEVELDB, f)).bytes()),
    ),
  );
  return keys.filter((k) => !blobs.some((b) => b.includes(Buffer.from(k))));
}

async function running(): Promise<boolean> {
  return (await $`pgrep -x Obsidian`.quiet().nothrow()).exitCode === 0;
}

// Poll until `ok()` yields non-null; FATAL naming `what` after WAIT_MS.
async function waitFor<T>(
  what: string,
  ok: () => Promise<T | null>,
): Promise<Result<T, string>> {
  const deadline = performance.now() + WAIT_MS;
  while (performance.now() < deadline) {
    const v = await ok();
    if (v !== null) return success(v);
    await Bun.sleep(250);
  }
  return err(`timed out after ${WAIT_MS} ms waiting for ${what}`);
}

async function quit(): Promise<Result<void, string>> {
  if (!(await running())) return success(undefined);
  const command = await Promise.try(() =>
    $`osascript -e 'quit app "Obsidian"'`.quiet(),
  ).then(
    () => success(undefined),
    (error: unknown) =>
      err(error instanceof Error ? error.message : String(error)),
  );
  if (command.isErr()) return err(command.error);
  const stopped = await waitFor("Obsidian to quit", async () =>
    (await running()) ? null : true,
  );
  if (stopped.isErr()) return err(stopped.error);
  return success();
}

async function pageSocket(): Promise<Result<string, string>> {
  const port = await waitFor("DevToolsActivePort", async () => {
    if (!existsSync(PORT_FILE)) return null;
    const first = (await Bun.file(PORT_FILE).text()).split("\n")[0];
    return first === undefined || first === "" ? null : first;
  });
  if (port.isErr()) return err(port.error);
  return waitFor("an Obsidian window", async () => {
    const res = await fetch(`http://127.0.0.1:${port.value}/json/list`, {
      signal: AbortSignal.timeout(2_000),
    }).catch(() => null);
    if (res === null || !res.ok) return null;
    const pages = jsonOf(z.array(z.unknown())).safeParse(await res.text());
    if (!pages.success) return null;
    // Each entry on its own: one target of another shape must not hide the Obsidian page.
    const page = pages.data
      .map((p) => PageSchema.safeParse(p))
      .flatMap((r) => (r.success ? [r.data] : []))
      .find((p) => p.type === "page" && p.url.startsWith("app://obsidian.md"));
    return page?.webSocketDebuggerUrl ?? null;
  });
}

// One Runtime.evaluate over the DevTools protocol; returns the expression's JSON value.
async function evaluate(
  ws: string,
  expression: string,
): Promise<Result<unknown, string>> {
  const sock = new WebSocket(ws);
  const opened = await new Promise<Result<void, string>>((resolve) => {
    sock.addEventListener(
      "open",
      () => {
        resolve(success());
      },
      { once: true },
    );
    sock.addEventListener(
      "error",
      () => {
        resolve(err("DevTools websocket connection failed"));
      },
      { once: true },
    );
  });
  if (opened.isErr()) return opened;
  const reply = new Promise<unknown>((ok) => {
    sock.addEventListener(
      "message",
      (m) => {
        const frame = jsonText.safeParse(String(m.data));
        ok(frame.success ? frame.data : null);
      },
      { once: true },
    );
  });
  sock.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, returnByValue: true },
    }),
  );
  const msg = await Promise.race([reply, Bun.sleep(WAIT_MS).then(() => null)]);
  sock.close();
  const parsed = EvaluateReplySchema.safeParse(msg);
  if (!parsed.success) {
    return err(`DevTools gave no result: ${JSON.stringify(msg)}`);
  }
  return success(parsed.data.result.result.value);
}

async function main(): Promise<Result<void, string>> {
  let prototypeFlag = false;
  const parsed = cli(
    {
      name: "trust.ts",
      strictFlags: true,
      ignoreArgv: (type, flag) => {
        prototypeFlag = rejectPrototypeFlag(type, flag) || prototypeFlag;
      },
      parameters: [],
      help: {
        description:
          "Turn Obsidian's Restricted mode off for every registered vault (restarts Obsidian).",
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (prototypeFlag) return err("Unknown option '--__proto__'");
  if (parsed._.length > 0)
    return err(`unexpected argument: ${parsed._.join(" ")}`);

  const ids = await vaultIds();
  if (ids.length === 0) {
    process.stdout.write(`skip: no Obsidian vault registry at ${REGISTRY}\n`);
    return success(undefined);
  }

  const quitBefore = await quit();
  if (quitBefore.isErr()) return err(quitBefore.error);
  rmSync(PORT_FILE, { force: true });
  await $`open -a Obsidian --args --remote-debugging-port=0`.quiet();
  const ws = await pageSocket();
  if (ws.isErr()) return err(ws.error);

  const keys = JSON.stringify(ids.map((id) => `enable-plugin-${id}`));
  const readBack = await evaluate(
    ws.value,
    `(() => { const ks = ${keys}; ks.forEach(k => localStorage.setItem(k, "true"));
      return Object.fromEntries(ks.map(k => [k, localStorage.getItem(k)])); })()`,
  );
  if (readBack.isErr()) return err(readBack.error);

  // Chromium commits localStorage to leveldb on a delay; quitting at once lost the last key
  // (measured 2026-10-01). Wait out the commit, then prove each key reached disk.
  await Bun.sleep(COMMIT_MS);
  const quitAfter = await quit();
  if (quitAfter.isErr()) return err(quitAfter.error);
  rmSync(PORT_FILE, { force: true });
  const unsaved = await notOnDisk(ids.map((id) => `enable-plugin-${id}`));
  await $`open -a Obsidian`.quiet();
  if (unsaved.length > 0)
    return err(`not persisted to leveldb: ${unsaved.join(", ")}`);

  const back = ReadBackSchema.safeParse(readBack.value);
  if (!back.success)
    return err(`unexpected read-back: ${JSON.stringify(readBack.value)}`);
  const entries = Object.entries(back.data);
  for (const [k, v] of entries) {
    process.stdout.write(
      `${v === "true" ? "OK  " : "FAIL"} ${k} = ${String(v)}\n`,
    );
  }
  const bad = entries.filter(([, v]) => v !== "true").length;
  if (bad > 0) return err(`${bad} key(s) did not read back as "true"`);
  process.stdout.write(
    "✅ Restricted mode is off for every registered vault; Obsidian relaunched normally.\n",
  );
  return success(undefined);
}

const outcome = await Promise.try(main).then(
  (result) => result,
  (error: unknown) =>
    err(error instanceof Error ? error.message : String(error)),
);
outcome.match(
  () => process.exit(0),
  (message) => {
    process.stderr.write(`FATAL: ${message}\n`);
    process.exit(2);
  },
);
