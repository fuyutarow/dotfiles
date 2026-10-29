import { join } from "node:path";
import { err, ok } from "neverthrow";
import type { Dataframe } from "./dataframe.ts";
import { render } from "./format.ts";
import {
  observed,
  renderField,
  retainField,
  type DisplayFields,
  type FieldState,
} from "./field-state.ts";
import { jsonOf, z } from "./zod.ts";

const HOST_FIELDS = new Set([
  "cpu",
  "ram",
  "vram",
  "gpu",
  "tmpfs",
  "jobs",
  "dispatch-warning",
  "recover",
  "jev",
  "codex-rate",
  "account",
  "model-caps",
  "claude-5h",
  "claude-7d",
  "claude-label",
]);

/** Persist individual presentation values, rather than a frame containing failed neighbors. */
export async function prepareDisplayFields(
  df: Dataframe,
  root?: string,
  only?: (key: string) => boolean,
  codex = false,
): Promise<void> {
  const store =
    root ?? join(process.env["HOME"] ?? "", ".cache/claude/statusline/fields");
  // Remember the disk inventory independently, so even a failed config read retains each disk.
  const inventory = await retainField(
    "disk-inventory",
    observed(undefined),
    store,
  );
  if (inventory.kind !== "unknown") {
    const labels = jsonOf(z.array(z.string())).safeParse(inventory.value);
    const why = df.disks.isErr() ? df.disks.error : "disk not reported";
    const entries = df.disks.isOk() ? df.disks.value : [];
    if (labels.success)
      df.disks = ok([
        ...entries,
        ...labels.data
          .filter((label) => !entries.some((disk) => disk.label === label))
          .map((label) => ({ kind: "miss" as const, label, why })),
      ]);
  }
  if (df.disks.isOk())
    await retainField(
      "disk-inventory",
      observed(JSON.stringify(df.disks.value.map((d) => d.label))),
      store,
    );
  const codexInventory = await retainField(
    "codex-windows",
    observed(undefined),
    store,
  );
  const previousWindows =
    codexInventory.kind === "unknown"
      ? undefined
      : jsonOf(z.array(z.number())).safeParse(codexInventory.value);
  df.codexWindowMinutes = [
    ...new Set([
      10080,
      ...(df.codexRate?.windows.map((window) => window.minutes) ?? []),
      ...(previousWindows?.success === true ? previousWindows.data : []),
    ]),
  ];
  await retainField(
    "codex-windows",
    observed(JSON.stringify(df.codexWindowMinutes)),
    store,
  );
  const vramPresence = await retainField(
    "vram-presence",
    observed(df.vram?.isOk() === true ? "present" : undefined),
    store,
  );
  if (df.vram === undefined && vramPresence.kind !== "unknown") {
    // A previously observed GPU disappearing is a failed observation, not a new machine.
    df.vram = err("GPU unavailable");
  }
  const pending = new Map<
    string,
    Promise<readonly [string, FieldState<string>]>
  >();
  if (df.tmpfs === undefined) {
    const prior = await retainField("host:tmpfs", observed(undefined), store);
    if (prior.kind !== "unknown") df.tmpfs = err("tmpfs unavailable");
  }
  const tmpInventory = await retainField(
    "tmp-inventory",
    observed(undefined),
    store,
  );
  const previousTmp =
    tmpInventory.kind === "unknown"
      ? undefined
      : jsonOf(z.array(z.string())).safeParse(tmpInventory.value);
  const tmp = df.tmp ?? [
    { kind: "miss" as const, label: "tmp", why: "not sampled" },
  ];
  df.tmp = [
    ...tmp,
    ...(previousTmp?.success === true ? previousTmp.data : [])
      .filter((label) => !tmp.some((entry) => entry.label === label))
      .map((label) => ({
        kind: "miss" as const,
        label,
        why: "tmp unavailable",
      })),
  ];
  await retainField(
    "tmp-inventory",
    observed(JSON.stringify(df.tmp.map((entry) => entry.label))),
    store,
  );
  render(df, {
    codex,
    collect: (key, label, state) => {
      let scope = "host";
      if (
        !HOST_FIELDS.has(key) &&
        !key.startsWith("codex:") &&
        !key.startsWith("disk:") &&
        !key.startsWith("tmp:") &&
        !key.startsWith("model-cap:")
      ) {
        const place = key === "branch" ? df.cwd : "session";
        scope = `${df.sid ?? df.cwd}:${place}`;
      }
      if (only === undefined || only(key))
        pending.set(
          key,
          retainField(`${scope}:${key}`, state, store).then(
            (value) => [key, value] as const,
          ),
        );
      return renderField(label, state);
    },
  });
  const fields: DisplayFields = Object.fromEntries(
    await Promise.all(pending.values()),
  );
  df.fields = fields;
}
