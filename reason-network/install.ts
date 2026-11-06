import { createHash } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const version = "v0.12.17";
const asset = `https://github.com/reason-machines/reason-network/releases/download/${version}/reason-network-x86_64-unknown-linux-musl.tar.gz`;
const assetSha256 =
  "2234527ff9330c78bff8581cc060bf1396e15d8091c27fb5acdb989010f5018f";
const binarySha256 =
  "b17efa53714f9991e77b592cb62bc09fdf7991e1f612a785ea22ed04ab653f0b";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main(): Promise<string | undefined> {
  if (process.platform !== "linux" || process.arch !== "x64") {
    return "reason-network bootstrap supports Linux x86_64 only";
  }
  const existing = Bun.which("reason-network");
  if (process.argv[2] === "check") {
    if (existing === null) return "reason-network is not on PATH";
    const child = Bun.spawn([existing, "--version"], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await child.exited) !== 0) return "reason-network --version failed";
    return undefined;
  }
  if (process.argv[2] !== "install") return "expected install or check";
  if (existing !== null) {
    console.log(`Already present: ${existing}`);
    return undefined;
  }
  const binDir = join(homedir(), ".local", "bin");
  if (!(process.env["PATH"] ?? "").split(":").includes(binDir)) {
    return `${binDir} is not on PATH`;
  }
  const response = await fetch(asset, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) return `asset download failed: HTTP ${response.status}`;
  const archive = new Uint8Array(await response.arrayBuffer());
  if (sha256(archive) !== assetSha256)
    return "asset sha256 mismatch; not extracting";
  console.log(`Verified asset sha256: ${assetSha256}`);
  const tar = Bun.spawn(["tar", "-xzOf", "-", "reason-network"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
  });
  const input = Promise.try(async () => {
    await tar.stdin.write(archive);
    await tar.stdin.end();
  });
  const [buffer] = await Promise.all([
    new Response(tar.stdout).arrayBuffer(),
    input,
  ]);
  const bytes = new Uint8Array(buffer);
  if ((await tar.exited) !== 0) return "asset extraction failed";
  if (sha256(bytes) !== binarySha256)
    return "binary sha256 mismatch; not installing";
  console.log(`Verified binary sha256: ${binarySha256}`);
  await mkdir(binDir, { recursive: true });
  const target = join(binDir, "reason-network");
  await using file = await open(target, "wx", 0o755);
  await file.writeFile(bytes);
  await file.chmod(0o755);
  console.log(`Installed ${target}`);
  return undefined;
}

await Promise.try(main).then(
  (error) => {
    if (error !== undefined) {
      console.error(`reason-network: ${error}`);
      process.exitCode = 1;
    }
  },
  (error: unknown) => {
    console.error(
      `reason-network: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  },
);
