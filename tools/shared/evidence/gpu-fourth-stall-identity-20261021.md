# GPU fourth-stall identity receipt — 2026-10-21

## Scope and clock

- Collection time: 2026-10-21T05:44:49Z / 2026-10-21T14:44:49+0900.
- Target: reported PID 1370300 only. This receipt performed no GPU probe, signal,
  stop, restart, reset, or cleanup.
- `/proc/1370300` was absent at collection (`/proc/1370300/stat` unreadable).
  Therefore a current process identity and a >=3-second starttime comparison could
  not be obtained. No replacement PID was inspected or attributed to this target.

## Manifest handoff

- Verified caller GPU manifest:
  `/home/fuyu/.local/state/firedancer-admission/ktm-registry/test.resource.json:1`.
  Its JSON declares `schema: 1`, `job_id: ktm-registry-parity`,
  `device.kind: gpu`, and `device.gpu_id: 0`.
- Handoff written as exactly that absolute path, one line, to
  `/tmp/dotfiles-fourth-gpu-manifest-path.txt`.

## PID 1370300 classification

- **Classification: historical identity UNKNOWN; not classified as active owned
  work, leftover, leader, or TID under another TGID.** The PID was gone before
  this bounded pass, and the retained records below do not supply the required
  TGID/TID/starttime/cgroup/command binding.
- Historical positive evidence is limited to a reported stalled PID: each of
  `admission-2.log:2`, `admission-3.log:2`, `admission-4.log:2`, and
  `admission-5.log:2` records `pid=1370300`, `state=D`, and
  `wchan=dxgvmb_send_sync_msg`, with `observations=2` and
  `interval_ms>=3000`.
- `result.md:20-25` says the GPU workload was not launched and identifies the
  same PID only through `/proc/1370300/wchan`; `halfway.md:5` likewise preserves
  that wchan reference. These saved records do not establish PID ownership.

## Required identity fields

| Field | Result | Bound |
| --- | --- | --- |
| Timestamped PID observation | Saved, but individual log lines have no timestamp | collection time above; reported window is unverified here |
| TGID / TID | UNKNOWN | No saved record for PID 1370300 names either value. |
| `/proc/<pid>/stat` field 22 starttime | UNKNOWN | Target was absent; no saved field-22 value. `/proc/stat` was not used. |
| cgroup / systemd unit or scope | UNKNOWN | No saved cgroup or unit maps PID 1370300. |
| minimal command identity | UNKNOWN | No saved command token maps PID 1370300. |
| D-state placement | UNKNOWN as leader-vs-thread | Saved logs say only `pid=1370300 state=D`; no task/TGID evidence. |

## Non-transferable nearby evidence

- `test.log:2-5` binds **different** TGID 5278/TID 5279 to two resource scopes
  and a D-state dxg wait. It is not evidence that PID 1370300 inherited either
  scope, command, or identity.
- `result.md:28-31` identifies a separate CPU import helper PID 1488713 and its
  explicitly stopped scope. It is not evidence about PID 1370300.

## Bounded journal result

- `journalctl --user _PID=1370300 --since '2026-10-21 05:30:00 UTC' --until
  '2026-10-21 06:00:00 UTC' -n 10 --no-pager -o short-iso-precise` returned
  `-- No entries --`. It supplies no historical unit, cgroup, or command binding.

## Consequence

The retained data support only a historical report of a D-state dxg wait for
the numeric PID. They do not support naming that PID's workload, unit, cgroup,
TGID/TID role, lifecycle, or current activity. A future identity claim needs a
timestamped capture of those fields while the target PID exists, or an exact
historical cgroup/journal record that supplies them.
