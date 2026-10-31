import { expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { waitForRecoveryVerdict } from "../src/lib/recovery-verdict.ts";

const verdict = (value: "OK" | "HOLD", emergency = false) =>
  JSON.stringify({
    schema: 1,
    verdict: value,
    memory_emergency: emergency,
    windows_available_mb: 1322,
    recorded_at: Temporal.Now.instant().toString(),
  });

test("a HOLD waits for a fresh OK read from the file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "recovery-test-"));
  const path = join(dir, "verdict.json");
  await Bun.write(path, verdict("HOLD"));
  const progress: string[] = [];
  const waiting = waitForRecoveryVerdict(1, {
    read: () => readFile(path, "utf8"),
    pollMs: 10,
    progress: (line) => {
      progress.push(line);
    },
  });
  await Bun.sleep(30);
  await Bun.write(path, verdict("OK"));
  expect((await waiting).state).toBe("ok");
  expect(progress.join("\n")).toContain(
    "WAIT fresh OK RECOVER_VERDICT verdict=HOLD age=",
  );
  expect(progress.join("\n")).toContain("next_expected_estimate=");
});

test("HOLD expiry refuses even if the verdict disappears", async () => {
  let reads = 0;
  const result = await waitForRecoveryVerdict(0.04, {
    read: () => Promise.resolve(++reads === 1 ? verdict("HOLD") : undefined),
    pollMs: 10,
    progress: () => {},
  });
  expect(result.kind).toBe("refuse");
  expect(result.message).toContain("waited=");
  expect(reads).toBeGreaterThan(1);
});

test("memory emergency refuses immediately", async () => {
  let reads = 0;
  let progress = 0;
  const result = await waitForRecoveryVerdict(1, {
    read: () => {
      reads++;
      return Promise.resolve(verdict("HOLD", true));
    },
    progress: () => {
      progress++;
    },
  });
  expect(result.kind).toBe("refuse");
  expect(result.message).toContain("memory_emergency");
  expect(reads).toBe(1);
  expect(progress).toBe(0);
});

test("progress uses stderr without checking for a terminal", async () => {
  const chunks: string[] = [];
  const stderr = spyOn(process.stderr, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  using _restore = {
    [Symbol.dispose]: () => {
      stderr.mockRestore();
    },
  };
  const result = await waitForRecoveryVerdict(0, {
    read: () => Promise.resolve(verdict("HOLD")),
  });
  expect(result.kind).toBe("refuse");
  expect(chunks.join("")).toContain(
    "WAIT fresh OK RECOVER_VERDICT verdict=HOLD age=",
  );
  expect(chunks.join("")).toContain("next_expected_estimate=");
});
