> Project identifiers in this historical record have been generalized; consumer paths below are illustrative, not exact retrieval locations.

# GPU-CHILD-REAP-CPU — 2026-10-21

CPU-only exit and await tests passed for Bun 1.4.3 on this WSL2 host.
Both the direct child and the extracted canonical shell/exec lifecycle returned
known status 37 and were reaped within the specified deadlines. Brief zombie
states occurred and disappeared. Persistent historical Julia zombies were **not
reproduced**; their cause remains unreconstructed.

Reader: Q3 owner and coordinator; assumes PID, exec, wait, and /proc knowledge.
Internal English report. Proposition: GPU-CHILD-REAP-CPU.

## Acceptance and results

Advance criteria: status 37, no timeout/signal termination, and disappearance
of all tracked child /proc entries within the experiment envelope. The extracted
wrapper child had a 3-second deadline, each driver child a 4-second deadline,
and each foreground invocation an outer 20-second deadline. A 50 ms post-await
window checked persistence. No deadline fired. Sampling targeted 1 ms.
Counts mean one direct and one extracted case per invocation, three invocations
including instrumentation refinements: one focused experiment, not three
independent historical reproductions.

- Direct: **PASS**; expected/actual exit 37/37; driver 1446773 → child 1446778,
  with observed PPID 1446773. Spawn-to-await: 146.100099 ms.
  First absent at driver-local 166.448299 ms.
- Extracted: **PASS**; expected/actual exit 37/37 at both awaits;
  driver 1446773 → Bun wrapper 1446834 → sh/exec CPU leaf 1446842.
  Leaf PPID 1446834. Shell and leaf retained PID 1446842 and start ticks 7878291.
  Driver spawn-to-await: 164.729099 ms. Wrapper-local await began at 17.692000 ms
  and completed at 159.491699 ms, an interval of 141.799699 ms.
  Leaf first absent at driver-local 381.505997 ms; wrapper at 382.717997 ms.
- Direct leaf Z: first/last sampled at 165.355199 ms; sampled span 0 ms;
  last-live to first-absent sampling window 2.354000 ms.
- Extracted leaf Z: first/last sampled at 378.959797/380.131397 ms;
  sampled span 1.171600 ms; live-to-absent sampling window 3.823000 ms.
- Extracted wrapper Z: first/last sampled at 381.392697 ms; sampled span 0 ms;
  live-to-absent sampling window 2.597400 ms.
- Direct/extracted maximum sampling gaps: 3.845000/1.507800 ms;
  sample counts 167/184. All tracked /proc entries were absent after await,
  at case completion, and at separate result validation.

Z means the kernel reported zombie state at a sample. Sampled spans and
surrounding live/absent windows estimate duration; they are not exact exit/wait
syscall timings. Timestamps follow each read and include instrumentation cost.
A single Z sample supplies no positive minimum duration. No syscall tracing was
performed. The observations distinguish transient reaping in these CPU cases
from the reported persistence, but cannot explain why historical JuliaZ persisted.
Successful CPU tests do not exonerate Bun or CUDA teardown and do not establish
any historical cause.

## Source and extraction provenance

Guidance was checked before reading consumer source: no AGENTS.md or CLAUDE.md
was present in the consumer launcher/checkout or its ancestors through /home.
A routed file query also returned NO_MATCH. Consumer .claude/settings.json was
read; it defines hooks and denies Git commands. Its .claude directory contains
hooks/schemas, without skills or commands directories. Dotfiles AGENTS.md,
CLAUDE.md, .claude/settings.json and the requested implementing-and-debugging,
writing-bun-scripts and writing-typescript skills were read. The Jujutsu and
prose-linting skills supported revision inspection and report review.

Consumer recorded revision, read with --ignore-working-copy:
`dc15f20cb0ea8ea40d839859b2292ac65549ab84`.
Dotfiles starting recorded revision:
`a553bd5495b6fccf1e9220aae812a1eeb0c73556`.
These are recorded revisions, not guarantees of working-copy equality.
Actual canonical_julia.ts SHA-256, unchanged before and after tests:
`db820797c8c171192a67cb025b162dd0c832a80ff3ffc14357c510e561099799`.
This matches the brief's prefix. Accepted report037d48e5 is supplied context;
its body and historical incident evidence were not independently inspected.

Source citations:
[canonical_julia.ts:23](/home/fuyu/Workspace/example-repo.ws/ws_khop5-run/launcher/canonical_julia.ts:23)
constructs unshare → sh → mount/cd/shift/exec;
[canonical_julia.ts:71](/home/fuyu/Workspace/example-repo.ws/ws_khop5-run/launcher/canonical_julia.ts:71)
spawns with inherited stdio/environment;
[canonical_julia.ts:76](/home/fuyu/Workspace/example-repo.ws/ws_khop5-run/launcher/canonical_julia.ts:76)
registers signal forwarding;
[canonical_julia.ts:80](/home/fuyu/Workspace/example-repo.ws/ws_khop5-run/launcher/canonical_julia.ts:80)
awaits child.exited and propagates status at line 82. The current source assigns
the immediate-child wait to Bun; it does not establish historical process state.
The canonical wrapper was read and hashed, never imported or executed.

Extraction preserves Bun spawn, inherited stdin/stdout/stderr and environment,
shell positional forwarding, cd/shift/exec, signal handler registration,
await child.exited, and status mapping. It substitutes an isolated Bun CPU child
that sleeps 120 ms and exits 37. The direct case uses inherited stdio and await
without the shell/wrapper layer.

Omitted: unshare -rm, user/mount namespaces, mount --bind, canonical path relocation,
canonical directory creation, workspace realpath, CLI parsing, Julia/mise runtime
selection, neverthrow entry handling, resource-run process-group ownership, and
actual Julia/native/GPU teardown. Scratch cd replaces canonical cd; one shift
replaces shift 2 because the mount target operand is removed. The original
unshare process is not reproduced; its exec/wait behavior is untested. Added
abort deadlines and logging bound observation. Signal handlers were registered
but not exercised. Inherited stdio terminates in foreground capture files,
not a terminal. No pipe backpressure experiment was performed.

No Julia, CUDA, NVML, nvidia-smi, GPU scope, service change, paid turn, message to
another session, production workload signal, or consumer write was used.
The historical RCA is unchanged. Only this dated report is a repository change.
Owned scratch: /tmp/gpu-child-reap-cpu.IgHuof. No package version, release changeset,
changelog entry, configuration registration, or permanent fixture is appropriate
for this report-only experiment. Full probe and raw output are retained below.

## Exact commands and observed results

All commands ran in the foreground. Revision commands used the respective cwd.

