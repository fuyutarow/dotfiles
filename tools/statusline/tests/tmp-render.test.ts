import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempDirs, tempHome } from "./helpers.ts";
import { ESC } from "../src/ansi.ts";

afterAll(cleanupTempDirs);
test.each([
  ["warn", "15%", "38;5;178"],
  ["deny", "5%", "38;5;167"],
  ["exhausted", "0%", "38;5;167"],
  ["missing", "n/a", "38;5;178"],
  ["hung", "n/a", "38;5;178"],
])(
  "real Sys render and transcript snapshot retain tmp %s",
  (mode, value, color) => {
    const home = tempHome();
    const bin = join(home, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "nvidia-smi"), "#!/bin/sh\nexit 1\n");
    chmodSync(join(bin, "nvidia-smi"), 0o755);
    const result = Bun.spawnSync(
      [
        process.execPath,
        "--preload",
        join(import.meta.dir, "parity-preload.ts"),
        join(import.meta.dir, "../src/statusline.ts"),
      ],
      {
        cwd: home,
        env: {
          HOME: home,
          PATH: bin,
          PWD: home,
          TZ: "UTC",
          AGX_STATE_DIR: join(home, "state"),
          STATUSLINE_FIXTURE_TMP: mode,
        },
        stdin: new Blob(["{}"]),
        timeout: 6000,
      },
    );
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    const row = result.stdout
      .toString()
      .split("\n")
      .find((line) => line.includes("Sys:"));
    expect(row).toContain(`${ESC}[${color}m${value}`);
    const snapshot = readFileSync(
      join(home, ".cache/claude/statusline-sys.json"),
      "utf8",
    );
    if (mode === "missing" || mode === "hung") {
      const why = mode === "missing" ? "ENOENT" : "statfs timeout 150ms";
      expect(
        row?.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), ""),
      ).toContain(`tmp n/a (${why})`);
      expect(snapshot).toContain(`tmp n/a (${why})`);
    } else {
      expect(row).toContain("tmp ");
      expect(snapshot).toContain(`inodes ${value} free`);
    }
  },
);
