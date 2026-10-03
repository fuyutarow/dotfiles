// edge-policy.ts — deploy edge/policy.plist.mac as Microsoft Edge's managed policy (macOS).
// Consumer: a human or agent running `mise run edge:policy`, and `mise run doctor` (check
// `edge-policy`, via --check). Output is verdict lines.
//
// Edge reads policy only from ROOT-OWNED managed preferences, so this COPIES the file with sudo —
// never a symlink, and ~/Library/Preferences would not count as policy at all. Same shape as
// wsl:wslconfig for the Windows host. --check is the read-only comparison: no sudo, no write.
//   EDGE_POLICY_DST  destination override, for tests (then the copy is plain, without sudo).
// Exit: 0 the live policy matches / was deployed · 1 drift under --check, or deployment failed ·
//       2 usage or FATAL.
import { existsSync, readFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";

const die = (msg: string, code = 2): never => {
  console.error(`edge-policy: ${msg}`);
  process.exit(code);
};
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__")
    die(`unknown option '--${flag}'`);
};

const argv = cli(
  {
    name: "edge-policy",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: [],
    help: {
      description:
        "Deploy edge/policy.plist.mac as Microsoft Edge's managed policy (needs sudo), or --check it.",
    },
    flags: {
      check: {
        type: Boolean,
        default: false,
        description:
          "only compare the live policy with the repo's; change nothing",
      },
    },
  },
  undefined,
  Bun.argv.slice(2),
);
// Cleye leaves stray positionals in `_`; this command takes none.
if (argv._.length > 0)
  die(`unexpected argument: ${argv._[0]} (this command takes no positionals)`);

const SRC = join(import.meta.dir, "..", "edge", "policy.plist.mac");
const OVERRIDE = process.env.EDGE_POLICY_DST;
const MANAGED_DIR = "/Library/Managed Preferences";
const DST = OVERRIDE ?? join(MANAGED_DIR, "com.microsoft.Edge.plist");
const SUDO_MS = 120_000; // a person types a password

if (process.platform !== "darwin" && OVERRIDE === undefined) {
  process.stdout.write("SKIP edge-policy: macOS only\n");
  process.exit(0);
}

// Bounded child; the overrun is read off the SIGNAL (proc.killed is true after any clean exit).
async function run(
  cmd: string[],
  ms: number,
  interactive = false,
): Promise<number> {
  const sig = AbortSignal.timeout(ms);
  const stdio = interactive ? "inherit" : "ignore";
  const proc = Bun.spawn(cmd, {
    stdin: stdio,
    stdout: stdio,
    stderr: stdio,
    signal: sig,
  });
  const code = await proc.exited;
  return sig.aborted ? 124 : code;
}

async function matches(): Promise<boolean> {
  const live = await attempt(() => readFileSync(DST));
  if (!live.ok) return false;
  return Buffer.compare(readFileSync(SRC), live.value) === 0;
}

const verdict = (v: "PASS" | "FAIL", detail: string, fix?: string): void => {
  process.stdout.write(`${v} edge-policy: ${detail}\n`);
  if (fix) process.stdout.write(`     fix: ${fix}\n`);
};

// Copy the policy into place; resolves to why it could not, or undefined when it did. Under the
// test override the copy is plain; otherwise it is two sudo steps and a preferences-daemon nudge.
async function deploy(): Promise<string | undefined> {
  if (OVERRIDE !== undefined) {
    const copied = await attempt(() => copyFile(SRC, DST));
    return copied.ok ? undefined : `copy failed: ${errorMessage(copied.error)}`;
  }
  const dir = [
    "sudo",
    "install",
    "-d",
    "-m",
    "755",
    "-o",
    "root",
    "-g",
    "wheel",
    MANAGED_DIR,
  ];
  const file = [
    "sudo",
    "install",
    "-m",
    "644",
    "-o",
    "root",
    "-g",
    "wheel",
    SRC,
    DST,
  ];
  for (const step of [dir, file]) {
    const code = await run(step, SUDO_MS, true);
    if (code !== 0)
      return `'${step.slice(0, 3).join(" ")} …' failed (sudo needs a terminal and the password)`;
  }
  // Make the preferences daemon re-read the managed file now rather than at its next refresh.
  await run(["sudo", "killall", "cfprefsd"], SUDO_MS, true);
  return undefined;
}

async function main(): Promise<number> {
  if ((await run(["plutil", "-lint", SRC], 10_000)) !== 0) {
    verdict("FAIL", "edge/policy.plist.mac is not a valid property list");
    return 1;
  }
  if (await matches()) {
    verdict("PASS", `${DST} matches edge/policy.plist.mac`);
    return 0;
  }
  const why = existsSync(DST) ? "differs from" : "is missing, unlike";
  if (argv.flags.check) {
    verdict(
      "FAIL",
      `${DST} ${why} edge/policy.plist.mac`,
      "mise run edge:policy (asks for sudo)",
    );
    return 1;
  }
  const failure = await deploy();
  if (failure !== undefined) return die(failure, 1);
  if (!(await matches())) {
    verdict(
      "FAIL",
      `copied, but ${DST} still differs from edge/policy.plist.mac`,
    );
    return 1;
  }
  verdict("PASS", `deployed to ${DST}`);
  process.stdout.write(
    "     Edge applies it within minutes; to apply now: edge://policy -> Reload policies\n",
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => die(`FATAL: ${errorMessage(e)}`, 2),
);