```sh
bun --version
# exit 0: 1.4.3
uname -sr
# exit 0: Linux 6.18.54.1-microsoft-standard-WSL2
jj --ignore-working-copy log -r @ --no-graph -T 'commit_id ++ "\n"'
# exit 0 in dotfiles: a553bd5495b6fccf1e9220aae812a1eeb0c73556
# exit 0 in consumer: dc15f20cb0ea8ea40d839859b2292ac65549ab84
sha256sum /home/fuyu/Workspace/example-repo.ws/ws_khop5-run/launcher/canonical_julia.ts
# exit 0: db820797c8c171192a67cb025b162dd0c832a80ff3ffc14357c510e561099799
mktemp -d /tmp/gpu-child-reap-cpu.XXXXXX
# exit 0: /tmp/gpu-child-reap-cpu.IgHuof
# Initial invocation:
timeout --signal=KILL 20s bun /tmp/gpu-child-reap-cpu.IgHuof/probe.ts > /tmp/gpu-child-reap-cpu.IgHuof/stdout.txt 2> /tmp/gpu-child-reap-cpu.IgHuof/stderr.txt
# Second and final invocations used this command:
timeout --signal=KILL 20s bun /tmp/gpu-child-reap-cpu.IgHuof/probe.ts > /tmp/gpu-child-reap-cpu.IgHuof/final-stdout.txt 2> /tmp/gpu-child-reap-cpu.IgHuof/final-stderr.txt
# Captured $? immediately after each: probe_exit=0, all stderr empty.
bun /home/fuyu/.agents/skills/writing-bun-scripts/scripts/script-check.ts /tmp/gpu-child-reap-cpu.IgHuof/probe.ts /tmp/gpu-child-reap-cpu.IgHuof/leaf.ts /tmp/gpu-child-reap-cpu.IgHuof/wrapper.ts
# exit 0: floor: FAIL=0 WARN=0 (files=3) — structure only; BG1-BG4 judgment is not covered
```

The first run revealed differing Bun hrtime origins across processes. Its t_ms
fields may only be compared within one PID. Run 2 added shared /proc/uptime
(10 ms printed resolution) and renamed observed_ppid to avoid overwriting the
observer's PPID. Run 3 retained those corrections and added summaries using
every sample, including repeats, to estimate Z duration. All three invocations
returned status 37 at both layers without persistence. Preliminary scripts
differ only by those disclosed instrumentation refinements; their code hashes
were not captured. Final source and all raw stdout follow. State-transition
logging preserves sampled changes, not transitions missed between samples.

The first report-generation attempt failed with a Bun stdin template-literal
syntax error before writing the report. Its chained test -s therefore exited 1
and rumdl did not run. Literal heredocs corrected report generation. This was a
report-writing failure, not an experiment failure; final checks appear below.

## Final isolated probe source

The three files were created using literal heredocs, and refined with Bun file
reads/writes in owned scratch. No third-party dependencies or argv interface.
PROBE_ROLE is set by local entry files, not by the driver. t_ms is process-local
monotonic time; uptime_ms is shared kernel uptime. Raw /proc stat includes
PID, PPID, state, start ticks, and encoded exit status. Inline source preserves
reproducibility if scratch is later cleaned.

Final probe.ts SHA-256:
`66e09484131e648fec4cdd35d706c61d9d276089a0a0b53290c647ac420e798a`.
Leaf entry SHA-256:
`822adb521e45562ccf5dc3aa25fd78dc7d8200c9b3bdd6dbea6037f0455dcc32`.
Wrapper entry SHA-256:
`1f0febe18a90c865c7a853ea4b8c534f177c79bc6ffe47fde14c0a7076db8583`.

### probe.ts

```typescript
// Consumer: agent; bounded isolated CPU lifecycle probe, no argv interface.
import { appendFileSync, readFileSync, existsSync } from "node:fs";
const dir = import.meta.dir;
const log = `${dir}/events.jsonl`;
const now = () => Number(process.hrtime.bigint()) / 1e6;
function emit(event: Record<string, unknown>) {
  const uptime_ms = Number(readFileSync("/proc/uptime", "utf8").split(" ")[0]) * 1000;
  const line = JSON.stringify({ t_ms: now(), uptime_ms, pid: process.pid, ppid: process.ppid, ...event });
  appendFileSync(log, `${line}\n`);
  process.stdout.write(`${line}\n`);
}
async function leaf() {
  emit({ event: "leaf_start", mode: process.env.PROBE_MODE });
  await Bun.sleep(120);
  emit({ event: "leaf_before_exit", expected: 37 });
  process.exit(37);
}
async function wrapper() {
  emit({ event: "wrapper_start" });
  const signal = AbortSignal.timeout(3000);
  const child = Bun.spawn(["/bin/sh", "-c", 'cd "$1" && shift && exec "$@"', "sh", dir, process.execPath, `${dir}/leaf.ts`], {
    stdio: ["inherit", "inherit", "inherit"], env: process.env, signal, killSignal: "SIGKILL",
  });
  emit({ event: "wrapper_spawn", child_pid: child.pid });
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"] as const)
    process.on(sig, () => child.kill(sig));
  emit({ event: "wrapper_await_begin", child_pid: child.pid });
  const code = await child.exited;
  emit({ event: "wrapper_await_end", child_pid: child.pid, code, signalCode: child.signalCode, timeout: signal.aborted });
  const signals: Record<string, number> = { SIGHUP: 1, SIGINT: 2, SIGKILL: 9, SIGTERM: 15 };
  process.exit(child.signalCode === null ? code : 128 + (signals[child.signalCode] ?? 0));
}
function stat(pid: number) {
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, "utf8").trim();
    const fields = raw.slice(raw.lastIndexOf(")") + 2).split(" ");
    return { state: fields[0], observed_ppid: Number(fields[1]), start_ticks: fields[19], raw };
  } catch (e) {
    if (e !== null && typeof e === "object" && "code" in e && e.code === "ENOENT") return undefined;
    throw e;
  }
}
async function run(mode: string) {
  emit({ event: "case_start", mode });
  const signal = AbortSignal.timeout(4000);
  const child = Bun.spawn([process.execPath, `${dir}/${mode === "direct" ? "leaf" : "wrapper"}.ts`], {
    stdio: ["inherit", "inherit", "inherit"], env: { ...process.env, PROBE_MODE: mode }, signal, killSignal: "SIGKILL",
  });
  emit({ event: "driver_spawn", mode, child_pid: child.pid });
  const tracked = new Map<number, string | undefined>([[child.pid, undefined]]);
  let maxGap = 0;
  let last = now();
  let samples = 0;
  const observations = new Map<number, { t_ms: number; state: string }[]>();
  let done = false;
  function sample() {
    const t = now(); maxGap = Math.max(maxGap, t - last); last = t; samples++;
    if (mode === "extracted") {
      try {
        const ids = readFileSync(`/proc/${child.pid}/task/${child.pid}/children`, "utf8").trim();
        for (const id of ids.split(/\s+/).filter(Boolean).map(Number)) if (!tracked.has(id)) tracked.set(id, undefined);
      } catch (e) {
        if (!(e !== null && typeof e === "object" && "code" in e && e.code === "ENOENT")) throw e;
      }
    }
    for (const [pid, previous] of tracked) {
      const info = stat(pid);
      const state = info?.state ?? "ABSENT";
      if (state !== previous) emit({ event: "proc_transition", mode, observed_pid: pid, ...info, state });
      const history = observations.get(pid) ?? [];
      history.push({ t_ms: now(), state }); observations.set(pid, history);
      tracked.set(pid, state);
    }
  }
  sample();
  const monitor = (async () => { while (!done) { await Bun.sleep(1); sample(); } })();
  emit({ event: "driver_await_begin", mode, child_pid: child.pid });
  const code = await child.exited;
  emit({ event: "driver_await_end", mode, child_pid: child.pid, code, signalCode: child.signalCode, timeout: signal.aborted });
  // Post-await sampling catches persistence beyond successful await.
  await Bun.sleep(50);
  done = true; await monitor; sample();
  for (const [pid, history] of observations) {
    const zs = history.filter(x => x.state === "Z");
    const firstZ = zs[0]?.t_ms;
    const lastZ = zs.at(-1)?.t_ms;
    const firstAbsent = history.find(x => x.state === "ABSENT")?.t_ms;
    const lastLive = history.filter(x => x.state !== "Z" && x.state !== "ABSENT").at(-1)?.t_ms;
    emit({ event: "proc_summary", mode, observed_pid: pid, last_live_ms: lastLive, first_z_ms: firstZ, last_z_ms: lastZ, first_absent_ms: firstAbsent, z_lower_ms: firstZ !== undefined && lastZ !== undefined ? lastZ - firstZ : undefined, z_upper_ms: firstAbsent !== undefined && lastLive !== undefined ? firstAbsent - lastLive : undefined });
  }
  const allAbsent = [...tracked].every(([pid]) => !existsSync(`/proc/${pid}`));
  const pass = code === 37 && child.signalCode === null && !signal.aborted && allAbsent;
  emit({ event: "case_result", mode, code, allAbsent, tracked_pids: [...tracked.keys()], samples, max_poll_gap_ms: maxGap, pass });
  return pass;
}
async function main() {
  if (process.env.PROBE_ROLE === "leaf") return leaf();
  if (process.env.PROBE_ROLE === "wrapper") return wrapper();
  const first = await run("direct");
  const second = await run("extracted");
  process.exitCode = first && second ? 0 : 1;
}
main().catch((e) => { process.stderr.write(`FATAL: ${e}\n`); process.exit(2); });
```

