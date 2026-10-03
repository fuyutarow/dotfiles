# Pixel 9a: LINE vibration without lock-screen notifications

The policy has two independent guards:

- `lock_screen_show_notifications=0` keeps ordinary app notifications off the lock screen,
  whether or not a notification Mode is active.
- A dedicated Android Mode named `カナモード` silences interruptions from other apps while
  the phone is in Vibrate mode. LINE's new-message and incoming-call channels must vibrate and
  bypass Do Not Disturb.

`mise run android:line` reapplies the ADB-writable settings and checks the whole effective policy.
It refuses to enable Vibrate mode until the Mode and channel checks pass. `mise run
android:line:check` only audits; it never changes the phone. Both tasks require one connected,
USB-debugging-authorized Pixel 9a running Android 17. Pass `-- --serial SERIAL` when more than one
device is attached.

## One-time Android setup

Android's standard ADB `cmd notification` can turn Do Not Disturb on or off but cannot create a
custom Mode or choose its allowed app channels. Set these in the phone's Settings UI:

1. Open **Settings → Modes → Create your own mode**. Name it `カナモード` and leave its
   automatic schedule off.
2. Under **Notification filters**, allow LINE as the only app (all its notification channels).
   Remove any other app from the priority/allowed-app list. Allow alarms and media, but disable
   calls, messages, conversations, repeat callers, reminders, events, and other priority exceptions.
   The **calls** exception is for phone contacts; LINE's own call channel is allowed through the
   app exception.
3. Under **Settings → Notifications → App notifications → LINE → Notification categories → Calls**
   (`着信`), turn **Show notifications** on, keep the category alerting, and turn **Vibration** on.
   Do not enable full-screen notifications just to obtain vibration; they are a separate visual
   behavior.
4. Keep filtered notifications in the notification list while unlocked if desired; block their
   full-screen, pop-up, ambient, and screen-wake effects on the lock screen.
5. Turn on `カナモード` with no expiry. Keep **lock-screen notifications** off in
   **Wallpaper & style → Lock screen → Notifications on lock screen**.
6. Run `mise run android:line`. The script verifies the Mode, every DND-bypassing channel, LINE's
   new-message and incoming-call vibration, the lock-screen setting, and the final ringer mode.

The official [Pixel Modes guide](https://support.google.com/pixelphone/answer/6111295?hl=ja)
describes Mode filters and their display options. The [lock-screen guide](https://support.google.com/pixelphone/answer/16520562?hl=ja)
describes the separate notification display switch.

If the Mode is turned off later, other apps may vibrate because the phone remains in Vibrate mode.
The lock-screen display switch remains off independently. Re-run `mise run android:line:check`
after changing Modes, updating Android, or rebooting. The script deliberately refuses a different
Android release until its `dumpsys` checks have been revalidated.

Android treats emergency/system alerts and some full-screen activities separately from ordinary
app notifications. The audit checks the LINE message and incoming-call channel settings, but a
real incoming LINE call is still required to confirm that LINE uses this channel and physically
vibrates while locked. Also send a non-LINE test notification to confirm it remains hidden and
silent on the lock screen.
