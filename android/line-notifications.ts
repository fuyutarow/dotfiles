// Reapply the ADB-writable part of the Pixel 9a LINE vibration policy, then audit the
// effective Android state. The custom Mode and its app exceptions must be created in
// Settings: Android's `cmd notification` can toggle DND but cannot define that Mode.
// Consumer: a human running `mise run android:line` or `android:line:check`.
// Verdicts: PASS/FAIL lines; exit 0 = policy holds, 1 = policy drift, 2 = tool failure.

import { cli } from "cleye";
import {
  err,
  fromAsyncThrowable,
  ok as resultOk,
  Result,
  type Result as ResultType,
} from "neverthrow";

const LINE_PACKAGE = "jp.naver.line.android";
const MESSAGE_CHANNEL = `${LINE_PACKAGE}.notification.NewMessages`;
const INCOMING_CALL_CHANNEL = `${LINE_PACKAGE}.notification.VoIP.01.Incoming`;
const MODE_NAME = "カナモード";
const EXPECTED_MODEL = "Pixel 9a";
const EXPECTED_ANDROID = "17";

let cliError: string | undefined;

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    cliError = `Unknown option '--${flag}'`;
  }
}

type Probe = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

async function run(
  command: string[],
  timeoutMs = 15_000,
): Promise<ResultType<Probe, Error>> {
  return fromAsyncThrowable(async () => {
    const signal = AbortSignal.timeout(timeoutMs);
    const proc = Bun.spawn(command, {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      signal,
      env: { ...process.env },
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (stdout.length > 16_000_000) {
      return err(
        new Error(`${command[0]} output exceeded the safe inspection limit`),
      );
    }
    return resultOk({
      code,
      stdout,
      stderr: stderr.slice(0, 2_000),
      timedOut: signal.aborted,
    });
  })()
    .mapErr((error: unknown) => new Error(String(error)))
    .andThen((value) => value);
}

async function adb(
  args: string[],
  serial?: string,
): Promise<ResultType<string, Error>> {
  const command = [
    "adb",
    ...(serial !== undefined && serial !== "" ? ["-s", serial] : []),
    ...args,
  ];
  const outcome = await run(command);
  if (outcome.isErr()) return err(outcome.error);
  const result = outcome.value;
  if (result.timedOut) return err(new Error(`adb ${args[0]} timed out`));
  if (result.code !== 0) {
    return err(new Error(`adb ${args[0]} failed: ${result.stderr.trim()}`));
  }
  return resultOk(result.stdout);
}

async function connectedDevice(
  requestedSerial?: string,
): Promise<ResultType<string, Error>> {
  const result = await adb(["devices"]);
  if (result.isErr()) return err(result.error);
  const output = result.value;
  const devices = output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/u))
    .filter((parts) => parts.length >= 2 && parts[1] === "device")
    .map((parts) => parts[0])
    .flatMap((serial) => (serial === undefined ? [] : [serial]));
  if (requestedSerial !== undefined && requestedSerial !== "") {
    if (!devices.includes(requestedSerial)) {
      return err(
        new Error("requested Android device is not connected and authorized"),
      );
    }
    return resultOk(requestedSerial);
  }
  if (devices.length !== 1) {
    return err(
      new Error(
        `expected exactly one authorized Android device; found ${devices.length}`,
      ),
    );
  }
  const serial = devices[0];
  if (serial === undefined)
    return err(new Error("Android device serial is missing"));
  return resultOk(serial);
}

export type PolicyFinding = { name: string; ok: boolean; detail: string };

function isActiveMode(line: string): boolean {
  return (
    line.includes("state=STATE_TRUE") ||
    line.includes("conditionOverride=OVERRIDE_ACTIVATE")
  );
}

function finding(name: string, ok: boolean, detail: string): PolicyFinding {
  return { name, ok, detail };
}