### leaf.ts

```typescript
process.env.PROBE_ROLE = "leaf";
await import("./probe.ts");
```

### wrapper.ts

```typescript
process.env.PROBE_ROLE = "wrapper";
await import("./probe.ts");
```

## Raw experiment output

Captured stdout in original order. All stderr files were empty. Run 2 output
is the matching duplicate event stream saved before clearing events.jsonl.
No error output is omitted.

### Initial instrumentation

```jsonl
{"t_ms":6.0227,"pid":1436612,"ppid":1436611,"event":"case_start","mode":"direct"}
{"t_ms":15.3451,"pid":1436612,"ppid":1436611,"event":"driver_spawn","mode":"direct","child_pid":1436620}
{"t_ms":15.6381,"pid":1436612,"ppid":1436612,"event":"proc_transition","mode":"direct","observed_pid":1436620,"state":"R","start_ticks":"7875351","raw":"1436620 (bun) R 1436612 1436611 1436581 0 -1 4194304 22 0 0 0 0 0 0 0 20 0 1 0 7875351 72224768 99 18446744073709551615 15636736 74940880 140728052396320 0 0 0 0 0 0 0 0 0 17 5 0 0 0 0 0 74944976 75071280 633475072 140728052402271 140728052402362 140728052402362 140728052408260 0"}
{"t_ms":15.7815,"pid":1436612,"ppid":1436611,"event":"driver_await_begin","mode":"direct","child_pid":1436620}
{"t_ms":7.3062,"pid":1436620,"ppid":1436612,"event":"leaf_start","mode":"direct"}
{"t_ms":39.7255,"pid":1436612,"ppid":1436612,"event":"proc_transition","mode":"direct","observed_pid":1436620,"state":"S","start_ticks":"7875351","raw":"1436620 (bun) S 1436612 1436611 1436581 0 -1 4194304 2020 0 0 0 2 0 0 0 20 0 13 0 7875351 6723743744 10452 18446744073709551615 15636736 74940880 140728052396320 0 0 0 0 16781312 536872184 0 0 0 17 4 0 0 0 0 0 74944976 75071280 633475072 140728052402271 140728052402362 140728052402362 140728052408260 0"}
{"t_ms":138.056098,"pid":1436620,"ppid":1436612,"event":"leaf_before_exit","expected":37}
{"t_ms":157.849498,"pid":1436612,"ppid":1436612,"event":"proc_transition","mode":"direct","observed_pid":1436620,"state":"R","start_ticks":"7875351","raw":"1436620 (bun) R 1436612 1436611 1436581 0 -1 4194304 2022 0 0 0 2 0 0 0 20 0 13 0 7875351 6723743744 10451 18446744073709551615 15636736 74940880 140728052396320 0 0 0 0 16781312 536872184 0 0 0 17 5 0 0 0 0 0 74944976 75071280 633475072 140728052402271 140728052402362 140728052402362 140728052408260 0"}
{"t_ms":159.106298,"pid":1436612,"ppid":1436612,"event":"proc_transition","mode":"direct","observed_pid":1436620,"state":"Z","start_ticks":"7875351","raw":"1436620 (bun) Z 1436612 1436611 1436581 0 -1 4227084 2022 0 0 0 2 0 0 0 20 0 2 0 7875351 0 0 18446744073709551615 0 0 0 0 0 0 0 16781312 536872184 0 0 0 17 5 0 0 0 0 0 0 0 0 0 0 0 0 9472"}
{"t_ms":159.530598,"pid":1436612,"ppid":1436611,"event":"driver_await_end","mode":"direct","child_pid":1436620,"code":37,"signalCode":null,"timeout":false}
{"t_ms":160.338898,"pid":1436612,"ppid":1436611,"event":"proc_transition","mode":"direct","observed_pid":1436620,"state":"ABSENT"}
{"t_ms":210.381197,"pid":1436612,"ppid":1436611,"event":"case_result","mode":"direct","code":37,"allAbsent":true,"tracked_pids":[1436620],"samples":164,"max_poll_gap_ms":3.5541999999999945,"pass":true}
{"t_ms":210.460997,"pid":1436612,"ppid":1436611,"event":"case_start","mode":"extracted"}
{"t_ms":210.868797,"pid":1436612,"ppid":1436611,"event":"driver_spawn","mode":"extracted","child_pid":1436710}
{"t_ms":211.151897,"pid":1436612,"ppid":1436612,"event":"proc_transition","mode":"extracted","observed_pid":1436710,"state":"R","start_ticks":"7875370","raw":"1436710 (bun) R 1436612 1436611 1436581 0 -1 4194304 21 0 0 0 0 0 0 0 20 0 1 0 7875370 72200192 71 18446744073709551615 15636736 74940880 140734362484288 0 0 0 0 0 0 0 0 0 17 4 0 0 0 0 0 74944976 75071280 600485888 140734362486873 140734362486967 140734362486967 140734362492868 0"}
{"t_ms":211.193697,"pid":1436612,"ppid":1436611,"event":"driver_await_begin","mode":"extracted","child_pid":1436710}
{"t_ms":7.1951,"pid":1436710,"ppid":1436612,"event":"wrapper_start"}
{"t_ms":17.236399,"pid":1436710,"ppid":1436612,"event":"wrapper_spawn","child_pid":1436718}
{"t_ms":17.322899,"pid":1436710,"ppid":1436612,"event":"wrapper_await_begin","child_pid":1436718}
{"t_ms":231.463396,"pid":1436612,"ppid":1436710,"event":"proc_transition","mode":"extracted","observed_pid":1436718,"state":"R","start_ticks":"7875372","raw":"1436718 (sh) R 1436710 1436611 1436581 0 -1 4194304 21 0 0 0 0 0 0 0 20 0 1 0 7875372 581632 67 18446744073709551615 96214717636608 96214717722285 140735726038144 0 0 0 0 0 0 0 0 0 17 6 0 0 0 0 0 96214717746640 96214717751840 96215283556352 140735726045226 140735726045392 140735726045392 140735726051312 0"}
{"t_ms":235.332496,"pid":1436612,"ppid":1436612,"event":"proc_transition","mode":"extracted","observed_pid":1436710,"state":"S","start_ticks":"7875370","raw":"1436710 (bun) S 1436612 1436611 1436581 0 -1 4194304 2061 0 0 0 1 1 0 0 20 0 14 0 7875370 6724272128 10580 18446744073709551615 15636736 74940880 140734362484288 0 0 0 0 16781312 536888571 0 0 0 17 9 0 0 0 0 0 74944976 75071280 600485888 140734362486873 140734362486967 140734362486967 140734362492868 0"}
{"t_ms":239.061796,"pid":1436612,"ppid":1436710,"event":"proc_transition","mode":"extracted","observed_pid":1436718,"state":"S","start_ticks":"7875372","raw":"1436718 (bun) S 1436710 1436611 1436581 0 -1 4194304 1216 0 0 0 0 0 0 0 20 0 4 0 7875372 6651879424 8379 18446744073709551615 15636736 74940880 140734882987216 0 0 0 0 16781312 536872184 0 0 0 17 6 0 0 0 0 0 74944976 75071280 702980096 140734882990167 140734882990258 140734882990258 140734882996164 0"}
{"t_ms":240.458896,"pid":1436612,"ppid":1436710,"event":"proc_transition","mode":"extracted","observed_pid":1436718,"state":"R","start_ticks":"7875372","raw":"1436718 (bun) R 1436710 1436611 1436581 0 -1 4194304 1335 0 0 0 0 0 0 0 20 0 4 0 7875372 6718988288 8708 18446744073709551615 15636736 74940880 140734882987216 0 0 0 0 16781312 536872184 0 0 0 17 6 0 0 0 0 0 74944976 75071280 702980096 140734882990167 140734882990258 140734882990258 140734882996164 0"}
{"t_ms":6.8698,"pid":1436718,"ppid":1436710,"event":"leaf_start","mode":"extracted"}
{"t_ms":258.142096,"pid":1436612,"ppid":1436710,"event":"proc_transition","mode":"extracted","observed_pid":1436718,"state":"S","start_ticks":"7875372","raw":"1436718 (bun) S 1436710 1436611 1436581 0 -1 4194304 2079 0 0 0 2 0 0 0 20 0 13 0 7875372 6723743744 10404 18446744073709551615 15636736 74940880 140734882987216 0 0 0 0 16781312 536872184 0 0 0 17 6 0 0 0 0 0 74944976 75071280 702980096 140734882990167 140734882990258 140734882990258 140734882996164 0"}
{"t_ms":358.933794,"pid":1436612,"ppid":1436710,"event":"proc_transition","mode":"extracted","observed_pid":1436718,"state":"R","start_ticks":"7875372","raw":"1436718 (bun) R 1436710 1436611 1436581 0 -1 4194304 2079 0 0 0 2 0 0 0 20 0 13 0 7875372 6723743744 10404 18446744073709551615 15636736 74940880 140734882987216 0 0 0 0 16781312 536872184 0 0 0 17 6 0 0 0 0 0 74944976 75071280 702980096 140734882990167 140734882990258 140734882990258 140734882996164 0"}
{"t_ms":360.156894,"pid":1436612,"ppid":1436710,"event":"proc_transition","mode":"extracted","observed_pid":1436718,"state":"S","start_ticks":"7875372","raw":"1436718 (bun) S 1436710 1436611 1436581 0 -1 4194304 2079 0 0 0 2 0 0 0 20 0 13 0 7875372 6723743744 10404 18446744073709551615 15636736 74940880 140734882987216 0 0 0 0 16781312 536872184 0 0 0 17 6 0 0 0 0 0 74944976 75071280 702980096 140734882990167 140734882990258 140734882990258 140734882996164 0"}
{"t_ms":376.455594,"pid":1436612,"ppid":1436710,"event":"proc_transition","mode":"extracted","observed_pid":1436718,"state":"R","start_ticks":"7875372","raw":"1436718 (bun) R 1436710 1436611 1436581 0 -1 4194304 2079 0 0 0 2 0 0 0 20 0 13 0 7875372 6723743744 10404 18446744073709551615 15636736 74940880 140734882987216 0 0 0 0 16781312 536872184 0 0 0 17 6 0 0 0 0 0 74944976 75071280 702980096 140734882990167 140734882990258 140734882990258 140734882996164 0"}
{"t_ms":140.930798,"pid":1436718,"ppid":1436710,"event":"leaf_before_exit","expected":37}
{"t_ms":377.729894,"pid":1436612,"ppid":1436710,"event":"proc_transition","mode":"extracted","observed_pid":1436718,"state":"Z","start_ticks":"7875372","raw":"1436718 (bun) Z 1436710 1436611 1436581 0 -1 4227084 2081 0 0 0 2 0 0 0 20 0 2 0 7875372 0 0 18446744073709551615 0 0 0 0 0 0 0 16781312 536872184 0 0 0 17 6 0 0 0 0 0 0 0 0 0 0 0 0 9472"}
{"t_ms":164.347797,"pid":1436710,"ppid":1436612,"event":"wrapper_await_end","child_pid":1436718,"code":37,"signalCode":null,"timeout":false}
{"t_ms":378.910594,"pid":1436612,"ppid":1436612,"event":"proc_transition","mode":"extracted","observed_pid":1436710,"state":"Z","start_ticks":"7875370","raw":"1436710 (bun) Z 1436612 1436611 1436581 0 -1 4227084 2062 2081 0 0 1 1 2 0 20 0 2 0 7875370 0 0 18446744073709551615 0 0 0 0 0 0 0 16781312 536888571 0 0 0 17 9 0 0 0 0 0 0 0 0 0 0 0 0 9472"}
{"t_ms":378.992994,"pid":1436612,"ppid":1436611,"event":"proc_transition","mode":"extracted","observed_pid":1436718,"state":"ABSENT"}
{"t_ms":380.335594,"pid":1436612,"ppid":1436611,"event":"driver_await_end","mode":"extracted","child_pid":1436710,"code":37,"signalCode":null,"timeout":false}
{"t_ms":381.373394,"pid":1436612,"ppid":1436611,"event":"proc_transition","mode":"extracted","observed_pid":1436710,"state":"ABSENT"}
{"t_ms":430.584693,"pid":1436612,"ppid":1436611,"event":"case_result","mode":"extracted","code":37,"allAbsent":true,"tracked_pids":[1436710,1436718],"samples":180,"max_poll_gap_ms":3.5029990000000453,"pass":true}
```

