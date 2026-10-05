// render-roster — write the dispatch roster (agents/models/dispatch-roster.toml) as the radio table
// that opens the dispatch policy in agents/claude/CLAUDE.md, between the roster markers.
// Consumers: `mise run roster:render` (--write) and `mise run lint:roster` (--check).
//
// The roster is the one home of what a coordinator may dispatch to; the policy a coordinator reads
// every session must show the same ids, numbers and default, so the block is generated and a gate
// fails when they differ. Edit the roster, never the block.
//
// Modes: --write rewrites the block · --check exits 1 on drift · neither prints the block.
// Exit: 0 ok / up to date · 1 drift (--check) · 2 FATAL (usage, unreadable roster, markers missing).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import {
  enabledChoices,
  loadRoster,
  rosterTable,
} from "../agents/models/roster.ts";

const CLAUDE_MD = join(import.meta.dir, "..", "agents", "claude", "CLAUDE.md");
const BEGIN = "<!-- roster:begin -->";
const END = "<!-- roster:end -->";

function fatal(message: string): never {
  console.error(`render-roster: ${message}`);
  return process.exit(2);
}
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__")
    fatal(`unknown option '--${flag}'`);
};
const argv = cli(
  {
    name: "render-roster",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: [],
    help: {
      description:
        "Render the dispatch roster into agents/claude/CLAUDE.md (--write / --check).",
    },
    flags: {
      write: {
        type: Boolean,
        default: false,
        description: "rewrite the block in CLAUDE.md",
      },
      check: {
        type: Boolean,
        default: false,
        description: "exit 1 when the block is stale",
      },
    },
  },
  undefined,
  Bun.argv.slice(2),
);
if (argv._.length > 0) fatal(`unexpected argument: ${argv._[0]}`);
if (argv.flags.write && argv.flags.check)
  fatal("give --write or --check, not both");

const loaded = await attempt(() => loadRoster());
if (!loaded.ok) fatal(`cannot read the roster: ${errorMessage(loaded.error)}`);
const roster = loaded.value;
const claudeOn = enabledChoices(roster).some((c) => c.route === "claude");

const block = [
  BEGIN,
  "<!-- GENERATED from agents/models/dispatch-roster.toml by scripts/render-roster.ts — edit the roster, then `mise run roster:render`; `mise run lint:roster` fails on drift. -->",
  `- **Every dispatch goes through \`agent-router run\`: Jev picks one row of this roster from the brief (zero-shot, logged with its probabilities), or you name one with \`--choice\` — no justification line. Luna first: when Jev is unsure or unavailable the default \`${roster.default}\` runs, and the receipt says why.**`,
  `  AA = Artificial Analysis Intelligence Index; TB4 = Terminal-Bench 4.0 and SciCode, AA's own runs (percent); list price USD per 1M tokens; as of ${roster.as_of}.`,
  "",
  ...rosterTable(roster)
    .split("\n")
    .map((l) => (l === "" ? "" : `  ${l}`)),
  "",
  ...(claudeOn
    ? [
        `  How to choose: leave luna rows to Jev; raise the luna effort before leaving luna; take a Claude row for long terminal or agentic loops (the TB4 gap) or judgment.`,
        "  How to run: a luna row is `agent-router run --prompt-file <brief> --cd <dir> --sandbox read-only|workspace-write` from Bash — the one entry point: without --choice Jev picks the row from the brief (falls back to the default, with the reason, when unsure), with `--choice <id>` it takes yours; it logs the pick, shows the run in the statusline, and prints a JSON receipt. Several in the background for parallel work; `agent-router ls` / `agent-router stats`. A Claude row is the Agent tool with `subagent_type` set to the id. The Workflow tool is not used; the dispatch hook denies it, and any off-roster, disabled or luna `subagent_type`, and prints this table.",
      ]
    : [
        `  How to choose: leave it to Jev; name a row only when you know better (e.g. one effort higher after a failed run; \`luna-max\` is the ceiling in this config).`,
        "  How to run: `agent-router run --prompt-file <brief> --cd <dir> --sandbox read-only|workspace-write` from Bash — the one entry point: without --choice Jev picks the row from the brief (falls back to the default, with the reason, when unsure), with `--choice <id>` it takes yours; it logs the pick, shows the run in the statusline, and prints a JSON receipt. Several in the background for parallel work; `agent-router ls` / `agent-router stats`. This config enables no Claude row, so the Agent tool and the Workflow tool dispatch nothing; the dispatch hook denies both and prints this table.",
      ]),
  END,
].join("\n");

if (!argv.flags.write && !argv.flags.check) {
  console.log(block);
  process.exit(0);
}
const text = readFileSync(CLAUDE_MD, "utf8");
const b = text.indexOf(BEGIN);
const e = text.indexOf(END);
if (b < 0 || e < b)
  fatal(`markers ${BEGIN} … ${END} not found in ${CLAUDE_MD}`);
const next = text.slice(0, b) + block + text.slice(e + END.length);
if (argv.flags.check) {
  if (next === text) {
    console.log("render-roster: up to date");
    process.exit(0);
  }
  console.log(
    "render-roster: DRIFT — the roster table in agents/claude/CLAUDE.md is not a fresh render of agents/models/dispatch-roster.toml; run `mise run roster:render`",
  );
  process.exit(1);
}
if (next !== text) writeFileSync(CLAUDE_MD, next);
console.log(
  next === text
    ? "render-roster: up to date"
    : "render-roster: wrote agents/claude/CLAUDE.md",
);
