// systemd oneshot consumer: read recorded stalls, notify the desktop, persist a receipt.
// The service serializes invocations; this module never queries the GPU driver.
import { mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { release } from "node:os";
import { err, ok, type Result } from "neverthrow";
import { attempt, errorMessage } from "./attempt.ts";
import { GpuStateSchema, gpuStatePath, MAX_BYTES } from "./gpu-samples.ts";
import { jsonOf, z } from "./zod.ts";

const StallState = GpuStateSchema.extend({
  unresponsiveSince: z.number().int().nonnegative().nullable().optional(),
});
const Receipt = z.object({ unresponsiveSince: z.number().int().nonnegative() });

export function pendingGpuStall(
  state: unknown,
  receipt: unknown,
): number | undefined {
  const parsed = StallState.safeParse(state);
  if (!parsed.success) return undefined;
  const since = parsed.data.unresponsiveSince ?? undefined;
  const previous = Receipt.safeParse(receipt);
  return previous.success && previous.data.unresponsiveSince === since
    ? undefined
    : since;
}

/** WSL must use the host desktop even when a Linux notification daemon exists. */
export function gpuStallNotificationCommand(
  since: number,
  isWsl: boolean,
  which: (name: string) => string | null = Bun.which,
): Result<string[], Error> {
  const title = "GPU stall";
  const body = `GPU unresponsive since ${Temporal.Instant.fromEpochMilliseconds(since).toString()}. Run gpu-sampler --check`;
  if (!isWsl) {
    const binary = which("notify-send");
    if (binary === null)
      return err(
        new Error("notify-send is required for GPU stall notifications"),
      );
    return ok([binary, "--urgency=critical", title, body]);
  }
  const binary =
    which("powershell.exe") ??
    which("/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe");
  if (binary === null)
    return err(
      new Error("Windows powershell.exe is required for WSL GPU stall toasts"),
    );
  // Fixed title and validated timestamp keep XML and PowerShell interpolation inert.
  const script = `$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>${title}</text><text>${body}</text></binding></visual></toast>')
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Microsoft.WindowsPowerShell').Show($toast)`;
  return ok([
    binary,
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    Buffer.from(script, "utf16le").toString("base64"),
  ]);
}

async function readOptional(
  path: string,
): Promise<Result<string | undefined, Error>> {
  const read = await attempt(async () => {
    const file = Bun.file(path);
    if (file.size > MAX_BYTES)
      return err(new Error(`${path}: state exceeds ${MAX_BYTES} bytes`));
    return ok(await file.text());
  });
  if (read.ok) return read.value;
  if (z.object({ code: z.literal("ENOENT") }).safeParse(read.error).success)
    return ok(undefined);
  return err(new Error(errorMessage(read.error)));
}

type NotifyOptions = {
  statePath?: string;
  receiptPath?: string;
  send?: (since: number) => Promise<Result<void, Error>>;
};

export async function notifyGpuStall(
  options: NotifyOptions = {},
): Promise<Result<boolean, Error>> {
  const result = await attempt(() => notify(options));
  return result.ok ? result.value : err(new Error(errorMessage(result.error)));
}

async function notify(options: NotifyOptions): Promise<Result<boolean, Error>> {
  const statePath = options.statePath ?? gpuStatePath();
  const receiptPath =
    options.receiptPath ?? join(dirname(statePath), "gpu-stall-notified.json");
  const [text, receiptText] = await Promise.all([
    readOptional(statePath),
    readOptional(receiptPath),
  ]);
  if (text.isErr()) return err(text.error);
  if (receiptText.isErr()) return err(receiptText.error);
  if (text.value === undefined) return ok(false);
  const state = jsonOf(StallState).safeParse(text.value);
  if (!state.success)
    return err(new Error(`${statePath}: invalid GPU owner state`));
  const receipt =
    receiptText.value === undefined
      ? { success: true, data: undefined }
      : jsonOf(Receipt).safeParse(receiptText.value);
  if (!receipt.success)
    return err(new Error(`${receiptPath}: invalid notification receipt`));
  const since = pendingGpuStall(state.data, receipt.data);
  if (since === undefined) return ok(false);
  // Prepare the receipt directory before sending to avoid delivery on a known write failure.
  await mkdir(dirname(receiptPath), { recursive: true });
  const sent = await (options.send ?? sendDesktopNotification)(since);
  if (sent.isErr()) return err(sent.error);
  const temp = `${receiptPath}.${process.pid}.tmp`;
  await Bun.write(temp, `${JSON.stringify({ unresponsiveSince: since })}\n`);
  await rename(temp, receiptPath);
  return ok(true);
}

async function sendDesktopNotification(
  since: number,
): Promise<Result<void, Error>> {
  const command = gpuStallNotificationCommand(
    since,
    /microsoft/iu.test(release()),
  );
  if (command.isErr()) return err(command.error);
  const child = Bun.spawn({
    cmd: command.value,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "inherit",
    timeout: 15_000,
  });
  const exit = await child.exited;
  if (exit !== 0)
    return err(
      new Error(
        `GPU desktop notification failed (exit ${exit}); receipt not recorded`,
      ),
    );
  return ok(undefined);
}

if (import.meta.main) {
  const result = await notifyGpuStall();
  if (result.isErr()) {
    process.stderr.write(`FATAL: ${result.error.message}\n`);
    process.exitCode = 2;
  } else {
    process.stdout.write(
      `GPU stall notification: ${result.value ? "sent" : "no new stall"}\n`,
    );
  }
}