### Shared clock correction

```jsonl
{"t_ms":9.827,"uptime_ms":78763950,"pid":1439483,"ppid":1439479,"event":"case_start","mode":"direct"}
{"t_ms":23.8879,"uptime_ms":78763970,"pid":1439483,"ppid":1439479,"event":"driver_spawn","mode":"direct","child_pid":1439498}
{"t_ms":24.6043,"uptime_ms":78763970,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"direct","observed_pid":1439498,"state":"R","observed_ppid":1439483,"start_ticks":"7876397","raw":"1439498 (bun) R 1439483 1439479 1439451 0 -1 4194304 51 0 0 0 0 0 0 0 20 0 1 0 7876397 85295104 246 18446744073709551615 15636736 74940880 140734849500496 0 0 0 0 0 0 0 0 0 17 0 0 0 0 0 0 74944976 75071280 1060216832 140734849509471 140734849509562 140734849509562 140734849515460 0"}
{"t_ms":24.8977,"uptime_ms":78763970,"pid":1439483,"ppid":1439479,"event":"driver_await_begin","mode":"direct","child_pid":1439498}
{"t_ms":10.2109,"uptime_ms":78763980,"pid":1439498,"ppid":1439483,"event":"leaf_start","mode":"direct"}
{"t_ms":54.3239,"uptime_ms":78764000,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"direct","observed_pid":1439498,"state":"S","observed_ppid":1439483,"start_ticks":"7876397","raw":"1439498 (bun) S 1439483 1439479 1439451 0 -1 4194304 2059 0 0 0 2 1 0 0 20 0 14 0 7876397 6724272128 10549 18446744073709551615 15636736 74940880 140734849500496 0 0 0 0 16781312 536872184 0 0 0 17 0 0 0 0 0 0 74944976 75071280 1060216832 140734849509471 140734849509562 140734849509562 140734849515460 0"}
{"t_ms":55.5564,"uptime_ms":78764000,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"direct","observed_pid":1439498,"state":"R","observed_ppid":1439483,"start_ticks":"7876397","raw":"1439498 (bun) R 1439483 1439479 1439451 0 -1 4194304 2070 0 0 0 2 1 0 0 20 0 14 0 7876397 6724272128 10581 18446744073709551615 15636736 74940880 140734849500496 0 0 0 0 16781312 536872184 0 0 0 17 11 0 0 0 0 0 74944976 75071280 1060216832 140734849509471 140734849509562 140734849509562 140734849515460 0"}
{"t_ms":56.8047,"uptime_ms":78764000,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"direct","observed_pid":1439498,"state":"S","observed_ppid":1439483,"start_ticks":"7876397","raw":"1439498 (bun) S 1439483 1439479 1439451 0 -1 4194304 2071 0 0 0 2 1 0 0 20 0 14 0 7876397 6724272128 10581 18446744073709551615 15636736 74940880 140734849500496 0 0 0 0 16781312 536872184 0 0 0 17 11 0 0 0 0 0 74944976 75071280 1060216832 140734849509471 140734849509562 140734849509562 140734849515460 0"}
{"t_ms":144.099899,"uptime_ms":78764120,"pid":1439498,"ppid":1439483,"event":"leaf_before_exit","expected":37}
{"t_ms":172.761299,"uptime_ms":78764120,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"direct","observed_pid":1439498,"state":"Z","observed_ppid":1439483,"start_ticks":"7876397","raw":"1439498 (bun) Z 1439483 1439479 1439451 0 -1 4227084 2073 0 0 0 2 1 0 0 20 0 2 0 7876397 0 0 18446744073709551615 0 0 0 0 0 0 0 16781312 536872184 0 0 0 17 8 0 0 0 0 0 0 0 0 0 0 0 0 9472"}
{"t_ms":173.954499,"uptime_ms":78764120,"pid":1439483,"ppid":1439479,"event":"driver_await_end","mode":"direct","child_pid":1439498,"code":37,"signalCode":null,"timeout":false}
{"t_ms":174.073199,"uptime_ms":78764120,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"direct","observed_pid":1439498,"state":"ABSENT"}
{"t_ms":224.555599,"uptime_ms":78764170,"pid":1439483,"ppid":1439479,"event":"case_result","mode":"direct","code":37,"allAbsent":true,"tracked_pids":[1439498],"samples":164,"max_poll_gap_ms":5.427,"pass":true}
{"t_ms":224.630899,"uptime_ms":78764170,"pid":1439483,"ppid":1439479,"event":"case_start","mode":"extracted"}
{"t_ms":225.000099,"uptime_ms":78764170,"pid":1439483,"ppid":1439479,"event":"driver_spawn","mode":"extracted","child_pid":1439591}
{"t_ms":225.281999,"uptime_ms":78764170,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"extracted","observed_pid":1439591,"state":"R","observed_ppid":1439483,"start_ticks":"7876417","raw":"1439591 (bun) R 1439483 1439479 1439451 0 -1 4194304 21 0 0 0 0 0 0 0 20 0 1 0 7876417 72200192 71 18446744073709551615 15636736 74940880 140732368584752 0 0 0 0 0 0 0 0 0 17 2 0 0 0 0 0 74944976 75071280 193679360 140732368586841 140732368586935 140732368586935 140732368592836 0"}
{"t_ms":225.332099,"uptime_ms":78764170,"pid":1439483,"ppid":1439479,"event":"driver_await_begin","mode":"extracted","child_pid":1439591}
{"t_ms":231.249299,"uptime_ms":78764180,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"extracted","observed_pid":1439591,"state":"S","observed_ppid":1439483,"start_ticks":"7876417","raw":"1439591 (bun) S 1439483 1439479 1439451 0 -1 4194304 1198 0 0 0 0 0 0 0 20 0 4 0 7876417 6718988288 8491 18446744073709551615 15636736 74940880 140732368584752 0 0 0 0 16781312 536872184 0 0 0 17 2 0 0 0 0 0 74944976 75071280 193679360 140732368586841 140732368586935 140732368586935 140732368592836 0"}
{"t_ms":232.516799,"uptime_ms":78764180,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"extracted","observed_pid":1439591,"state":"R","observed_ppid":1439483,"start_ticks":"7876417","raw":"1439591 (bun) R 1439483 1439479 1439451 0 -1 4194304 1283 0 0 0 0 0 0 0 20 0 4 0 7876417 6718988288 8788 18446744073709551615 15636736 74940880 140732368584752 0 0 0 0 16781312 536872184 0 0 0 17 2 0 0 0 0 0 74944976 75071280 193679360 140732368586841 140732368586935 140732368586935 140732368592836 0"}
{"t_ms":6.6949,"uptime_ms":78764180,"pid":1439591,"ppid":1439483,"event":"wrapper_start"}
{"t_ms":15.89,"uptime_ms":78764190,"pid":1439591,"ppid":1439483,"event":"wrapper_spawn","child_pid":1439599}
{"t_ms":15.9654,"uptime_ms":78764190,"pid":1439591,"ppid":1439483,"event":"wrapper_await_begin","child_pid":1439599}
{"t_ms":244.710899,"uptime_ms":78764190,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"extracted","observed_pid":1439599,"state":"R","observed_ppid":1439591,"start_ticks":"7876419","raw":"1439599 (bun) R 1439591 1439479 1439451 0 -1 4194304 90 0 0 0 0 0 0 0 20 0 1 0 7876419 72200192 74 18446744073709551615 15636736 74940880 140725728848704 0 0 0 0 0 0 0 0 0 17 3 0 0 0 0 0 74944976 75071280 844771328 140725728856151 140725728856242 140725728856242 140725728862148 0"}
{"t_ms":246.056299,"uptime_ms":78764190,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"extracted","observed_pid":1439591,"state":"S","observed_ppid":1439483,"start_ticks":"7876417","raw":"1439591 (bun) S 1439483 1439479 1439451 0 -1 4194304 2034 0 0 0 1 0 0 0 20 0 13 0 7876417 6723743744 10676 18446744073709551615 15636736 74940880 140732368584752 0 0 0 0 16781312 536888571 0 0 0 17 2 0 0 0 0 0 74944976 75071280 193679360 140732368586841 140732368586935 140732368586935 140732368592836 0"}
{"t_ms":6.9061,"uptime_ms":78764200,"pid":1439599,"ppid":1439591,"event":"leaf_start","mode":"extracted"}
{"t_ms":267.609199,"uptime_ms":78764210,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"extracted","observed_pid":1439599,"state":"S","observed_ppid":1439591,"start_ticks":"7876419","raw":"1439599 (bun) S 1439591 1439479 1439451 0 -1 4194304 2108 0 0 0 0 1 0 0 20 0 14 0 7876419 6724272128 10499 18446744073709551615 15636736 74940880 140725728848704 0 0 0 0 16781312 536872184 0 0 0 17 3 0 0 0 0 0 74944976 75071280 844771328 140725728856151 140725728856242 140725728856242 140725728862148 0"}
{"t_ms":346.246898,"uptime_ms":78764290,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"extracted","observed_pid":1439591,"state":"R","observed_ppid":1439483,"start_ticks":"7876417","raw":"1439591 (bun) R 1439483 1439479 1439451 0 -1 4194304 2034 0 0 0 2 0 0 0 20 0 13 0 7876417 6723743744 10676 18446744073709551615 15636736 74940880 140732368584752 0 0 0 0 16781312 536888571 0 0 0 17 2 0 0 0 0 0 74944976 75071280 193679360 140732368586841 140732368586935 140732368586935 140732368592836 0"}
{"t_ms":347.583698,"uptime_ms":78764290,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"extracted","observed_pid":1439591,"state":"S","observed_ppid":1439483,"start_ticks":"7876417","raw":"1439591 (bun) S 1439483 1439479 1439451 0 -1 4194304 2034 0 0 0 2 0 0 0 20 0 13 0 7876417 6723743744 10641 18446744073709551615 15636736 74940880 140732368584752 0 0 0 0 16781312 536888571 0 0 0 17 2 0 0 0 0 0 74944976 75071280 193679360 140732368586841 140732368586935 140732368586935 140732368592836 0"}
{"t_ms":136.259099,"uptime_ms":78764330,"pid":1439599,"ppid":1439591,"event":"leaf_before_exit","expected":37}
{"t_ms":385.003198,"uptime_ms":78764330,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"extracted","observed_pid":1439599,"state":"Z","observed_ppid":1439591,"start_ticks":"7876419","raw":"1439599 (bun) Z 1439591 1439479 1439451 0 -1 4227084 2110 0 0 0 1 2 0 0 20 0 2 0 7876419 0 0 18446744073709551615 0 0 0 0 0 0 0 16781312 536872184 0 0 0 17 3 0 0 0 0 0 0 0 0 0 0 0 0 9472"}
{"t_ms":157.857799,"uptime_ms":78764330,"pid":1439591,"ppid":1439483,"event":"wrapper_await_end","child_pid":1439599,"code":37,"signalCode":null,"timeout":false}
{"t_ms":386.193198,"uptime_ms":78764330,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"extracted","observed_pid":1439591,"state":"Z","observed_ppid":1439483,"start_ticks":"7876417","raw":"1439591 (bun) Z 1439483 1439479 1439451 0 -1 4227084 2035 2110 0 0 2 0 1 2 20 0 2 0 7876417 0 0 18446744073709551615 0 0 0 0 0 0 0 16781312 536888571 0 0 0 17 2 0 0 0 0 0 0 0 0 0 0 0 0 9472"}
{"t_ms":386.309298,"uptime_ms":78764330,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"extracted","observed_pid":1439599,"state":"ABSENT"}
{"t_ms":387.419898,"uptime_ms":78764330,"pid":1439483,"ppid":1439479,"event":"driver_await_end","mode":"extracted","child_pid":1439591,"code":37,"signalCode":null,"timeout":false}
{"t_ms":387.593498,"uptime_ms":78764330,"pid":1439483,"ppid":1439479,"event":"proc_transition","mode":"extracted","observed_pid":1439591,"state":"ABSENT"}
{"t_ms":438.306898,"uptime_ms":78764380,"pid":1439483,"ppid":1439479,"event":"case_result","mode":"extracted","code":37,"allAbsent":true,"tracked_pids":[1439591,1439599],"samples":176,"max_poll_gap_ms":1.884900000000016,"pass":true}
```

