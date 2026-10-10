import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "bootstrap-linux.sh");
const roots: string[] = [];

function executable(path: string, source: string): void {
  writeFileSync(path, source, "utf8");
  chmodSync(path, 0o755);
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("bootstrap linux:init argv forwarding", () => {
  test.each([
    ["no flag", [], []],
    ["rented", ["--rented"], ["--rented"]],
  ] as const)(
    "linux-init receives exactly the requested argv: %s",
    (label, args, expected) => {
      const root = mkdtempSync(join(tmpdir(), "bootstrap-linux-args-"));
      roots.push(root);
      const bin = join(root, "bin");
      const home = join(root, "home");
      const targetHome = join(root, "target-home");
      const miseBin = join(targetHome, ".local/bin");
      mkdirSync(bin, { recursive: true });
      mkdirSync(miseBin, { recursive: true });
      mkdirSync(join(targetHome, "dotfiles"), { recursive: true });
      const capture = join(root, "linux-init-argv");

      for (const name of ["sed", "apt-get", "install", "chsh", "useradd"])
        executable(join(bin, name), "#!/bin/bash\nexit 0\n");
      executable(join(bin, "id"), "#!/bin/bash\nexit 0\n");
      executable(
        join(bin, "sudo"),
        '#!/bin/bash\nshift 2\n[ "$1" = bash ] && [ "$2" = -c ] || exit 90\ncase "$3" in *Homebrew/install*"brew install bun mise"*) ;; *) exit 91;; esac\nshift 4\nfor arg do printf \'%s\\0\' "$arg"; done > "$TEST_CAPTURE"\n',
      );
      executable(
        join(miseBin, "mise"),
        '#!/bin/bash\nwhile (($#)); do if [[ $1 == */linux-init.ts ]]; then shift; for arg do printf \'%s\\0\' "$arg"; done > "$TEST_CAPTURE"; exit 0; fi; shift; done\nexit 91\n',
      );

      const run = Bun.spawnSync(["bash", SCRIPT, ...args], {
        env: {
          ...process.env,
          PATH: `${bin}:/bin:/usr/bin`,
          HOME: home,
          TEST_CAPTURE: capture,
          TEST_TARGET_HOME: targetHome,
        },
        stdout: "pipe",
        stderr: "pipe",
        // Real shell processes can exceed 5s under full-suite load; retain a finite child bound.
        timeout: 10_000,
      });
      expect(run.exitCode, run.stdout.toString() + run.stderr.toString()).toBe(
        0,
      );
      const captured = readFileSync(capture, "utf8");
      const received = captured === "" ? [] : captured.slice(0, -1).split("\0");
      expect(received).toEqual([...expected]);
      expect(label).toBeTruthy();
    },
    12_000,
  );
});