export function inspectNotificationPolicy(
  dump: string,
  zenMode: string,
  currentUser = 0,
): PolicyFinding[] {
  const zenSection = dump.split("  Zen Mode:")[1]?.split("  Zen Log:")[0] ?? "";
  const rankingSection =
    dump.split("  Ranking Config:")[1]?.split("  Notification listeners:")[0] ??
    "";
  const policy = zenSection.match(
    /mConsolidatedPolicy=NotificationManager\.Policy\[([^\n]+)\]/u,
  )?.[1];
  const categories =
    policy
      ?.match(/priorityCategories=(.*?),priorityCallSenders=/u)?.[1]
      ?.split(",")
      .filter(Boolean) ?? [];
  const allowedCategories = new Set([
    "PRIORITY_CATEGORY_ALARMS",
    "PRIORITY_CATEGORY_MEDIA",
  ]);
  const categoriesSafe =
    categories.length === allowedCategories.size &&
    categories.every((category) => allowedCategories.has(category));
  const modeLines = zenSection
    .split("\n")
    .filter((line) => line.includes("ZenRule["));
  // Custom manual Modes use OVERRIDE_ACTIVATE even when the condition's raw
  // state remains STATE_FALSE. The Settings UI then shows "OFF にする".
  const selectedModeActive = modeLines.some(
    (line) => line.includes(`name=${MODE_NAME},`) && isActiveMode(line),
  );
  const otherActiveModes = modeLines.filter(
    (line) => isActiveMode(line) && !line.includes(`name=${MODE_NAME},`),
  );

  let currentPackage: string | undefined;
  let packageUser: number | undefined;
  let lineMessageVibrates = false;
  let lineMessageBypasses = false;
  let lineCallVibrates = false;
  let lineCallBypasses = false;
  const bypassingPackages = new Set<string>();
  for (const line of rankingSection.split("\n")) {
    const app = line.match(/^\s*AppSettings: (\S+) \((\d+)\)/u);
    if (app !== null) {
      currentPackage = app[1];
      packageUser = Math.floor(Number(app[2]) / 100_000);
    }
    if (
      !line.includes("NotificationChannel{") ||
      line.includes("mDeleted=true")
    ) {
      continue;
    }
    const channelId = line.match(/mId='([^']+)'/u)?.[1];
    if (
      currentPackage === LINE_PACKAGE &&
      packageUser === currentUser &&
      channelId === MESSAGE_CHANNEL
    ) {
      lineMessageVibrates = line.includes("mVibrationEnabled=true");
      lineMessageBypasses = line.includes("mBypassDnd=true");
    }
    if (
      currentPackage === LINE_PACKAGE &&
      packageUser === currentUser &&
      channelId === INCOMING_CALL_CHANNEL
    ) {
      const importance = Number(line.match(/mImportance=(\d+)/u)?.[1]);
      lineCallVibrates =
        line.includes("mVibrationEnabled=true") && importance >= 3;
      lineCallBypasses = line.includes("mBypassDnd=true");
    }
    if (
      line.includes("mBypassDnd=true") &&
      currentPackage !== undefined &&
      currentPackage !== ""
    ) {
      bypassingPackages.add(currentPackage);
    }
  }
  const onlyLineBypasses =
    bypassingPackages.size === 1 && bypassingPackages.has(LINE_PACKAGE);

  return [
    finding(
      "mode",
      zenMode.trim() === "1" &&
        zenSection.includes("mZenMode=ZEN_MODE_IMPORTANT_INTERRUPTIONS") &&
        selectedModeActive &&
        otherActiveModes.length === 0,
      `active Mode must be '${MODE_NAME}' alone`,
    ),
    finding(
      "exceptions",
      categoriesSafe && policy?.includes("allowPriorityChannels=true") === true,
      "only alarms/media and priority channels may interrupt",
    ),
    finding(
      "apps",
      onlyLineBypasses && lineMessageBypasses && lineCallBypasses,
      "LINE messages and calls must be the only app's DND-bypassing channels",
    ),
    finding(
      "line-vibration",
      lineMessageVibrates,
      "LINE new-message channel must have vibration enabled",
    ),
    finding(
      "line-call-vibration",
      lineCallVibrates,
      "LINE incoming-call channel must be alerting with vibration enabled",
    ),
  ];
}

function ringerMode(audioDump: string): string | undefined {
  return audioDump.match(/Ringer mode:\s*\n- mode \(internal\) = (\w+)/u)?.[1];
}

async function inspect(
  serial: string,
): Promise<Result<PolicyFinding[], Error>> {
  const [model, android, user, lockscreen, zen, notifications, audio] =
    await Promise.all([
      adb(["shell", "getprop", "ro.product.model"], serial),
      adb(["shell", "getprop", "ro.build.version.release"], serial),
      adb(["shell", "am", "get-current-user"], serial),
      adb(
        [
          "shell",
          "settings",
          "get",
          "secure",
          "lock_screen_show_notifications",
        ],
        serial,
      ),
      adb(["shell", "settings", "get", "global", "zen_mode"], serial),
      adb(["shell", "dumpsys", "notification"], serial),
      adb(["shell", "dumpsys", "audio"], serial),
    ]);
  const combined = Result.combine([
    model,
    android,
    user,
    lockscreen,
    zen,
    notifications,
    audio,
  ]);
  if (combined.isErr()) return err(combined.error);
  const [
    modelText,
    androidText,
    userText,
    lockscreenText,
    zenText,
    notificationsText,
    audioText,
  ] = combined.value;
  const currentUser = Number(userText.trim());
  if (!Number.isSafeInteger(currentUser) || currentUser < 0) {
    return err(
      new Error(`unexpected Android current user: ${userText.trim()}`),
    );
  }
  return resultOk([
    finding(
      "device",
      modelText.trim() === EXPECTED_MODEL &&
        androidText.trim() === EXPECTED_ANDROID,
      `expected ${EXPECTED_MODEL} with Android ${EXPECTED_ANDROID}; found ${modelText.trim()} with Android ${androidText.trim()}`,
    ),
    finding(
      "lockscreen",
      lockscreenText.trim() === "0",
      "lock-screen notification display must be off",
    ),
    ...inspectNotificationPolicy(notificationsText, zenText, currentUser),
    finding(
      "ringer",
      ringerMode(audioText) === "VIBRATE",
      `ringer mode must be VIBRATE; found ${ringerMode(audioText) ?? "unknown"}`,
    ),
  ]);
}

