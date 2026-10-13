import { cli } from "cleye";
import { readLifecycle } from "./lifecycle-log.ts";
import { stateDir } from "./state.ts";

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`agx: unknown option '--${flag}'\n`);
    process.exit(2);
  }
};

/** A read-only JSONL/text filter. Cursor belongs to this invocation, never the state directory. */
export async function eventsCommand(args: string[]): Promise<void> {
  const parsed = cli(
    {
      name: "agx events",
      parameters: [],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      flags: {
        mine: {
          type: Boolean,
          description: "Filter to the current dispatcher session",
        },
        follow: {
          type: Boolean,
          description: "Replay and follow appended events until interrupted",
        },
        json: { type: Boolean, description: "Print one JSON object per event" },
      },
    },
    undefined,
    args,
  );
  if (parsed._.length > 0) {
    process.stderr.write("agx events: unexpected operand\n");
    process.exitCode = 2;
    return;
  }
  const session = [
    process.env.AGX_DISPATCHER_SESSION,
    process.env.CLAUDE_CODE_SESSION_ID,
  ]
    .map((id) => id?.trim())
    .find((id) => id !== undefined && id !== "");
  let cursor = 0;
  const reported = new Set<string>();
  const print = (): number => {
    const read = readLifecycle(stateDir());
    for (const error of read.errors) {
      if (reported.has(error)) continue;
      process.stderr.write(`agx events: ${error}\n`);
      reported.add(error);
    }
    for (const event of read.events) {
      if (event.seq <= cursor) continue;
      cursor = event.seq;
      if (
        parsed.flags.mine === true &&
        (session === undefined || event.session_id !== session)
      )
        continue;
      process.stdout.write(
        parsed.flags.json === true
          ? `${JSON.stringify(event)}\n`
          : `${event.seq}\t${event.at}\t${event.run_id}\t${event.type}\n`,
      );
    }
    return read.errors.length;
  };
  do {
    const errors = print();
    if (parsed.flags.follow !== true) {
      process.exitCode = errors > 0 ? 1 : 0;
      return;
    }
    await Bun.sleep(250);
  } while (parsed.flags.follow);
}
