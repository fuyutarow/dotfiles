// The TypeSafe (Jev) API key, found in ONE place for every caller: dispatch's auto pick and, later,
// repo-retrieve's judge. Zero-dep like the hooks (Bun only).
//
// Order: TYPESAFE_API_KEY in the environment (a caller under `fnox exec`), then `fnox get` (the
// machine's secret store: macOS Keychain on the Mac, an age file on WSL — ~/.config/fnox), then the
// legacy ~/.config/typesafe/.env. Each miss is named, so "no key" always says where it looked.
// The key is returned to the caller only; it is never printed, logged or put in argv.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type KeyLookup =
  | { ok: true; key: string; source: "env" | "fnox" | "file" }
  | { ok: false; reason: string };

const LEGACY_FILE = join(homedir(), ".config/typesafe/.env");

function fromFnox(): { ok: true; key: string } | { ok: false; why: string } {
  const r = Bun.spawnSync(["fnox", "get", "TYPESAFE_API_KEY"], {
    cwd: homedir(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  if (r.exitCode !== 0) {
    const err = r.stderr.toString().trim().split("\n").at(-1) ?? "";
    return {
      ok: false,
      why: `fnox exit ${r.exitCode ?? "killed"}${err === "" ? "" : `: ${err}`}`,
    };
  }
  const key = r.stdout.toString().trim();
  return key === ""
    ? { ok: false, why: "fnox returned an empty value" }
    : { ok: true, key };
}

function fromLegacyFile(): string | undefined {
  if (!existsSync(LEGACY_FILE)) return undefined;
  const m = /^TYPESAFE_API_KEY=(\S+)$/mu.exec(
    readFileSync(LEGACY_FILE, "utf8"),
  );
  return m?.[1];
}

/** The key and where it came from, or why none was found (every place tried is named). */
export function typesafeKey(): KeyLookup {
  const env = process.env.TYPESAFE_API_KEY;
  if (env !== undefined && env !== "")
    return { ok: true, key: env, source: "env" };
  const fnox =
    Bun.which("fnox") === null
      ? { ok: false as const, why: "fnox not installed" }
      : fromFnox();
  if (fnox.ok) return { ok: true, key: fnox.key, source: "fnox" };
  const file = fromLegacyFile();
  if (file !== undefined) return { ok: true, key: file, source: "file" };
  return {
    ok: false,
    reason: `no TYPESAFE_API_KEY (env unset; ${fnox.why}; ${LEGACY_FILE} absent or without the key)`,
  };
}
