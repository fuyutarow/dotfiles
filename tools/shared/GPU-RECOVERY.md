# WSL GPU stall recovery

Use this when GPU consumers stop responding, `gpu-owner.json` records
`unresponsiveSince`, or a GPU process is stuck in `D` state in the WSL graphics
driver. The sampler is the only component that runs `nvidia-smi`; do not run it
manually during recovery. Never signal a stuck GPU process.

The sampler also records read-only dxg wait observations beside its state in
`gpu-dxg-episodes.jsonl` (normally `$XDG_STATE_HOME/gpu-dxg-episodes.jsonl`, or
`~/.local/state/gpu-dxg-episodes.jsonl`). Each `scan` row records whether the
`nvidia-smi` probe succeeded and whether the bounded `/proc` scan completed;
an incomplete scan is not evidence that no dxg wait was present. `episode`
rows include TGID, TID, starttime, comm, cgroup/unit, first and last observed
times, observed duration, and open/closed state. Reused TIDs with a different
starttime begin a separate episode. The log retains at most seven days and
4096 rows / 2 MiB.

`agent-resource-run` scans leaders and nonleader threads host-wide for readable
dxg wait channels, including `dxgvmb_send_sync_msg`, and confirms these D-state
observations after at least three seconds. An unavailable wait channel
(unreadable, missing, empty, or `0`) blocks admission only when the process is a
sampled GPU holder or a readable `/proc/<pid>/fd` link targets `/dev/dxg`.
Nonleader threads inherit this evidence from their thread group. A previously
observed dxg wait also remains refusal evidence if its channel becomes
unavailable during confirmation. Process names and root ownership do not
establish a GPU tie: an unrelated D-state systemd-journald with an unreadable
channel does not block admission. Unreadable descriptor inventories alone do
not establish a tie. Sampled PIDs are conservative refusal evidence and do not
prove local ownership or release; the existing holder verification still applies.
The sampler recovery check in step 5 has its own checks described there.

Run the steps in order. The process and state inspections are read-only.

1. **Find the blocked GPU task and its wrapper.** In the affected WSL distro, run:

   ```sh
   printf '%s\n' "$WSL_DISTRO_NAME"
   ps -eo pid,ppid,stat,wchan:30,comm
   ```

   Find a task whose `STAT` contains `D` and whose `WCHAN` contains `dxg` (for
   example, `dxgvmb_send_sync_msg`). Also note any `Z` task. Starting with each
   affected PID, follow the `PPID` column upward in the same listing until the
   owning `bun` / `agent-resource-run` wrapper is identified. A `Z` GPU task is
   not removed by signalling it; its parent must reap it.

2. **Stop the wrapper's systemd scope.** Ask the user manager which unit owns
   that wrapper PID:

   ```sh
   systemctl --user status <wrapper-pid> --no-pager
   ```

   Copy the exact scope or service unit name shown there, then stop that unit:

   ```sh
   systemctl --user stop <exact-unit-name>
   ```

   Do not substitute the Julia PID for the wrapper PID, and do not use `kill`,
   `pkill`, or `killall`. Confirm the unit is no longer active and inspect the
   process table again:

   ```sh
   systemctl --user is-active <exact-unit-name>
   ps -eo pid,ppid,stat,wchan:30,comm
   ```

   `inactive` or `failed` means the unit has stopped. The wrapper's exit lets its
   parent reap a zombie. If the affected PID is still shown as `Z`, record that
   fact; do not signal the zombie.

3. **Give the WSL driver two minutes to release the blocked task.** Start the
   two-minute wait after the wrapper unit has stopped:

   ```sh
   sleep 120
   ps -eo pid,ppid,stat,wchan:30,comm
   ```

   If no task is both in `D` state and waiting in a `dxg` channel, do not shut
   down WSL; continue to step 5. If any such task remains after these two
   minutes, a WSL host shutdown is required because the guest wrapper has
   already stopped and the driver wait did not clear.

4. **Reset WSL from Windows PowerShell only when step 3 still shows a dxg
   `D`-state task.** Use the exact distro name printed in step 1. From a
   separate Windows PowerShell session, confirm it is running, shut down WSL,
   and start that same distro:

   ```powershell
   wsl.exe --list --running
   wsl.exe --shutdown
   wsl.exe --distribution <recorded-distro-name> --exec /bin/true
   ```

   `wsl --shutdown` stops every running distro. The final command starts the
   affected distro; reconnect to it after that command exits. Do not run the
   shutdown command from the affected WSL shell; that shell will be terminated.

5. **Restart the sampler after the affected distro is reachable.** In that
   distro, make sure its timer is enabled, restart it, and request one immediate
   sample:

   ```sh
   systemctl --user daemon-reload
   systemctl --user enable gpu-sampler.timer
   systemctl --user restart gpu-sampler.timer
   systemctl --user start gpu-sampler.service
   ```

   The timer owns future samples; do not start `nvidia-smi` directly. Run the
   read-only recovery check before restarting ccc or treating GPU consumers as
   recovered:

   ```sh
   gpu-sampler --check
   ```

   Exit 1 prints each remaining failure: a dxg `D`-state process, an unknown
   wait channel on a `D`-state task, a GPU-holding zombie, an unsuccessful
   latest probe, a set `unresponsiveSince`, or an inventory/state record that
   could not be verified. If it fails, keep GPU
   consumers paused and escalate with the printed conditions and the sampler
   journal:

   ```sh
   journalctl --user -u gpu-sampler.service --no-pager -n 80
   ```

   If the check exits 0, restart ccc through the managed task so embedding work
   resumes under its systemd unit:

   ```sh
   mise run wsl:ccc-daemon
   ```