### Final measurement

```jsonl
{"t_ms":9.6975,"uptime_ms":78782680,"pid":1446773,"ppid":1446772,"event":"case_start","mode":"direct"}
{"t_ms":20.2279,"uptime_ms":78782690,"pid":1446773,"ppid":1446772,"event":"driver_spawn","mode":"direct","child_pid":1446778}
{"t_ms":20.8165,"uptime_ms":78782690,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"direct","observed_pid":1446778,"state":"R","observed_ppid":1446773,"start_ticks":"7878269","raw":"1446778 (bun) R 1446773 1446772 1446754 0 -1 4194304 48 0 0 0 0 0 0 0 20 0 1 0 7878269 82534400 246 18446744073709551615 15636736 74940880 140721414174800 0 0 0 0 0 0 0 0 0 17 10 0 0 0 0 0 74944976 75071280 1141600256 140721414183007 140721414183098 140721414183098 140721414188996 0"}
{"t_ms":21.008,"uptime_ms":78782690,"pid":1446773,"ppid":1446772,"event":"driver_await_begin","mode":"direct","child_pid":1446778}
{"t_ms":7.5962,"uptime_ms":78782700,"pid":1446778,"ppid":1446773,"event":"leaf_start","mode":"direct"}
{"t_ms":47.260299,"uptime_ms":78782710,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"direct","observed_pid":1446778,"state":"S","observed_ppid":1446773,"start_ticks":"7878269","raw":"1446778 (bun) S 1446773 1446772 1446754 0 -1 4194304 2012 0 0 0 1 1 0 0 20 0 13 0 7878269 6723743744 10532 18446744073709551615 15636736 74940880 140721414174800 0 0 0 0 16781312 536872184 0 0 0 17 11 0 0 0 0 0 74944976 75071280 1141600256 140721414183007 140721414183098 140721414183098 140721414188996 0"}
{"t_ms":164.045699,"uptime_ms":78782830,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"direct","observed_pid":1446778,"state":"R","observed_ppid":1446773,"start_ticks":"7878269","raw":"1446778 (bun) R 1446773 1446772 1446754 0 -1 4194304 2013 0 0 0 1 1 0 0 20 0 13 0 7878269 6723743744 10433 18446744073709551615 15636736 74940880 140721414174800 0 0 0 0 16781312 536872184 0 0 0 17 0 0 0 0 0 0 74944976 75071280 1141600256 140721414183007 140721414183098 140721414183098 140721414188996 0"}
{"t_ms":140.192699,"uptime_ms":78782830,"pid":1446778,"ppid":1446773,"event":"leaf_before_exit","expected":37}
{"t_ms":165.317299,"uptime_ms":78782830,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"direct","observed_pid":1446778,"state":"Z","observed_ppid":1446773,"start_ticks":"7878269","raw":"1446778 (bun) Z 1446773 1446772 1446754 0 -1 4227084 2014 0 0 0 1 1 0 0 20 0 2 0 7878269 0 0 18446744073709551615 0 0 0 0 0 0 0 16781312 536872184 0 0 0 17 0 0 0 0 0 0 0 0 0 0 0 0 0 9472"}
{"t_ms":166.327999,"uptime_ms":78782830,"pid":1446773,"ppid":1446772,"event":"driver_await_end","mode":"direct","child_pid":1446778,"code":37,"signalCode":null,"timeout":false}
{"t_ms":166.433899,"uptime_ms":78782830,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"direct","observed_pid":1446778,"state":"ABSENT"}
{"t_ms":217.137198,"uptime_ms":78782880,"pid":1446773,"ppid":1446772,"event":"proc_summary","mode":"direct","observed_pid":1446778,"last_live_ms":164.094299,"first_z_ms":165.355199,"last_z_ms":165.355199,"first_absent_ms":166.448299,"z_lower_ms":0,"z_upper_ms":2.353999999999985}
{"t_ms":217.426598,"uptime_ms":78782880,"pid":1446773,"ppid":1446772,"event":"case_result","mode":"direct","code":37,"allAbsent":true,"tracked_pids":[1446778],"samples":167,"max_poll_gap_ms":3.8450000000000024,"pass":true}
{"t_ms":217.474198,"uptime_ms":78782880,"pid":1446773,"ppid":1446772,"event":"case_start","mode":"extracted"}
{"t_ms":217.825598,"uptime_ms":78782890,"pid":1446773,"ppid":1446772,"event":"driver_spawn","mode":"extracted","child_pid":1446834}
{"t_ms":218.046298,"uptime_ms":78782890,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446834,"state":"R","observed_ppid":1446773,"start_ticks":"7878288","raw":"1446834 (bun) R 1446773 1446772 1446754 0 -1 4194304 21 0 0 0 0 0 0 0 20 0 1 0 7878288 72200192 73 18446744073709551615 15636736 74940880 140732489732752 0 0 0 0 0 0 0 0 0 17 8 0 0 0 0 0 74944976 75071280 1123909632 140732489738329 140732489738423 140732489738423 140732489744324 0"}
{"t_ms":218.094198,"uptime_ms":78782890,"pid":1446773,"ppid":1446772,"event":"driver_await_begin","mode":"extracted","child_pid":1446834}
{"t_ms":225.145898,"uptime_ms":78782890,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446834,"state":"S","observed_ppid":1446773,"start_ticks":"7878288","raw":"1446834 (bun) S 1446773 1446772 1446754 0 -1 4194304 1210 0 0 0 0 0 0 0 20 0 4 0 7878288 6718988288 8507 18446744073709551615 15636736 74940880 140732489732752 0 0 0 0 16781312 536872184 0 0 0 17 8 0 0 0 0 0 74944976 75071280 1123909632 140732489738329 140732489738423 140732489738423 140732489744324 0"}
{"t_ms":226.383198,"uptime_ms":78782890,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446834,"state":"R","observed_ppid":1446773,"start_ticks":"7878288","raw":"1446834 (bun) R 1446773 1446772 1446754 0 -1 4194304 1275 0 0 0 0 0 0 0 20 0 4 0 7878288 6718988288 8804 18446744073709551615 15636736 74940880 140732489732752 0 0 0 0 16781312 536872184 0 0 0 17 8 0 0 0 0 0 74944976 75071280 1123909632 140732489738329 140732489738423 140732489738423 140732489744324 0"}
{"t_ms":7.6131,"uptime_ms":78782900,"pid":1446834,"ppid":1446773,"event":"wrapper_start"}
{"t_ms":17.6036,"uptime_ms":78782910,"pid":1446834,"ppid":1446773,"event":"wrapper_spawn","child_pid":1446842}
{"t_ms":238.551398,"uptime_ms":78782910,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446842,"state":"R","observed_ppid":1446834,"start_ticks":"7878291","raw":"1446842 (sh) R 1446834 1446772 1446754 0 -1 4194304 13 0 0 0 0 0 0 0 20 0 1 0 7878291 573440 33 18446744073709551615 105284374937600 105284375023277 140725729748032 0 0 0 0 0 0 0 0 0 17 6 0 0 0 0 0 105284375047632 105284375052832 105284881502208 140725729749034 140725729749200 140725729749200 140725729755120 0"}
{"t_ms":17.692,"uptime_ms":78782910,"pid":1446834,"ppid":1446773,"event":"wrapper_await_begin","child_pid":1446842}
{"t_ms":241.101298,"uptime_ms":78782910,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446834,"state":"S","observed_ppid":1446773,"start_ticks":"7878288","raw":"1446834 (bun) S 1446773 1446772 1446754 0 -1 4194304 2086 0 0 0 1 1 0 0 20 0 14 0 7878288 6724272128 10692 18446744073709551615 15636736 74940880 140732489732752 0 0 0 0 16781312 536888571 0 0 0 17 10 0 0 0 0 0 74944976 75071280 1123909632 140732489738329 140732489738423 140732489738423 140732489744324 0"}
{"t_ms":242.362398,"uptime_ms":78782910,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446834,"state":"R","observed_ppid":1446773,"start_ticks":"7878288","raw":"1446834 (bun) R 1446773 1446772 1446754 0 -1 4194304 2087 0 0 0 1 1 0 0 20 0 14 0 7878288 6724272128 10692 18446744073709551615 15636736 74940880 140732489732752 0 0 0 0 16781312 536888571 0 0 0 17 10 0 0 0 0 0 74944976 75071280 1123909632 140732489738329 140732489738423 140732489738423 140732489744324 0"}
{"t_ms":243.660698,"uptime_ms":78782910,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446834,"state":"S","observed_ppid":1446773,"start_ticks":"7878288","raw":"1446834 (bun) S 1446773 1446772 1446754 0 -1 4194304 2088 0 0 0 1 1 0 0 20 0 14 0 7878288 6724272128 10692 18446744073709551615 15636736 74940880 140732489732752 0 0 0 0 16781312 536888571 0 0 0 17 10 0 0 0 0 0 74944976 75071280 1123909632 140732489738329 140732489738423 140732489738423 140732489744324 0"}
{"t_ms":6.6659,"uptime_ms":78782920,"pid":1446842,"ppid":1446834,"event":"leaf_start","mode":"extracted"}
{"t_ms":259.427298,"uptime_ms":78782930,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446842,"state":"S","observed_ppid":1446834,"start_ticks":"7878291","raw":"1446842 (bun) S 1446834 1446772 1446754 0 -1 4194304 2078 0 0 0 1 0 0 0 20 0 13 0 7878291 6723743744 10485 18446744073709551615 15636736 74940880 140731658001280 0 0 0 0 16781312 536872184 0 0 0 17 6 0 0 0 0 0 74944976 75071280 794013696 140731658004567 140731658004658 140731658004658 140731658010564 0"}
{"t_ms":342.571298,"uptime_ms":78783010,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446834,"state":"R","observed_ppid":1446773,"start_ticks":"7878288","raw":"1446834 (bun) R 1446773 1446772 1446754 0 -1 4194304 2088 0 0 0 1 1 0 0 20 0 14 0 7878288 6724272128 10692 18446744073709551615 15636736 74940880 140732489732752 0 0 0 0 16781312 536888571 0 0 0 17 4 0 0 0 0 0 74944976 75071280 1123909632 140732489738329 140732489738423 140732489738423 140732489744324 0"}
{"t_ms":343.833398,"uptime_ms":78783010,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446834,"state":"S","observed_ppid":1446773,"start_ticks":"7878288","raw":"1446834 (bun) S 1446773 1446772 1446754 0 -1 4194304 2088 0 0 0 1 1 0 0 20 0 14 0 7878288 6724272128 10659 18446744073709551615 15636736 74940880 140732489732752 0 0 0 0 16781312 536888571 0 0 0 17 4 0 0 0 0 0 74944976 75071280 1123909632 140732489738329 140732489738423 140732489738423 140732489744324 0"}
{"t_ms":360.094797,"uptime_ms":78783030,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446842,"state":"R","observed_ppid":1446834,"start_ticks":"7878291","raw":"1446842 (bun) R 1446834 1446772 1446754 0 -1 4194304 2082 0 0 0 2 0 0 0 20 0 13 0 7878291 6723743744 10485 18446744073709551615 15636736 74940880 140731658001280 0 0 0 0 16781312 536872184 0 0 0 17 2 0 0 0 0 0 74944976 75071280 794013696 140731658004567 140731658004658 140731658004658 140731658010564 0"}
{"t_ms":361.351697,"uptime_ms":78783030,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446842,"state":"S","observed_ppid":1446834,"start_ticks":"7878291","raw":"1446842 (bun) S 1446834 1446772 1446754 0 -1 4194304 2082 0 0 0 2 0 0 0 20 0 13 0 7878291 6723743744 10447 18446744073709551615 15636736 74940880 140731658001280 0 0 0 0 16781312 536872184 0 0 0 17 2 0 0 0 0 0 74944976 75071280 794013696 140731658004567 140731658004658 140731658004658 140731658010564 0"}
{"t_ms":135.981099,"uptime_ms":78783050,"pid":1446842,"ppid":1446834,"event":"leaf_before_exit","expected":37}
{"t_ms":378.919897,"uptime_ms":78783050,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446842,"state":"Z","observed_ppid":1446834,"start_ticks":"7878291","raw":"1446842 (bun) Z 1446834 1446772 1446754 0 -1 4227084 2084 0 0 0 2 0 0 0 20 0 2 0 7878291 0 0 18446744073709551615 0 0 0 0 0 0 0 16781312 536872184 0 0 0 17 0 0 0 0 0 0 0 0 0 0 0 0 0 9472"}
{"t_ms":159.491699,"uptime_ms":78783050,"pid":1446834,"ppid":1446773,"event":"wrapper_await_end","child_pid":1446842,"code":37,"signalCode":null,"timeout":false}
{"t_ms":381.325897,"uptime_ms":78783050,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446834,"state":"Z","observed_ppid":1446773,"start_ticks":"7878288","raw":"1446834 (bun) Z 1446773 1446772 1446754 0 -1 4227084 2089 2084 0 0 1 1 2 0 20 0 2 0 7878288 0 0 18446744073709551615 0 0 0 0 0 0 0 16781312 536888571 0 0 0 17 4 0 0 0 0 0 0 0 0 0 0 0 0 9472"}
{"t_ms":381.484197,"uptime_ms":78783050,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446842,"state":"ABSENT"}
{"t_ms":382.554697,"uptime_ms":78783050,"pid":1446773,"ppid":1446772,"event":"driver_await_end","mode":"extracted","child_pid":1446834,"code":37,"signalCode":null,"timeout":false}
{"t_ms":382.699697,"uptime_ms":78783050,"pid":1446773,"ppid":1446772,"event":"proc_transition","mode":"extracted","observed_pid":1446834,"state":"ABSENT"}
{"t_ms":433.345897,"uptime_ms":78783100,"pid":1446773,"ppid":1446772,"event":"proc_summary","mode":"extracted","observed_pid":1446834,"last_live_ms":380.120597,"first_z_ms":381.392697,"last_z_ms":381.392697,"first_absent_ms":382.717997,"z_lower_ms":0,"z_upper_ms":2.59740000000005}
{"t_ms":433.423097,"uptime_ms":78783100,"pid":1446773,"ppid":1446772,"event":"proc_summary","mode":"extracted","observed_pid":1446842,"last_live_ms":377.682997,"first_z_ms":378.959797,"last_z_ms":380.131397,"first_absent_ms":381.505997,"z_lower_ms":1.1716000000000122,"z_upper_ms":3.822999999999979}
{"t_ms":433.526997,"uptime_ms":78783100,"pid":1446773,"ppid":1446772,"event":"case_result","mode":"extracted","code":37,"allAbsent":true,"tracked_pids":[1446834,1446842],"samples":184,"max_poll_gap_ms":1.5078000000000316,"pass":true}
```

