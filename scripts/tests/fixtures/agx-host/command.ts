// argv-forwarding: fixture for the released agx host command (no declaration schema/parser).
const args = process.argv.slice(2);
const home = process.env.HOME;
if (home === undefined) {
  process.stderr.write("fixture HOME missing\n");
  process.exit(2);
}
const log = Bun.file(`${home}/calls.jsonl`);
const previous = (await log.exists()) ? await log.text() : "";
await Bun.write(log, previous + JSON.stringify(args) + "\n");
const code = Number(await Bun.file(`${home}/${args[0]}.exit`).text());
if (args[0] === "check") {
  process.stdout.write(
    JSON.stringify({
      schema: 1,
      status: ["valid", "absent", "invalid"][code],
      reason: code === 2 ? "unreadable declaration" : null,
    }) + "\n",
  );
} else if (code === 0) {
  process.stdout.write("/owner/selected/declaration\n");
} else {
  process.stderr.write("declaration refused: existing entry\n");
}
process.exitCode = code;

export {};
