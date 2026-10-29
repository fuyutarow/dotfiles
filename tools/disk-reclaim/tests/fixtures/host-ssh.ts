// Fixture binary only: inspect SSH argv and return PowerShell protocol output.
import { appendFileSync } from "node:fs";
if (process.env["HOST_STUB_HANG_CONNECT"] === "1") await Bun.sleep(60_000);
const args = Bun.argv.slice(2);
const command = args.at(-1) ?? "";
const encoded = /-EncodedCommand ([A-Za-z0-9+/=]+)$/u.exec(command)?.[1];
const log = process.env["HOST_STUB_LOG"];
if (command === "exit 0" && log !== undefined) {
  appendFileSync(log, `${JSON.stringify(args)}\n`);
  process.exit(0);
}
if (encoded === undefined || log === undefined) process.exit(99);
const wrapper = Buffer.from(encoded, "base64").toString("utf16le");
const script = Buffer.from((await Bun.stdin.text()).trim(), "base64").toString(
  "utf8",
);
if (
  !wrapper.includes(".ps1'") ||
  !wrapper.includes("[Console]::In.ReadLine()") ||
  !wrapper.includes("[Convert]::FromBase64String") ||
  !wrapper.includes("Remove-Item -LiteralPath $scriptPath")
)
  process.exit(99);
appendFileSync(log, `${JSON.stringify(args)}\n${wrapper}\n${script}\n`);
process.stderr.write("disk-reclaim-step=lever npm-cache allocation scan\n");
if (process.env["HOST_STUB_HANG"] === "1") await Bun.sleep(60_000);
if (process.env["HOST_STUB_EMPTY"] === "1") process.exit(0);
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
  "lever=windows-update-download|600|C:\\Windows\\SoftwareDistribution\\Download",
  "lever=windows-update-components|700|C:\\Windows\\WinSxS",
  "lever=browser-crash-dumps|800|C:\\Users\\Test\\Crashpad",
  "lever=npm-cache|900|C:\\Users\\Test\\npm-cache",
  "lever=pip-cache|1000|C:\\Users\\Test\\pip-cache",
  "lever=uv-cache|1100|C:\\Users\\Test\\uv-cache",
  "lever=nuget-cache|1200|C:\\Users\\Test\\NuGet",
  "lever=cargo-cache|1300|C:\\Users\\Test\\Cargo",
  "lever=nvidia-download-cache|1400|C:\\NVIDIA",
  "lever=winget-download-cache|1500|C:\\Users\\Test\\WinGetCache",
  "lever=recycle-bin|600|C:\\$Recycle.Bin",
  "lever=hibernate-off|700|C:\\hiberfil.sys",
  "lever=claude-vm-bundles|1600|C:\\Users\\Test\\AppData\\Roaming\\Claude\\vm_bundles",
  "lever=pagefile-size|1700|C:\\pagefile.sys",
  "lever=vss-shadow-storage|14800000000|C:\\System Volume Information",
  "vhdx=800|Ubuntu|Running|C:\\WSL\\ext4.vhdx",
].join("\n");
const freeAfter = script.includes("dism.exe") ? 4294967296 : 4297064448;
const output = script.includes('"c_before=$before"')
  ? `c_before=4294967296\nc_after=${freeAfter}`
  : snapshot;
process.stdout.write(`${output}\n`);
