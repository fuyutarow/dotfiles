// Fixture binary only: inspect SSH argv and return PowerShell protocol output.
import { appendFileSync } from "node:fs";
const args = Bun.argv.slice(2);
const command = args.at(-1) ?? "";
const encoded = /-EncodedCommand ([A-Za-z0-9+/=]+)$/u.exec(command)?.[1];
const log = process.env.HOST_STUB_LOG;
if (encoded === undefined || log === undefined) process.exit(99);
const script = Buffer.from(encoded, "base64").toString("utf16le");
appendFileSync(log, `${JSON.stringify(args)}\n${script}\n`);
const snapshot = [
  "c_free=4294967296",
  "c_total=99999999999",
  "swap=100|10|C:\\Temp\\old\\swap.vhdx",
  "swap=300|20|C:\\Temp\\live\\swap.vhdx",
  "lever=winget-cache|100|C:\\WinGet",
  "lever=user-temp|200|C:\\Temp",
  "lever=windows-temp|300|C:\\Windows\\Temp",
  "lever=delivery-optimization|400|C:\\DO",
  "lever=wer-dumps|500|C:\\WER",
  "lever=windows-update|?|C:\\Windows\\WinSxS",
  "lever=recycle-bin|600|C:\\$Recycle.Bin",
  "lever=hibernate-off|700|C:\\hiberfil.sys",
  "vhdx=800|Ubuntu|Running|C:\\WSL\\ext4.vhdx",
].join("\n");
const freeAfter = script.includes("dism.exe") ? 4294967296 : 4297064448;
const output = script.includes('"c_before=$before"')
  ? `c_before=4294967296\nc_after=${freeAfter}`
  : snapshot;
process.stdout.write(`${output}\n`);