async function assertTarget(serial: string): Promise<ResultType<void, Error>> {
  const [model, android] = await Promise.all([
    adb(["shell", "getprop", "ro.product.model"], serial),
    adb(["shell", "getprop", "ro.build.version.release"], serial),
  ]);
  if (model.isErr()) return err(model.error);
  if (android.isErr()) return err(android.error);
  if (
    model.value.trim() !== EXPECTED_MODEL ||
    android.value.trim() !== EXPECTED_ANDROID
  ) {
    return err(
      new Error(
        `refusing to change ${model.value.trim()} with Android ${android.value.trim()}; expected ${EXPECTED_MODEL} with Android ${EXPECTED_ANDROID}`,
      ),
    );
  }
  return resultOk(undefined);
}

function report(findings: PolicyFinding[]): number {
  for (const item of findings) {
    process.stdout.write(
      `${item.ok ? "PASS" : "FAIL"} ${item.name}: ${item.detail}\n`,
    );
  }
  return findings.every((item) => item.ok) ? 0 : 1;
}

async function applyPolicy(serial: string): Promise<ResultType<void, Error>> {
  const target = await assertTarget(serial);
  if (target.isErr()) return err(target.error);
  const hidden = await adb(
    [
      "shell",
      "settings",
      "put",
      "secure",
      "lock_screen_show_notifications",
      "0",
    ],
    serial,
  );
  if (hidden.isErr()) return err(hidden.error);
  const beforeResult = await inspect(serial);
  if (beforeResult.isErr()) return err(beforeResult.error);
  const before = beforeResult.value;
  const guardFailed =
    report(before.filter((item) => item.name !== "ringer")) !== 0;
  const ringer = before.find((item) => item.name === "ringer");
  if (guardFailed && ringer?.ok === true) {
    const restored = await adb(
      ["shell", "cmd", "audio", "set-ringer-mode", "SILENT"],
      serial,
    );
    if (restored.isErr()) return err(restored.error);
    process.stdout.write(
      "SAFE: restored SILENT ringer mode after failed guards.\n",
    );
  }
  if (guardFailed) {
    process.stdout.write(
      "NEXT: configure and activate the dedicated Mode as documented in android/README.md; VIBRATE was not enabled.\n",
    );
    process.exitCode = 1;
    return resultOk(undefined);
  }
  const vibrated = await adb(
    ["shell", "cmd", "audio", "set-ringer-mode", "VIBRATE"],
    serial,
  );
  if (vibrated.isErr()) return err(vibrated.error);
  const afterResult = await inspect(serial);
  if (afterResult.isErr()) return err(afterResult.error);
  if (report(afterResult.value) !== 0) {
    const restored = await adb(
      ["shell", "cmd", "audio", "set-ringer-mode", "SILENT"],
      serial,
    );
    if (restored.isErr()) return err(restored.error);
    process.stdout.write(
      "SAFE: restored SILENT ringer mode after failed verification.\n",
    );
    process.exitCode = 1;
    return resultOk(undefined);
  }
  process.exitCode = 0;
  return resultOk(undefined);
}

async function main(): Promise<ResultType<void, Error>> {
  const parsed = cli(
    {
      name: "line-notifications.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Audit or safely apply the Pixel 9a LINE-only vibration policy.",
      },
      flags: {
        apply: { type: Boolean, default: false },
        serial: { type: String },
      },
    },
    undefined,
    process.argv.slice(2),
  );
  if (cliError !== undefined) return err(new Error(cliError));
  if (parsed._.length > 0)
    return err(new Error("unexpected positional argument"));
  if (Bun.which("adb") === null)
    return err(new Error("adb is missing; install Android Platform Tools"));
  const connected = await connectedDevice(parsed.flags.serial);
  if (connected.isErr()) return err(connected.error);
  const serial = connected.value;
  if (parsed.flags.apply) return applyPolicy(serial);
  const inspected = await inspect(serial);
  if (inspected.isErr()) return err(inspected.error);
  process.exitCode = report(inspected.value);
  return resultOk(undefined);
}

if (import.meta.main) {
  const result = await fromAsyncThrowable(main)();
  if (result.isErr()) {
    process.stderr.write(`FATAL: ${String(result.error)}\n`);
    process.exitCode = 2;
  } else if (result.value.isErr()) {
    process.stderr.write(`FATAL: ${String(result.value.error)}\n`);
    process.exitCode = 2;
  }
}
