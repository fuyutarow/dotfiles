import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assess,
  loadStorageHeadroom,
  measureStorage,
  storageLine,
} from "../src/storage-headroom.ts";

const GiB = 1024 ** 3;
const REAL_CONFIG = join(
  import.meta.dir,
  "../../../agents/hooks/storage-headroom.toml",
);

describe("storage headroom", () => {
  test("line math uses the smaller threshold and the absolute line without a total", () => {
    expect(storageLine(40, 10, 1_000 * GiB)).toBe(40 * GiB);
    expect(storageLine(40, 10, 200 * GiB)).toBe(20 * GiB);
    expect(storageLine(40, 10, null)).toBe(40 * GiB);
    expect(storageLine(1_000_000, 0, 500 * GiB)).toBe(0);
  });

  test("loads guest / and host C: thresholds from the authoritative TOML", () => {
    const loaded = loadStorageHeadroom(REAL_CONFIG);
    expect(loaded.errors).toEqual([]);
    const guest = loaded.drives.find((drive) => drive.label === "guest /") ?? {
      label: "",
      path: "",
      deny_gib: 0,
      deny_pct: 0,
    };
    const host = loaded.drives.find((drive) =>
      drive.label.startsWith("host C:"),
    ) ?? {
      label: "",
      path: "",
      deny_gib: 0,
      deny_pct: 0,
    };
    expect(guest).toMatchObject({ path: "/", deny_gib: 40, deny_pct: 10 });
    expect(host).toMatchObject({
      label: "host C: (WSL vhdx)",
      path: "/mnt/c",
      deny_gib: 20,
      deny_pct: 5,
      warn_gib: 20,
      warn_pct: 10,
      stop_gib: 10,
      rate_red_minutes: 30,
      rate_yellow_minutes: 120,
    });
    expect(
      assess(guest, { free: 100 * GiB, total: 1_000 * GiB }).deny_line,
    ).toBe(40 * GiB);
    expect(
      assess(host, { free: 100 * GiB, total: 1_000 * GiB }).deny_line,
    ).toBe(20 * GiB);
  });

  test("assessment boundaries are strict and stop remains an independent line", () => {
    const drive = {
      label: "fixture",
      path: "/",
      deny_gib: 40,
      deny_pct: 10,
      warn_gib: 60,
      warn_pct: 20,
      stop_gib: 10,
    };
    expect(assess(drive, { free: 60 * GiB, total: null })).toEqual({
      state: "ok",
      deny_line: 40 * GiB,
      warn_line: 60 * GiB,
      stop_line: 10 * GiB,
    });
    expect(assess(drive, { free: 60 * GiB - 1, total: null }).state).toBe(
      "warn",
    );
    expect(assess(drive, { free: 40 * GiB, total: null }).state).toBe("warn");
    expect(assess(drive, { free: 40 * GiB - 1, total: null }).state).toBe(
      "deny",
    );
  });

  test("warn fields must be paired, percentages bounded, and host stop below deny", () => {
    const dir = mkdtempSync(join(tmpdir(), "shared-storage-config-"));
    const path = join(dir, "storage.toml");
    writeFileSync(
      path,
      `schema = 1\n[drive.host]\nlabel = "host"\npath = "/mnt/c"\ndeny_gib = 20\ndeny_pct = 101\nwarn_pct = 10\nstop_gib = 20\n`,
    );
    const loaded = loadStorageHeadroom(path);
    expect(loaded.drives).toEqual([]);
    expect(loaded.errors.join("; ")).toContain(
      "drive.host: warn_gib and warn_pct go together",
    );
    expect(loaded.errors.join("; ")).toContain(
      "drive.host.deny_pct: a percentage",
    );
    expect(loaded.errors.join("; ")).toContain(
      "drive.host.stop_gib: must be below deny_gib",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("requires a host drive table", () => {
    const dir = mkdtempSync(join(tmpdir(), "shared-storage-config-"));
    const path = join(dir, "storage.toml");
    writeFileSync(
      path,
      `schema = 1\n[drive.guest]\nlabel = "guest /"\npath = "/"\ndeny_gib = 40\ndeny_pct = 10\n`,
    );
    expect(loadStorageHeadroom(path).errors).toContain(
      "drive.host: required Windows host drive table",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("reports unreadable and invalid TOML instead of guessing thresholds", () => {
    const dir = mkdtempSync(join(tmpdir(), "shared-storage-config-"));
    const path = join(dir, "storage.toml");
    writeFileSync(path, "schema = = 1\n");
    expect(loadStorageHeadroom(path).errors[0]).toContain(
      `cannot read or parse ${path}:`,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("measures unprivileged free bytes and filesystem capacity with statfs", () => {
    const measured = measureStorage(tmpdir());
    expect(measured).not.toBeNull();
    expect(measured?.free).toBeGreaterThan(0);
    expect(measured?.total).toBeGreaterThan(0);
    expect(measureStorage(join(tmpdir(), "missing-storage-path"))).toBeNull();
  });
});
