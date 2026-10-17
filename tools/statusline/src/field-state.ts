import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DIM, RST, roles } from "./ansi.ts";
import { jsonOf, z } from "./zod.ts";

/** Unknown is permitted only before a successful observation. Good values never expire. */
export type FieldState<T> =
  | { kind: "fresh"; value: T }
  | { kind: "stale"; value: T; age: number }
  | { kind: "unknown"; reason: string };

export type FieldDisplay = (
  key: string,
  label: string,
  state: FieldState<string>,
) => string;
export type DisplayFields = Record<string, FieldState<string>>;

export function observed(
  value: string | undefined,
  reason = "unavailable",
  age = 0,
): FieldState<string> {
  if (value === undefined) return { kind: "unknown", reason };
  return age > 0 ? { kind: "stale", value, age } : { kind: "fresh", value };
}

export function renderField(label: string, state: FieldState<string>): string {
  if (state.kind === "fresh")
    return label === "agx"
      ? `agx fresh ${DIM}·${RST} ${state.value}`
      : state.value;
  if (state.kind === "stale") {
    const seconds = Math.max(0, Math.floor(state.age / 1000));
    const age = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
    const value = state.value === "" ? `${label} none` : state.value;
    if (label === "agx") return `agx ${age} old ${DIM}·${RST} ${value}`;
    return `${value} ${DIM}· ${age} old${RST}`;
  }
  if (state.kind === "unknown")
    return roles
      .unavailable(
        label,
        state.reason === "" || state.reason === "unavailable"
          ? undefined
          : state.reason,
      )
      .trimStart();
  return state satisfies never;
}

const SavedSchema = z.object({ at: z.number(), value: z.string() });

/** One atomic last-good file per field. Errors and stale reads never advance its clock. */
export async function retainField(
  key: string,
  current: FieldState<string>,
  root = join(process.env.HOME ?? "", ".cache/claude/statusline/fields"),
  now = Temporal.Now.instant().epochMilliseconds,
): Promise<FieldState<string>> {
  const hash = new Bun.CryptoHasher("sha256").update(key).digest("hex");
  const path = join(root, `${hash}.json`);
  const text = await readFile(path, "utf8").catch(() => null);
  const decoded = text === null ? null : jsonOf(SavedSchema).safeParse(text);
  const saved = decoded?.success === true ? decoded.data : undefined;
  if (current.kind === "unknown") {
    return saved === undefined
      ? current
      : { kind: "stale", value: saved.value, age: Math.max(0, now - saved.at) };
  }
  const at = now - (current.kind === "stale" ? current.age : 0);
  // Do not let an older snapshot overwrite a more recent good observation.
  if (saved !== undefined && saved.at > at)
    return {
      kind: "stale",
      value: saved.value,
      age: Math.max(0, now - saved.at),
    };
  await mkdir(root, { recursive: true }).catch(() => null);
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify({ at, value: current.value }), {
    mode: 0o600,
  })
    .then(() => rename(temp, path))
    .catch(() => null);
  return current;
}

export function fieldDisplay(
  fields?: DisplayFields,
  collect?: FieldDisplay,
): FieldDisplay {
  return (key, label, state) =>
    collect?.(key, label, state) ?? renderField(label, fields?.[key] ?? state);
}