## Result validation and limits

A separate foreground validation exited 0. Exact command:

```sh
bun - <<'VALIDATE'
const dir = '/tmp/gpu-child-reap-cpu.IgHuof';
const events = (await Bun.file(`${dir}/events.jsonl`).text()).trim().split('\n').map(x => JSON.parse(x));
for (const mode of ['direct', 'extracted']) {
 const result = events.find(e => e.event === 'case_result' && e.mode === mode);
 if (!result?.pass || result.code !== 37 || !result.allAbsent) throw Error(`bad result ${mode}`);
 const start = events.find(e => e.event === 'driver_spawn' && e.mode === mode);
 const end = events.find(e => e.event === 'driver_await_end' && e.mode === mode);
 if (end.timeout || end.signalCode !== null || end.t_ms - start.t_ms >= 4000) throw Error(`deadline ${mode}`);
 for (const pid of result.tracked_pids) if (await Bun.file(`/proc/${pid}/stat`).exists()) throw Error(`remaining PID ${pid}`);
 process.stdout.write(`${mode}: PASS exit=37 spawn_to_await_ms=${(end.t_ms-start.t_ms).toFixed(6)} all tracked /proc entries absent\n`);
}
const spawn = events.find(e => e.event === 'wrapper_spawn');
const leaf = events.find(e => e.event === 'leaf_start' && e.mode === 'extracted');
const end = events.find(e => e.event === 'wrapper_await_end');
if (spawn.child_pid !== leaf.pid || leaf.ppid !== spawn.pid || end.code !== 37 || end.timeout) throw Error('exec/wait mismatch');
process.stdout.write('extracted exec PID identity, immediate parent, wrapper await status: PASS\n');
VALIDATE
```

