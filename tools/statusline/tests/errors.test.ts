import { expect, test } from "bun:test";
import { Result } from "@dotfiles/shared/src/result.ts";
import {
  decodeError,
  ErrorWireSchema,
  gpuStalled,
  missing,
  stale,
  toolFailed,
  toWire,
  unparsable,
  wireError,
  type ReadError,
} from "#src/errors.ts";
import { resultSchema } from "#src/owner-state.ts";
import { sysRow } from "#src/host-display.ts";
import { jsonOf, z } from "#src/zod.ts";

test("every tag survives the sampler-to-renderer wire with its fields", () => {
  for (const error of [
    missing("/proc/stat"),
    unparsable("meminfo"),
    stale("cpu baseline", "no earlier sample to diff against"),
    toolFailed("vm_stat", "vm_stat timeout 2000ms"),
    gpuStalled("08:07"),
  ]) {
    const wire = jsonOf(ErrorWireSchema).safeParse(
      JSON.stringify(wireError(error)),
    );
    expect(wire.success).toBe(true);
    if (!wire.success) continue;
    const back = decodeError(wire.data);
    expect(back._tag).toBe(error._tag);
    expect(back.message).toBe(error.message);
    expect(wireError(back)).toEqual(wireError(error));
  }
});

test("a string an older sampler wrote still decodes, as a stale reading with its words", () => {
  const parsed = resultSchema(z.number()).safeParse({ error: "no /proc/stat" });
  expect(parsed.success).toBe(true);
  const error = parsed.success ? parsed.data : Result.ok(0);
  expect(error.isErr() && error.error._tag).toBe("SourceStale");
  expect(error.isErr() && error.error.message).toBe("no /proc/stat");
});

test("a thrown non-ReadError keeps only its words on the wire", () => {
  expect(toWire(new Error("boom"))).toBe("boom");
  expect(toWire(missing("agx"))).toEqual({
    _tag: "SourceMissing",
    source: "agx",
    message: "no agx",
  });
});

const row = (vram: ReadError) =>
  sysRow({
    cpuPct: Result.ok(1),
    ram: Result.ok({ frac: "1/2G", pct: 50 }),
    vram: Result.err(vram),
    disks: Result.ok([]),
    tmp: [],
  });

test("the GPU alert is chosen by tag, not by how its message begins", () => {
  const alert = row(gpuStalled("08:07"));
  expect(Bun.stripANSI(alert)).toContain(
    "⚠ GPU stalled since 08:07 JST · gpu-sampler --check",
  );
  expect(Bun.stripANSI(alert)).not.toContain("n/a");
  // The same words under another tag are an ordinary n/a, not an alert.
  const quiet = Bun.stripANSI(
    row(
      stale(
        "gpu-sampler",
        "⚠ GPU stalled since 08:07 JST · gpu-sampler --check",
      ),
    ),
  );
  expect(quiet).toContain("n/a (⚠ GPU stalled since 08:07 JST");
});
