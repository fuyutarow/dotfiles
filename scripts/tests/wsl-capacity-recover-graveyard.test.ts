import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expireGraveyard } from "../wsl-capacity-recover.ts";
import { cliEnv } from "../../tools/disk-reclaim/tests/fixtures/cli-env.ts";
import {
  inspectRipGraveyard,
  RIP_GRAVEYARD_MAX_BYTES,
} from "../../tools/disk-reclaim/src/lib/graveyards.ts";
import { Plan } from "../../tools/disk-reclaim/src/model.ts";
import { jsonOf } from "../../tools/shared/src/zod.ts";

test("timer expiry bounds a fresh graveyard oldest-first, then preserves its restore record", async () => {
  const root = await mkdtemp(join(tmpdir(), "timer-graveyard-cap-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const env = cliEnv(root);
  await mkdir(env.RIP_GRAVEYARD);
  const names = ["oldest", "middle", "recent", "newest"];
  const GiB = 1024 ** 3;
  const sizes = [6 * GiB, 5 * GiB, 2 * GiB, 6 * GiB];
  const times = [4, 3, 2, 1].map((hours) =>
    Temporal.Now.instant().subtract({ hours }),
  );
  for (const [i, name] of names.entries()) {
    const path = join(env.RIP_GRAVEYARD, name);
    const file = await open(path, "w");
    await file.truncate(sizes[i]);
    await file.close();
    const time = (times[i]?.epochMilliseconds ?? 0) / 1000;
    await utimes(path, time, time);
  }
  const record = names
    .map(
      (name, i) =>
        `${times[i]?.toString() ?? ""}\t/original/${name}\t${join(env.RIP_GRAVEYARD, name)}`,
    )
    .join("\n");
  await writeFile(join(env.RIP_GRAVEYARD, ".record"), record);
  const before = inspectRipGraveyard(env.RIP_GRAVEYARD).bytes;
  expect(before).toBeGreaterThan(RIP_GRAVEYARD_MAX_BYTES);
  const invoke = (dryRun: boolean) =>
    expireGraveyard(
      dryRun,
      async (stage) => {
        expect(stage.name).toBe("rip-expire");
        const proc = Bun.spawn(stage.argv, {
          env,
          stdout: "pipe",
          stderr: "pipe",
          timeout: stage.timeoutMs,
        });
        const [output, error, code] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        expect(error).not.toContain("ERROR");
        return { code, output, timedOut: proc.signalCode !== null };
      },
      Bun.which("mise") ?? "mise",
    );
  const preview = await invoke(true);
  expect(preview.code).toBe(0);
  const planned = jsonOf(Plan).safeParse(preview.output);
  expect(planned.success).toBe(true);
  if (!planned.success) return;
  expect(
    planned.data.targets[0]?.candidates
      .filter((row) => row.verdict === "RECLAIM")
      .map((row) => row.path),
  ).toEqual([
    join(env.RIP_GRAVEYARD, "oldest"),
    join(env.RIP_GRAVEYARD, "middle"),
  ]);
  expect(inspectRipGraveyard(env.RIP_GRAVEYARD).bytes).toBe(before);
  const applied = await invoke(false);
  expect(applied.code).toBe(0);
  const result = jsonOf(Plan).safeParse(applied.output);
  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(
    result.data.targets[0]?.candidates
      .filter((row) => row.result?.ok === true)
      .map((row) => row.path),
  ).toEqual([
    join(env.RIP_GRAVEYARD, "oldest"),
    join(env.RIP_GRAVEYARD, "middle"),
  ]);
  expect(await stat(join(env.RIP_GRAVEYARD, "recent")).then(() => true)).toBe(
    true,
  );
  expect(await stat(join(env.RIP_GRAVEYARD, "newest")).then(() => true)).toBe(
    true,
  );
  expect(await readFile(join(env.RIP_GRAVEYARD, ".record"), "utf8")).toBe(
    record,
  );
  expect(inspectRipGraveyard(env.RIP_GRAVEYARD).bytes).toBeLessThanOrEqual(
    RIP_GRAVEYARD_MAX_BYTES,
  );
  const again = await invoke(false);
  expect(again.code).toBe(0);
}, 120_000);