Raw validation output:

```text
direct: PASS exit=37 spawn_to_await_ms=146.100099 all tracked /proc entries absent
extracted: PASS exit=37 spawn_to_await_ms=164.729099 all tracked /proc entries absent
extracted exec PID identity, immediate parent, wrapper await status: PASS
```

This verifies bounded normal reaping for these CPU commands on this runtime/host.
Native teardown, parent blockage, signal termination, unusual descendants,
namespace interactions, and production resource-group cleanup remain untested.
The brief supplies no reconstructable historical PID/PPID tree, kernel/runtime
versions, signal sequence, wait trace, or native stack. Those unknowns remain
open; synthetic success supplies none of them. No change to historical blame
or exoneration is justified.

## Publication verification

Required foreground command:

```sh
test -s tools/shared/GPU-CHILD-REAP-CPU-20261021.md && rumdl check tools/shared/GPU-CHILD-REAP-CPU-20261021.md
```

Root/coordinator retains publication and acceptance. No policy integration or
production experiment was attempted.

Observed required-check result: exit 0,
`Success: No issues found in 1 file (19ms)`.
The report was also checked to contain all three final source files and all
three raw result streams verbatim before owned scratch cleanup. No persistent
fixture or adjacent file was retained. English prose received manual review;
no English textlint/Vale result is claimed.

