import { $ } from "bun";
import { cli } from "cleye";
import { existsSync, mkdirSync } from "node:fs";

// macOS system defaults — declarative, idempotent (single source of truth).
// Run via `mise run mac:defaults` (wired into `mise run mac:init`). Consumer: human, verdict lines.
// macOS-only topic dir (like karabiner/); a no-op elsewhere. Migrated from defaults.sh 2026-09-29
// (NO-NEW-BASH: the .sh could not grow).

let prototypeFlagError: string | undefined;

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    prototypeFlagError = `Unknown option '--${flag}'`;
  }
}

type Value =
  | ["-bool", boolean]
  | ["-int", number]
  | ["-float", number]
  | ["-string", string];
type Setting = { domain: string; key: string; value: Value; why: string };

const HOME = process.env.HOME ?? "";
const SCREENSHOTS = `${HOME}/Pictures/Screenshots`;

const SETTINGS: Setting[] = [
  // Range is 0 (slowest) .. 3 (fastest). Apple ships this UNSET, which resolves to 0.6875
  // (slider notch 3/8) — that felt too slow, so this pins 2x the shipped baseline.
  {
    domain: "-g",
    key: "com.apple.trackpad.scaling",
    value: ["-float", 1.375],
    why: "Trackpad tracking speed",
  },
  {
    domain: "com.apple.finder",
    key: "AppleShowAllFiles",
    value: ["-bool", true],
    why: "Finder: show hidden (dotfile) files",
  },
  {
    domain: "com.apple.dock",
    key: "static-only",
    value: ["-bool", true],
    why: "Dock: only running apps",
  },
  // Lower is faster; both need a logout/login to take effect (defaults(1) can't force that).
  {
    domain: "-g",
    key: "KeyRepeat",
    value: ["-int", 3],
    why: "Key repeat rate",
  },
  {
    domain: "-g",
    key: "InitialKeyRepeat",
    value: ["-int", 20],
    why: "Delay until repeat",
  },
  // "Keyboard" > "Add period with double-space". Global; apps read it at launch.
  {
    domain: "-g",
    key: "NSAutomaticPeriodSubstitutionEnabled",
    value: ["-bool", false],
    why: "No period on double-space",
  },
  // Control Center's own domain since Ventura moved menu-bar items out of com.apple.menuextra.*.
  {
    domain: "com.apple.controlcenter",
    key: "BatteryShowPercentage",
    value: ["-bool", true],
    why: "Menu bar battery %",
  },
  // Default is Desktop, which gets noisy fast.
  {
    domain: "com.apple.screencapture",
    key: "location",
    value: ["-string", SCREENSHOTS],
    why: "Screenshot location",
  },
  // Maccy (clipboard history; Brewfile cask "maccy"): popup on Cmd+B — carbonKeyCode 11 = B,
  // carbonModifiers 256 = Cmd. `defaults write` creates the domain even if Maccy never launched.
  {
    domain: "org.p0deje.Maccy",
    key: "KeyboardShortcuts_popup",
    value: ["-string", '{"carbonKeyCode":11,"carbonModifiers":256}'],
    why: "Maccy popup on Cmd+B",
  },
  {
    domain: "org.p0deje.Maccy",
    key: "pasteByDefault",
    value: ["-bool", true],
    why: "Maccy paste on select",
  },
];

// Apps that cache these settings at launch.
const RESTART = ["Finder", "Dock", "ControlCenter"];

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "defaults.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description: "Apply declarative macOS system defaults (idempotent).",
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (prototypeFlagError !== undefined) {
    process.stderr.write(`FATAL: ${prototypeFlagError}\n`);
    process.exit(2);
  }
  if (parsed._.length > 0) {
    process.stderr.write(`FATAL: unexpected argument: ${parsed._.join(" ")}\n`);
    process.exit(2);
  }

  if (process.platform !== "darwin") {
    process.stdout.write("skip: not macOS\n");
    return;
  }

  mkdirSync(SCREENSHOTS, { recursive: true });
  for (const s of SETTINGS) {
    const [type, v] = s.value;
    await $`defaults write ${s.domain} ${s.key} ${type} ${String(v)}`;
  }

  if (existsSync("/Applications/Maccy.app")) {
    await $`killall Maccy`.quiet().nothrow();
    await $`open -a Maccy`;
  }
  for (const app of RESTART) await $`killall ${app}`.quiet().nothrow();

  process.stdout.write(
    `✅ macOS defaults applied (${SETTINGS.length} keys).\n`,
  );
  process.stdout.write(
    "   Key repeat speed (trackpad scaling included) only takes effect after logout/login.\n",
  );
  process.stdout.write(
    "   Double-space period: relaunch running apps to pick it up.\n",
  );
}

await main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`FATAL: ${msg}\n`);
  process.exit(2);
});
