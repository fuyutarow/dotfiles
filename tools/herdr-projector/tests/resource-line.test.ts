import { expect, test } from "bun:test";
import { cpuTokenArgs, resourceTokens } from "../src/herdr-projector.ts";

const GiB = 1024 ** 3;
const CPU_NAMES = ["cpu_lo", "cpu_mid", "cpu_hi"];

test("cpu is its own token chosen by the shared usage level; the rest is one token", () => {
  for (const [cpu, token] of [
    [1, "cpu_lo"],
    [50, "cpu_lo"],
    [75, "cpu_mid"],
    [99, "cpu_hi"],
    [69, "cpu_lo"],
    [70, "cpu_mid"],
    [89, "cpu_mid"],
    [90, "cpu_hi"],
  ] as const) {
    const tokens = resourceTokens(3, cpu, 8.5 * GiB, undefined);
    expect(tokens.cpu).toEqual({ token, text: `cpu ${cpu}%` });
    expect(tokens.resources).toBe("workers 3 ram 8.5G");
  }
});

test("exactly one cpu token is reported, the other two cleared, all plain text", () => {
  for (const cpu of [1, 50, 75, 99]) {
    const args = cpuTokenArgs(resourceTokens(3, cpu, 8.5 * GiB, undefined).cpu);
    const reported = args.flatMap((arg, i) =>
      args[i - 1] === "--token" ? [arg] : [],
    );
    const cleared = args.flatMap((arg, i) =>
      args[i - 1] === "--clear-token" ? [arg] : [],
    );
    expect(reported).toHaveLength(1);
    expect(cleared).toHaveLength(2);
    expect(reported[0]).toMatch(/^cpu_(lo|mid|hi)=cpu \d+%$/u);
    expect(new Set([...cleared, reported[0]?.split("=")[0]])).toEqual(
      new Set(CPU_NAMES),
    );
    expect(args.some((arg) => /\p{Cc}/u.test(arg))).toBe(false);
  }
  expect(cpuTokenArgs(resourceTokens(3, 99, undefined, undefined).cpu)).toEqual(
    [
      "--clear-token",
      "cpu_lo",
      "--clear-token",
      "cpu_mid",
      "--token",
      "cpu_hi=cpu 99%",
    ],
  );
});

test("unknown cpu reports no cpu token and keeps cpu ? in the grey token", () => {
  const unknown = resourceTokens(undefined, undefined, undefined, undefined);
  expect(unknown).toEqual({ resources: "workers ? · cpu ?" });
  expect(cpuTokenArgs(unknown.cpu)).toEqual([
    "--clear-token",
    "cpu_lo",
    "--clear-token",
    "cpu_mid",
    "--clear-token",
    "cpu_hi",
  ]);
});

test("rest token fits what the cpu token and herdr's one separator leave of the row", () => {
  const row = (cpu: number, width: number) => {
    const t = resourceTokens(3, cpu, 8.5 * GiB, 12 * GiB, width);
    return `${t.cpu?.text} · ${t.resources}`;
  };
  expect(row(99, 28)).toBe("cpu 99% · workers 3 ram 8.5G");
  expect(row(99, 28)).toHaveLength(28);
  expect(row(1, 28)).toBe("cpu 1% · workers 3 ram 8.5G");
  // Wide sidebars keep the priority order, separators inside the rest, vram kept.
  expect(row(74, 60)).toBe("cpu 74% · workers 3 · ram 8.5G · vram 12G");
  // Narrow: vram dropped, then the rest is sliced to its share.
  expect(row(74, 22)).toBe("cpu 74% · workers 3 ra");
});

test("memory uses two significant figures in wide and compact rest tokens", () => {
  for (const [value, expected] of [
    [279.4 * 1024 ** 2, "0.27G"],
    [115.8 * 1024 ** 2, "0.11G"],
    [700 * 1024 ** 2, "0.68G"],
    [512 * 1024 ** 2, "0.50G"],
    [1.7 * GiB, "1.7G"],
    [54.9 * GiB, "55G"],
    [1023.9 * 1024 ** 2, "1.0G"],
    [1.04 * GiB, "1.0G"],
  ] as const) {
    expect(resourceTokens(1, 1, value, value, 80).resources).toBe(
      `workers 1 · ram ${expected} · vram ${expected}`,
    );
    const compact = `workers 1 ram ${expected} vram ${expected}`;
    // The rest token gets the row width minus "cpu 1%" and herdr's " · ".
    expect(
      resourceTokens(1, 1, value, value, compact.length + 9).resources,
    ).toBe(compact);
  }
});
