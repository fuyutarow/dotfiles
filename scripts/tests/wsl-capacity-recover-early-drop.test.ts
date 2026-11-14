import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claimEmergencyCacheDrop,
  MEMORY_EARLY_DROP_MB,
  memoryDropPlan,
  recoverMemoryEmergency,
} from "../wsl-capacity-recover.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

// Mirrors the controller's early-band options with the lever and cooldown injected.
function earlyOptions(
  availableMb: number,
  pageReadsPerSecond: number,
  canAttemptDrop: boolean,
  events: string[],
) {
  return {
    before: { availableMb, pageReadsPerSecond },
    thresholdMb: MEMORY_EARLY_DROP_MB,
    reason: "early" as const,
    canAttemptDrop: () => canAttemptDrop,
    isLeverAvailable: () => true,
    startLever: () => {
      events.push("drop");
      return true;
    },
    fallbackDrop: () => false,
    fallbackWhenUnavailable: false,
    wait: () => {},
    measure: () => ({ availableMb: availableMb + 500, pageReadsPerSecond }),
    isRestored: (memory: { availableMb: number } | null) =>
      memory !== null && memory.availableMb >= MEMORY_EARLY_DROP_MB,
    stopOnFailure: false,
    stopCompute: () => {
      events.push("stop");
    },
  };
}

describe("early cache drop above the emergency floor", () => {
  test("3000 MB with low page reads and no recent drop starts the lever", async () => {
    expect(memoryDropPlan({ availableMb: 3000, pageReadsPerSecond: 10 })).toBe(
      "early",
    );
    const events: string[] = [];
    const result = await recoverMemoryEmergency(
      earlyOptions(3000, 10, true, events),
    );
    expect(result).toMatchObject({
      leverAttempted: true,
      dropAttempted: true,
      emergencyOverride: false,
      stopped: false,
    });
    expect(events).toEqual(["drop"]);
  });

  test("3000 MB within the cooldown does not drop and never stops compute", async () => {
    expect(memoryDropPlan({ availableMb: 3000, pageReadsPerSecond: 800 })).toBe(
      "early",
    );
    const events: string[] = [];
    const result = await recoverMemoryEmergency(
      earlyOptions(3000, 800, false, events),
    );
    expect(result).toMatchObject({
      dropAttempted: false,
      outcome: "rate-limited",
      emergencyOverride: false,
      stopped: false,
    });
    expect(events).toEqual([]);
  });

  test("early drop never takes the emergency override or sets a STOP", async () => {
    const root = mkdtempSync(join(tmpdir(), "early-drop-override-"));
    roots.push(root);
    const episode = join(root, "episode");
    const events: string[] = [];
    const options = {
      ...earlyOptions(3000, 800, false, events),
      claimEmergencyOverride: () => claimEmergencyCacheDrop(episode),
    };
    const result = await recoverMemoryEmergency(options);
    expect(result).toMatchObject({
      dropAttempted: false,
      emergencyOverride: false,
      stopped: false,
    });
    // The early band must not consume the episode's one emergency override.
    expect(await claimEmergencyCacheDrop(episode)).toBe(true);
    expect(events).toEqual([]);
  });

  test("5000 MB is above the early band and triggers nothing", () => {
    expect(memoryDropPlan({ availableMb: 5000, pageReadsPerSecond: 10 })).toBe(
      "none",
    );
    expect(memoryDropPlan({ availableMb: 5000, pageReadsPerSecond: 800 })).toBe(
      "none",
    );
    expect(memoryDropPlan(null)).toBe("none");
  });

  test("1500 MB with 800 page reads stays on the unchanged emergency path", async () => {
    expect(memoryDropPlan({ availableMb: 1500, pageReadsPerSecond: 800 })).toBe(
      "emergency",
    );
    const root = mkdtempSync(join(tmpdir(), "early-drop-emergency-"));
    roots.push(root);
    const events: string[] = [];
    const result = await recoverMemoryEmergency({
      before: { availableMb: 1500, pageReadsPerSecond: 800 },
      thresholdMb: 2048,
      canAttemptDrop: () => false,
      claimEmergencyOverride: () => claimEmergencyCacheDrop(join(root, "ep")),
      isLeverAvailable: () => true,
      startLever: () => {
        events.push("drop");
        return true;
      },
      fallbackDrop: () => false,
      wait: () => {},
      measure: () => ({ availableMb: 1500, pageReadsPerSecond: 800 }),
      stopCompute: () => {
        events.push("stop");
      },
    });
    expect(result).toMatchObject({
      emergencyOverride: true,
      dropAttempted: true,
      stopped: true,
    });
    expect(events).toEqual(["drop", "stop"]);
    expect(memoryDropPlan({ availableMb: 1500, pageReadsPerSecond: 500 })).toBe(
      "low",
    );
  });
});