Exact preservation check and cleanup command, exit 0:

```sh
bun - <<'PRESERVE'
import { rmSync } from 'node:fs';
const dir = '/tmp/gpu-child-reap-cpu.IgHuof';
const report = await Bun.file('tools/shared/GPU-CHILD-REAP-CPU-20261021.md').text();
for (const file of ['probe.ts', 'leaf.ts', 'wrapper.ts', 'stdout.txt', 'second-events.jsonl', 'final-stdout.txt']) {
 if (!report.includes((await Bun.file(`${dir}/${file}`).text()).trimEnd())) throw Error(`missing embedded evidence: ${file}`);
}
if ((await Bun.file(`${dir}/stderr.txt`).text()) !== '' || (await Bun.file(`${dir}/final-stderr.txt`).text()) !== '') throw Error('unexpected stderr');
process.stdout.write('Evidence preservation: PASS (3 sources, 3 raw streams, empty stderr)\n');
rmSync(dir, { recursive: true });
process.stdout.write('Owned isolated scratch removed; report retains source and raw results\n');
PRESERVE
```

Output:

```text
Evidence preservation: PASS (3 sources, 3 raw streams, empty stderr)
Owned isolated scratch removed; report retains source and raw results
```

After cleanup, the required foreground publication command again exited 0:
`Success: No issues found in 1 file (9ms)`.
