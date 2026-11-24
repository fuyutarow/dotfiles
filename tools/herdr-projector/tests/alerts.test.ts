import { expect, test } from "bun:test";
import {
  AgxUnavailable,
  alertTokenArgs,
  LONG_RUNNING_MS,
  SessionRecordUnavailable,
  ShellScanUnavailable,
} from "../src/alerts.ts";

const now = Temporal.Instant.from("2026-11-25T00:00:00Z").epochMilliseconds;
const ago = (ms: number) =>
  Temporal.Instant.fromEpochMilliseconds(now - ms).toString();

test("nothing to act on clears both row-4 tokens, so herdr drops the row", () => {
  expect(
    alertTokenArgs(
      [],
      [{ kind: "sh", id: "b1", startedAt: ago(LONG_RUNNING_MS - 1000) }],
      now,
    ),
  ).toEqual(["--clear-token", "alert_err", "--clear-token", "alert_warn"]);
});

test("a worker or shell at 12 minutes warns; at 11m59s it does not", () => {
  const args = alertTokenArgs(
    [],
    [
      { kind: "sh", id: "bpchbkzg0", startedAt: ago(LONG_RUNNING_MS) },
      { kind: "wkr", id: "94d52b95-220f", startedAt: ago(18 * 60_000) },
      { kind: "sh", id: "young", startedAt: ago(LONG_RUNNING_MS - 1000) },
    ],
    now,
  );
  expect(args).toEqual([
    "--clear-token",
    "alert_err",
    "--token",
    "alert_warn=⚠️ wkr 94d52b95 18m · sh_bpchbkzg0 12m",
  ]);
});

test("errors are rendered from their tags, and warnings that do not fit fold into +N", () => {
  const args = alertTokenArgs(
    [
      new SessionRecordUnavailable({
        why: "no session file",
        message: "missing",
      }),
      new AgxUnavailable({ message: "agx down" }),
      new ShellScanUnavailable({ why: "tasks dir unreadable", message: "x" }),
    ],
    Array.from({ length: 6 }, (_, index) => ({
      kind: "sh" as const,
      id: `shell${index}`,
      startedAt: ago(LONG_RUNNING_MS + index * 60_000),
    })),
    now,
  );
  const err = args[1] ?? "";
  const warn = args[3] ?? "";
  expect(err).toStartWith("alert_err=✖ session no session file");
  expect(err).toMatch(/ · \+\d+$/u);
  expect(warn).toStartWith("alert_warn=⚠️ sh_shell5 17m");
  expect(warn).toMatch(/ · \+\d+$/u);
  for (const text of [err, warn])
    expect(
      Bun.stringWidth(text.slice(text.indexOf("=") + 1)),
    ).toBeLessThanOrEqual(44);
});
