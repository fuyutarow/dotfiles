import { expect, test } from "bun:test";
import { inspectNotificationPolicy } from "./line-notifications";

const lineChannel =
  "        NotificationChannel{mId='jp.naver.line.android.notification.NewMessages', mImportance=4, mBypassDnd=true, mVibrationEnabled=true, mDeleted=false}";
const callChannel =
  "        NotificationChannel{mId='jp.naver.line.android.notification.VoIP.01.Incoming', mImportance=4, mBypassDnd=true, mVibrationEnabled=true, mDeleted=false}";

function dump(
  options: {
    categories?: string;
    extraChannel?: string;
    activeName?: string;
    incomingChannel?: string;
  } = {},
): string {
  const categories =
    options.categories ?? "PRIORITY_CATEGORY_ALARMS,PRIORITY_CATEGORY_MEDIA";
  const activeName = options.activeName ?? "カナモード";
  return `  Ranking Config:
      AppSettings: jp.naver.line.android (10386) importance=DEFAULT
${lineChannel}
${options.incomingChannel ?? callChannel}
      AppSettings: org.example.other (10387) importance=DEFAULT
${options.extraChannel ?? ""}
  Notification listeners:
  Zen Mode:
    mZenMode=ZEN_MODE_IMPORTANT_INTERRUPTIONS
    mConsolidatedPolicy=NotificationManager.Policy[priorityCategories=${categories},priorityCallSenders=none,allowPriorityChannels=true]
    ZenRule[id=line,state=STATE_FALSE,enabled=TRUE,conditionOverride=OVERRIDE_ACTIVATE,name=${activeName},zenMode=ZEN_MODE_IMPORTANT_INTERRUPTIONS]
  Zen Log:
`;
}

test("accepts only LINE vibration with lock-screen independent mode guards", () => {
  expect(inspectNotificationPolicy(dump(), "1").every((item) => item.ok)).toBe(
    true,
  );
});

test("rejects a second app that can bypass Do Not Disturb", () => {
  const findings = inspectNotificationPolicy(
    dump({
      extraChannel:
        "        NotificationChannel{mId='other', mBypassDnd=true, mVibrationEnabled=true, mDeleted=false}",
    }),
    "1",
  );
  expect(findings.find((item) => item.name === "apps")?.ok).toBe(false);
});

test("rejects a silent LINE incoming-call channel", () => {
  const findings = inspectNotificationPolicy(
    dump({
      incomingChannel: callChannel.replace(
        "mVibrationEnabled=true",
        "mVibrationEnabled=false",
      ),
    }),
    "1",
  );
  expect(findings.find((item) => item.name === "line-call-vibration")?.ok).toBe(
    false,
  );
});

test("rejects a non-alerting or non-priority LINE incoming-call channel", () => {
  const quiet = inspectNotificationPolicy(
    dump({
      incomingChannel: callChannel.replace("mImportance=4", "mImportance=2"),
    }),
    "1",
  );
  expect(quiet.find((item) => item.name === "line-call-vibration")?.ok).toBe(
    false,
  );

  const blocked = inspectNotificationPolicy(
    dump({
      incomingChannel: callChannel.replace(
        "mBypassDnd=true",
        "mBypassDnd=false",
      ),
    }),
    "1",
  );
  expect(blocked.find((item) => item.name === "apps")?.ok).toBe(false);
});

test("rejects inherited call exceptions and the wrong active mode", () => {
  const findings = inspectNotificationPolicy(
    dump({
      categories:
        "PRIORITY_CATEGORY_ALARMS,PRIORITY_CATEGORY_MEDIA,PRIORITY_CATEGORY_CALLS",
      activeName: "別のモード",
    }),
    "1",
  );
  expect(findings.find((item) => item.name === "exceptions")?.ok).toBe(false);
  expect(findings.find((item) => item.name === "mode")?.ok).toBe(false);
});

test("uses the foreground user's LINE channel when a work profile also has LINE", () => {
  const workProfileChannel =
    "        NotificationChannel{mId='jp.naver.line.android.notification.NewMessages', mBypassDnd=false, mVibrationEnabled=true, mDeleted=false}";
  const withWorkProfile = dump().replace(
    "  Notification listeners:",
    `      AppSettings: jp.naver.line.android (1010386) importance=DEFAULT\n${workProfileChannel}\n  Notification listeners:`,
  );
  expect(
    inspectNotificationPolicy(withWorkProfile, "1", 0).every((item) => item.ok),
  ).toBe(true);
});
