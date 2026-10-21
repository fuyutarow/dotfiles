# GPU-SLOT-RACE-CPU — 2026-10-21

The authorized measurement-only rerun passed: **1 pass, 0 fail, 19 assertions**.
A deterministic CPU-only fake discriminates the slot-check-to-spawn race:
publication of a fake holder after the awaited slot check still permits sampling;
the held-slot control pauses. Native GPU-tool calls: **0**.
The same-parent measured interval from the post-check marker to receipt of the
fake child's entry notification was **27195100 ns (27.195100 ms)**.
This is a notification-receipt interval, not an exact kernel exec timestamp.

## Current measurement contract and result

The coordinator authorized exactly one rerun to repair measurement after the
first execution's cross-process clock failure. This rerun changes only scratch
measurement: child markers carry no clock values; the parent alone timestamps
its markers with process.hrtime.bigint(). No unrelated process-relative clock
values are compared. Initial evidence and its limitations are retained verbatim
in the frozen first-run record below, including the failed test and fixture.
Statements there about no rerun or unfinished measurement describe that first
execution only; this section is the current conclusion.

The child atomically renames a complete entry-notification file into visibility,
then waits at most 1000 ms for a parent acknowledgement before emitting the same
fixture XML. The parent polls that scratch file at 1 ms intervals with a 1500 ms
deadline, timestamps successful receipt with its own clock, and acknowledges.
It awaits the observation promise as well as the sampler result. There are no
background shell jobs, real messages, process signals or live locks. A synthetic
holder file remains the sole fake admission state.

Executed fixture citations:
[race.test.ts:24](/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/race.test.ts:24)
defines the parent clock; line 25 removes timestamps from child markers; line 27
defines atomic notification publication and the bounded child wait;
[race.test.ts:46](/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/race.test.ts:46)
marks arrival after the awaited check; lines 48–59 publish the fake holder and
receive/acknowledge entry;
[race.test.ts:81](/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/race.test.ts:81)
compares parent timestamps only. The entire executed source is embedded below.

| Parent marker | Parent monotonic ns |
| --- | ---: |
| post-slot-check-pre-spawn | 261870102 |
| fake-holder-visible | 262026802 |
| delegate-fake-spawn | 262325102 |
| parent-received-child-entry | 289065202 |
| run-return, sampled | 355023402 |

Observed intervals from this parent clock:

- Post-check marker to fake holder visibility: 156700 ns (0.156700 ms).
- Post-check marker to spawn delegation: 455000 ns (0.455000 ms).
- Spawn delegation to entry-notification receipt: 26740100 ns (26.740100 ms).
- Post-check marker to entry-notification receipt: 27195100 ns (27.195100 ms).

The fake executable's first scripted entry action lies **after delegation and
before notification receipt**, so its entry is bracketed by parent instants
262325102 and 289065202 ns. Relative to the post-check marker, this is the
interval [0.455000, 27.195100] ms. It includes process startup, file notification
and polling/scheduling latency; those costs have not been subtracted. The actual
slot-check return precedes the post-check marker and was not directly timestamped.
This bracket and the receipt interval are the exact measured synthetic window;
no more precise slot-check-return-to-entry duration is claimed.

The deterministic conclusion is causal order, not reproducibility of elapsed
milliseconds: empty lslocks snapshot → awaited check passed → fake holder
publication → real fake-child spawn → child sees held=true → parent receives
entry → sampler returns sampled. A separate slot read then reports PID 2468;
a fresh-state control sees the same holder and returns a pause without starting
a second fake probe. Counts mean fixture executable entries: one fake probe,
three fake lslocks entries, zero rejected spawns, zero native GPU-tool calls.
All count assertions and RAW_SUMMARY output were reached in this run.

## Rerun command, isolation and provenance

Foreground command, executed once for this follow-up:

`mise exec -- bun test /tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/race.test.ts --timeout 10000`

Output was redirected to the scratch run.log and immediately printed in the
foreground; shell propagated the captured test exit status. Exit **0**.
Bun banner: 1.4.3 (c6da4a4d3). Test body: 385.00 ms; total: 555.00 ms.
Test timeout 10000 ms, existing sampler probe timeout 2000 ms and lslocks timeout
5000 ms remain; the new measurement waits have deadlines above. No timeout fired.

Scratch root is /tmp/gpu-slot-race-cpu-20261021-measured-abJFxt. As shown in the
raw summary, all executable, proc, slot, state, runtime, HOME and child PATH
locations are inside that root, and fallbacks is []. The state's now function
returns the same synthetic value 1000000; those state timestamps are not elapsed
measurement clocks. The spawn wrapper accepts only the exact scratch lslocks and
nvidia-smi scripts; each has an absolute Bun shebang, no GPU imports, no child
spawn and no host fallback. Both scripts' full construction is retained below.
This verifies zero native GPU calls for this controlled execution path; it is
not an independent syscall trace or a host-wide statement about other processes.

No source survey or native host query was repeated. A read-only revision receipt,
`jj --ignore-working-copy log -r '@|@-' --no-graph` (exit 0), still identified
workspace 16b57059 and parent 8dd8f0f2. SHA-256 verification (exit 0) confirmed
source and existing fixtures match the original table below, and the parent
incident report remains unchanged at
`93bb6defa8852ece4c6f000331ba6b7bdc835d976a4b28f29259c073dd09d421`.
The original scratch fixture still hashes to
`07ac553408f59588bb6a9880fbf669c18482a585d05ed2e9102b32b09a937eb8`;
the executed repaired fixture hashes to
`95e30238ea4302b159e92329b64ee84c333e0f8a11bcbc5db81ed3c45d876c2c`.

The minimum production contract remains a shared atomic admission/probe exclusion
protocol, held through confirmed probe exit or job cleanup. A snapshot or repeated
check alone does not close the race. The source basis and detailed contract are
retained in the first-run record, including
[gpu-sampler.ts:506](src/gpu-sampler.ts#L506) and
[gpu-sampler.ts:555](src/gpu-sampler.ts#L555).
No production behavior, release version, changeset, CHANGELOG, permanent fixture
or integration policy changed. Only this dated report is a repository deliverable.
No whole gates were run.

Historical PID344072 timing and the driver-fault cause remain unknown. This
synthetic result does not establish NVML causality, real flock behavior, GPU
safety, natural race frequency or adapter-wide serialization. Exact child entry
is bounded by notification protocol rather than directly timed. These limits do
not prevent discrimination of the permitted overlap ordering.

## Follow-up report verification

The foreground command `test -s tools/shared/GPU-SLOT-RACE-CPU-20261021.md && rumdl check tools/shared/GPU-SLOT-RACE-CPU-20261021.md` returned exit 0; rumdl reported `Success: No issues found in 1 file (10ms)`. The same command is repeated after this receipt is written, with its final status returned to the coordinator.

## Repaired-run raw output

```text
bun test v1.4.3 (c6da4a4d3)

../../../../tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/race.test.ts:
RAW_EVENTS
{"event":"run-start","ns":"178843301"}
{"event":"lslocks-snapshot","clock":"causal-marker-only","locks":[]}
{"event":"post-slot-check-pre-spawn","ns":"261870102"}
{"event":"fake-holder-visible","ns":"262026802","pid":2468,"slot":"/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/runtime/agent-resource/slots/gpu.0.0"}
{"event":"delegate-fake-spawn","ns":"262325102"}
{"event":"fake-executable-start","clock":"causal-marker-only","held":true,"argv":["-q","-x"]}
{"event":"parent-received-child-entry","ns":"289065202","held":true}
{"event":"run-return","ns":"355023402","result":"sampled"}
{"event":"lslocks-snapshot","clock":"causal-marker-only","locks":[{"path":"/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/runtime/agent-resource/slots/gpu.0.0","pid":2468}]}
{"event":"lslocks-snapshot","clock":"causal-marker-only","locks":[{"path":"/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/runtime/agent-resource/slots/gpu.0.0","pid":2468}]}
{"event":"control-return","ns":"541959604","result":"probe paused: GPU job admitted"}
RAW_SUMMARY {"options":{"statePath":"/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/state/race.json","path":"/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/bin","fallbacks":[],"procRoot":"/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/proc","slotDirectory":"/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/runtime/agent-resource/slots","lslocksPath":"/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/bin/lslocks","timeoutMs":2000},"env":{"HOME":"/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/home","XDG_RUNTIME_DIR":"/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/runtime","XDG_STATE_HOME":"/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/state","PATH":"/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/bin"},"spawns":[["/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/bin/lslocks","--json","--notruncate","--output","PID,PATH"],["/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/bin/nvidia-smi","-q","-x"],["/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/bin/lslocks","--json","--notruncate","--output","PID,PATH"],["/tmp/gpu-slot-race-cpu-20261021-measured-abJFxt/bin/lslocks","--json","--notruncate","--output","PID,PATH"]],"raceResult":"sampled","controlResult":"probe paused: GPU job admitted","raceState":{"schema":1,"attemptAt":1000000,"sampledAt":1000000,"lastProbeAt":1000000,"consecutiveProbeMisses":0,"devices":[{"id":0,"totalMiB":12288,"usedMiB":3584,"utilPct":19,"powerWatts":25}],"processes":[{"pid":42,"usedMiB":512}],"samples":[{"memUsedGiB":3.5,"memTotalGiB":12,"ts":1000000,"utilPct":19,"nextTs":1060000}]},"controlState":{"schema":1,"attemptAt":1000000,"sampledAt":1000000,"paused":true,"holder":{"slot":"gpu.0.0","pid":2468},"na":true,"devices":[],"processes":[],"samples":[]},"fakeProbeCalls":1,"nativeGpuToolCalls":0,"rejectedSpawns":0,"postCheckToEntryReceiptNs":"27195100","postCheckToDelegationNs":"455000","delegationToEntryReceiptNs":"26740100"}
(pass) deterministic slot snapshot versus pre-spawn admission, with held-slot control [385.00ms]

 1 pass
 0 fail
 19 expect() calls
Ran 1 test across 1 file. [555.00ms]
```

Raw child-entry notification:

```json
{"event":"child-entry-notification","held":true}
```

Raw parent acknowledgement:

```json
{"event":"parent-ack"}
```

## Repaired executed fixture

```typescript
import { test, expect } from "bun:test";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runGpuSampler, gpuSlotHeld } from "/home/fuyu/dotfiles.ws/ws_gpu-slot-race-cpu/tools/shared/src/gpu-sampler.ts";
import { readGpuState } from "/home/fuyu/dotfiles.ws/ws_gpu-slot-race-cpu/tools/shared/src/gpu-samples.ts";
import { GPU_XML } from "/home/fuyu/dotfiles.ws/ws_gpu-slot-race-cpu/tools/shared/tests/gpu-owner-fixture.ts";

// Consumer: this one focused CPU experiment; no CLI arguments or external dependencies.
test("deterministic slot snapshot versus pre-spawn admission, with held-slot control", async () => {
  const root = import.meta.dir;
  const runtime = join(root, "runtime");
  const slots = join(runtime, "agent-resource", "slots");
  const procRoot = join(root, "proc");
  const bin = join(root, "bin");
  for (const dir of [slots, procRoot, bin, join(root, "home"), join(root, "state")]) mkdirSync(dir, { recursive: true });
  const slot = join(slots, "gpu.0.0");
  writeFileSync(slot, "synthetic slot name only; no flock\n");
  const holderPath = join(root, "holder.json");
  const eventsPath = join(root, "events.jsonl");
  const entryPath = join(root, "child-entry.json");
  const ackPath = join(root, "parent-ack.json");
  const lslocksPath = join(bin, "lslocks");
  const binary = join(bin, "nvidia-smi");
  const marker = (event: string, data = {}) => appendFileSync(eventsPath, JSON.stringify({ event, ns: process.hrtime.bigint().toString(), ...data }) + "\n");
  const childPrelude = `import { appendFileSync, existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";\nconst marker = (event, data = {}) => appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify({ event, clock: "causal-marker-only", ...data }) + "\\n");\n`;
  writeFileSync(lslocksPath, `#!${process.execPath}\n${childPrelude}const locks = existsSync(${JSON.stringify(holderPath)}) ? JSON.parse(readFileSync(${JSON.stringify(holderPath)}, "utf8")).locks : [];\nmarker("lslocks-snapshot", { locks });\nprocess.stdout.write(JSON.stringify({ locks }));\n`, { mode: 0o755 });
  writeFileSync(binary, `#!${process.execPath}\n${childPrelude}const held = existsSync(${JSON.stringify(holderPath)});\nmarker("fake-executable-start", { held, argv: process.argv.slice(2) });\nif (!held) process.exit(9);\nwriteFileSync(${JSON.stringify(entryPath + ".tmp")}, JSON.stringify({ event: "child-entry-notification", held })); renameSync(${JSON.stringify(entryPath + ".tmp")}, ${JSON.stringify(entryPath)});\nconst deadline = performance.now() + 1000;\nwhile (!existsSync(${JSON.stringify(ackPath)}) && performance.now() < deadline) await Bun.sleep(1);\nif (!existsSync(${JSON.stringify(ackPath)})) process.exit(10);\nprocess.stdout.write(${JSON.stringify(GPU_XML)});\n`, { mode: 0o755 });
  const options = { statePath: join(root, "state", "race.json"), path: bin, fallbacks: [], procRoot, slotDirectory: slots, lslocksPath, timeoutMs: 2000, now: () => 1_000_000 };
  const env = { HOME: join(root, "home"), XDG_RUNTIME_DIR: runtime, XDG_STATE_HOME: join(root, "state"), PATH: bin };
  const originalSpawn = Bun.spawn;
  const spawns: string[][] = [];
  let phase = "race";
  let rejectedSpawns = 0;
  let entryObservation: Promise<boolean> | undefined;
  // Scratch-only deterministic scheduler. It delegates the real fake child spawn;
  // no production implementation or imported function is replaced.
  Bun.spawn = ((cmd, spawnOptions) => {
    if (!Array.isArray(cmd) || (cmd[0] !== lslocksPath && cmd[0] !== binary)) {
      rejectedSpawns += 1;
      throw new Error("non-fixture child refused");
    }
    spawns.push([...cmd]);
    if (cmd[0] === binary) {
      expect(phase).toBe("race");
      // Arrival here proves runGpuSampler has passed its awaited slot check.
      marker("post-slot-check-pre-spawn");
      expect(existsSync(holderPath)).toBe(false);
      writeFileSync(holderPath, JSON.stringify({ locks: [{ path: slot, pid: 2468 }] }));
      marker("fake-holder-visible", { pid: 2468, slot });
      entryObservation = (async () => {
        const deadline = performance.now() + 1500;
        while (!existsSync(entryPath) && performance.now() < deadline) await Bun.sleep(1);
        if (!existsSync(entryPath)) return false;
        const entry = JSON.parse(readFileSync(entryPath, "utf8"));
        marker("parent-received-child-entry", { held: entry.held });
        writeFileSync(ackPath, JSON.stringify({ event: "parent-ack" }));
        return entry.held === true;
      })();
      marker("delegate-fake-spawn");
    }
    return originalSpawn(cmd, { ...spawnOptions, env });
  });
  try {
    marker("run-start");
    const raceResult = await runGpuSampler(options);
    marker("run-return", { result: raceResult });
    expect(raceResult).toBe("sampled");
    expect(await entryObservation).toBe(true);
    const raceState = await readGpuState(options.statePath);
    expect(raceState?.samples.length).toBe(1);
    expect(raceState?.paused).toBeUndefined();
    phase = "control";
    expect(await gpuSlotHeld(options)).toEqual({ slot: "gpu.0.0", pid: 2468 });
    const controlResult = await runGpuSampler({ ...options, statePath: join(root, "state", "control.json") });
    marker("control-return", { result: controlResult });
    expect(controlResult).toBe("probe paused: GPU job admitted");
    const controlState = await readGpuState(join(root, "state", "control.json"));
    expect(controlState?.holder).toEqual({ slot: "gpu.0.0", pid: 2468 });
    const events = readFileSync(eventsPath, "utf8").trim().split("\n").map(line => JSON.parse(line));
    const event = (name: string) => events.find(row => row.event === name);
    const ordered = ["post-slot-check-pre-spawn", "fake-holder-visible", "delegate-fake-spawn", "parent-received-child-entry", "run-return"];
    for (let i = 1; i < ordered.length; i++) expect(BigInt(event(ordered[i]).ns)).toBeGreaterThan(BigInt(event(ordered[i - 1]).ns));
    expect(event("lslocks-snapshot").locks).toEqual([]);
    expect(event("fake-executable-start").held).toBe(true);
    expect(events.filter(row => row.event === "fake-executable-start").length).toBe(1);
    expect(spawns.filter(cmd => cmd[0] === binary).length).toBe(1);
    expect(spawns.filter(cmd => cmd[0] === lslocksPath).length).toBe(3);
    expect(rejectedSpawns).toBe(0);
    process.stdout.write("RAW_EVENTS\n" + readFileSync(eventsPath, "utf8"));
    process.stdout.write("RAW_SUMMARY " + JSON.stringify({ options, env, spawns, raceResult, controlResult, raceState, controlState, fakeProbeCalls: 1, nativeGpuToolCalls: 0, rejectedSpawns, postCheckToEntryReceiptNs: (BigInt(event("parent-received-child-entry").ns) - BigInt(event("post-slot-check-pre-spawn").ns)).toString(), postCheckToDelegationNs: (BigInt(event("delegate-fake-spawn").ns) - BigInt(event("post-slot-check-pre-spawn").ns)).toString(), delegationToEntryReceiptNs: (BigInt(event("parent-received-child-entry").ns) - BigInt(event("delegate-fake-spawn").ns)).toString() }) + "\n");
  } finally { Bun.spawn = originalSpawn; }
}, 10000);
```

## Frozen first-run report

The following is the preserved first-run account. Its source, raw output,
events and negative timing result remain unchanged; only heading depth is
adjusted to nest this historical record under the current measured result.


The CPU-only fixture discriminated the two admission orderings: a holder visible
at slot inspection caused a pause; a holder published after the inspection and
before the real fake-child spawn did not prevent sampling. Current source allows
that synthetic overlap. The single automated test nevertheless **failed** on an
invalid cross-process timestamp comparison. Treat this as causal marker evidence
of overlap, not a green timing test or a recovered historical incident window.

The timing method failure triggers an early RETURN. No second focused run was
performed. No native GPU tool, NVML, CUDA, GPU job, live admission lock, service
operation, explicit process signal, message, consumer edit, commit or push was used.
The sampler's own directory lock existed only under the isolated scratch state path.

### Source and method

Read repository AGENTS.md, CLAUDE.md, .claude/settings.json and the requested
implementing-and-debugging, writing-bun-scripts and writing-typescript skills.
Repository file inventories used repo-retrieve; its .claude/skills and
.claude/commands inventories returned NO_MATCH. No external research was needed.

Source receipt: `jj --ignore-working-copy log -r '@|@-' --no-graph`
(exit 0) identified empty workspace revision `16b57059`, parent `8dd8f0f2`
(alpha, “Allow VRAM-bounded GPU concurrency and refuse live dxg stalls”).
No snapshot/commit operation was requested. SHA-256 before and after the experiment:

| File | SHA-256 |
| --- | --- |
| tools/shared/src/gpu-sampler.ts | 1c2dd67f32784f2bb2da43ce0df5df2e4481a35207f25a3d532e8125e02a0c6b |
| tools/shared/tests/gpu-sampler.test.ts | 5cb0a7b4c625a9ec120a4630c1c6299f1c0955aa1598675feff5b7a2484f3c1c |
| tools/shared/tests/gpu-owner-fixture.ts | cd813fc403bac537d4f71a5efa32a35739da666dfddb338e0aa66b4d1df387fd |
| tools/shared/GPU-STALL-20261021.md | 93bb6defa8852ece4c6f000331ba6b7bdc835d976a4b28f29259c073dd09d421 |
| scratch race.test.ts | 07ac553408f59588bb6a9880fbf669c18482a585d05ed2e9102b32b09a937eb8 |

The sampler's options provide explicit executable search path, fallback list,
procRoot, slotDirectory, lslocksPath, statePath and timeout seams
([gpu-sampler.ts:222](src/gpu-sampler.ts#L222)). The fake follows the existing
executable-fixture pattern ([gpu-sampler.test.ts:32](tests/gpu-sampler.test.ts#L32))
and imports existing GPU_XML ([gpu-owner-fixture.ts:24](tests/gpu-owner-fixture.ts#L24)).
The supplied XML describes no real measurement.

Current source inventories fake proc first, then awaits gpuSlotHeld at line 506;
the held branch returns at line 529. It resolves the executable at line 539,
writes pending state at line 553, then calls Bun.spawn at line 555:
[gpu-sampler.ts:488](src/gpu-sampler.ts#L488),
[gpu-sampler.ts:506](src/gpu-sampler.ts#L506),
[gpu-sampler.ts:539](src/gpu-sampler.ts#L539).
Slot inspection consumes one lslocks snapshot and returns false on empty rows
([gpu-sampler.ts:279](src/gpu-sampler.ts#L279),
[gpu-sampler.ts:311](src/gpu-sampler.ts#L311)).

Scratch root: `/tmp/gpu-slot-race-cpu-20261021-goXpb9`.
All fake executables live in its bin directory; procRoot is an empty scratch proc
directory. State is state/race.json or state/control.json, runtime is runtime,
and slotDirectory is runtime/agent-resource/slots. Both fixtures have an absolute
Bun shebang. Children receive only scratch HOME, XDG_RUNTIME_DIR, XDG_STATE_HOME
and PATH; fallbacks is explicitly []. No host executable resolution is permitted.

A scratch-only Bun.spawn wrapper rejects every executable except the exact fake
lslocks and fake nvidia-smi paths. Before forwarding the fake probe spawn, it
synchronously publishes holder.json containing a synthetic lslocks row for
slot gpu.0.0, PID 2468. PID 2468 is invented and never queried or signalled.
The fake lslocks reads that file; no flock syscall or actual holder process is
used. The wrapper changes scheduling in the test process only; the repository
source and imported sampler functions remain unchanged.

At the wrapper's arrival, the sampler has already passed the awaited slot check.
This is an observation after check completion, not instrumentation of the precise
return instant. The fake executable records its first scripted action and checks
that holder.json is present before emitting XML. Synchronous appendFileSync calls
and delegation only after publication establish causal marker order independently
of clock origins. The fake does not spawn children or import native GPU bindings.

### Exact observed ordering and bounds

The event-file records, in order, are:

1. Fake lslocks snapshots locks: [].
2. Parent arrives at post-slot-check-pre-spawn: 113617798 ns.
3. Parent publishes fake holder: 113731998 ns.
4. Parent delegates the real fake-child spawn: 113743598 ns.
5. Fake executable enters with held: true and arguments -q -x.
6. Sampler returns sampled: parent 141285597 ns; one synthetic sample persisted.
7. An explicit slot read and a fresh-state control sampler both see PID 2468;
   the control returns probe paused: GPU job admitted, with no second probe entry.

Same-parent monotonic intervals are valid: post-check marker to holder marker
114200 ns; holder marker to spawn delegation 11600 ns; post-check marker to
spawn delegation 125800 ns. The parent interval from post-check marker through
sampler return is 27667799 ns (27.667799 ms), containing fake-child startup and
completion. These are this fixture's instrumented windows, including synchronous
marker overhead. They are not the exact slot-check-return-to-exec duration.

The child entry timestamp is 7703299 ns, numerically below the parent delegation
113743598 ns. This run therefore invalidates treating Bun's hrtime values across
these processes as a common origin. No cross-process elapsed duration is reported.
The exact ordering is retained by markers and the publication-before-delegation
control flow. No timestamp here is historical PID 344072 timing.

One fake probe entry and three fake lslocks snapshots are visible in the raw
markers. “Count” means fixture executable entries, not GPU invocations or jobs.
Native GPU-tool calls were zero: every sampler spawn was guarded by the exact
scratch executable allowlist, the only GPU-named executable was a Bun script with
no GPU operation, fallbacks were empty, and its one entry emitted the supplied
XML. The later counter assertions and RAW_SUMMARY output were **not reached**
after the timing assertion failed; no successful syscall-trace audit is claimed.
`command -v strace` found no executable. This is proof from the bounded execution
paths plus fixture contents and entry markers, not an independent system trace.

### One focused run and negative result

Runtime: `bun --version` returned 1.4.3 (exit 0); test banner reports c6da4a4d3.
Foreground invocation, exactly once:

`mise exec -- bun test /tmp/gpu-slot-race-cpu-20261021-goXpb9/race.test.ts --timeout 10000`

Stdout/stderr were redirected to scratch run.log and immediately read in the
foreground. Exit 1; 0 pass, 1 fail, 11 expect calls; test body 120.06 ms, total
197.00 ms. The test deadline was 10000 ms, sampler fake-probe timeout 2000 ms,
and existing fake-lslocks spawn timeout 5000 ms. No polling, background task or
unbounded waiting was introduced. No timeout fired in this run.

Assertions before the failure established sampled, one sample, no paused flag,
the later slot reader result, control pause and control holder. The failure was
at scratch race.test.ts:69, comparing child hrtime against the parent hrtime.
Assertions at lines 70–75 and summary output at lines 76–77 were skipped.
Raw files were then read without executing the experiment again.

Raw test stderr/stdout:

```text
bun test v1.4.3 (c6da4a4d3)

../../../../tmp/gpu-slot-race-cpu-20261021-goXpb9/race.test.ts:
64 |     const controlState = await readGpuState(join(root, "state", "control.json"));
65 |     expect(controlState?.holder).toEqual({ slot: "gpu.0.0", pid: 2468 });
66 |     const events = readFileSync(eventsPath, "utf8").trim().split("\n").map(line => JSON.parse(line));
67 |     const event = (name: string) => events.find(row => row.event === name);
68 |     const ordered = ["post-slot-check-pre-spawn", "fake-holder-visible", "delegate-fake-spawn", "fake-executable-start", "run-return"];
69 |     for (let i = 1; i < ordered.length; i++) expect(BigInt(event(ordered[i]).ns)).toBeGreaterThan(BigInt(event(ordered[i - 1]).ns));
                                                                                       ^
error: expect(received).toBeGreaterThan(expected)

Expected: > 113743598n
Received: 7703299n

      at <anonymous> (/tmp/gpu-slot-race-cpu-20261021-goXpb9/race.test.ts:69:83)
(fail) deterministic slot snapshot versus pre-spawn admission, with held-slot control [120.06ms]

 0 pass
 1 fail
 11 expect() calls
Ran 1 test across 1 file. [197.00ms]
```

Raw events.jsonl (all records, unmodified):

```jsonl
{"event":"run-start","ns":"82241698"}
{"event":"lslocks-snapshot","ns":"5430800","locks":[]}
{"event":"post-slot-check-pre-spawn","ns":"113617798"}
{"event":"fake-holder-visible","ns":"113731998","pid":2468,"slot":"/tmp/gpu-slot-race-cpu-20261021-goXpb9/runtime/agent-resource/slots/gpu.0.0"}
{"event":"delegate-fake-spawn","ns":"113743598"}
{"event":"fake-executable-start","ns":"7703299","held":true,"argv":["-q","-x"]}
{"event":"run-return","ns":"141285597","result":"sampled"}
{"event":"lslocks-snapshot","ns":"5771200","locks":[{"path":"/tmp/gpu-slot-race-cpu-20261021-goXpb9/runtime/agent-resource/slots/gpu.0.0","pid":2468}]}
{"event":"lslocks-snapshot","ns":"5826400","locks":[{"path":"/tmp/gpu-slot-race-cpu-20261021-goXpb9/runtime/agent-resource/slots/gpu.0.0","pid":2468}]}
{"event":"control-return","ns":"191476796","result":"probe paused: GPU job admitted"}
```

Raw race state:

```json
{"schema":1,"attemptAt":1000000,"lastProbeAt":1000000,"sampledAt":1000000,"consecutiveProbeMisses":0,"devices":[{"id":0,"totalMiB":12288,"usedMiB":3584,"utilPct":19,"powerWatts":25}],"processes":[{"pid":42,"usedMiB":512}],"samples":[{"ts":1000000,"nextTs":1060000,"utilPct":19,"memUsedGiB":3.5,"memTotalGiB":12}]}
```

Raw control state:

```json
{"schema":1,"attemptAt":1000000,"devices":[],"processes":[],"samples":[],"sampledAt":1000000,"paused":true,"na":true,"holder":{"slot":"gpu.0.0","pid":2468}}
```

Raw synthetic holder inventory:

```json
{"locks":[{"path":"/tmp/gpu-slot-race-cpu-20261021-goXpb9/runtime/agent-resource/slots/gpu.0.0","pid":2468}]}
```

### Minimum exclusion contract and limits

The observed race requires an admission/probe exclusion domain shared by every
participating GPU admission and probe, with an atomic choice: either the probe
owns permission before a job may enter, or admission wins and the probe does not
start. A snapshot or a second check alone leaves another check-to-start gap.
Hold probe permission from before the admission decision through confirmed probe
exit/reaping; hold job participation for its admitted scope lifetime and confirmed
cleanup. If a probe remains alive after its deadline, do not release permission
merely because a timeout returned. The existing sampler-owner directory prevents
multiple sampler owners; it does not exclude independent research-slot admission
([gpu-sampler.ts:470](src/gpu-sampler.ts#L470)).

That contract may use an admission/probe read-write gate: admitted jobs can coexist
under their separate capacity policy while probes exclude all admitted jobs.
The minimum requirement is the shared atomic protocol, not a selected production
implementation. Unmanaged callers remain outside such a cooperative guarantee.
No policy integration, release or live lock experiment was attempted.

This fixture proves a permissible current-source ordering under a controlled
scheduler. It does not measure natural race frequency, a real flock acquisition,
CUDA/NVML overlap, GPU behavior, fault causality, teardown safety or fairness.
It does not recover the historical slot-check/spawn window and does not claim
NVML caused the driver fault. Parent report GPU-STALL-20261021.md was preserved
unchanged (matching hash above). The timestamp failure leaves a green automated
timing test and a common-clock child-entry measurement unfinished. A separately
authorized follow-up could use one parent clock with a bounded child-entry
handshake, or a verified shared host monotonic clock; this run does not rerun it.

### Housekeeping and verification

Only this dated report is a repository deliverable. Fixtures and raw files stay
in the isolated scratch root; their full test source is retained below so evidence
does not depend solely on temporary-file survival. No tool version, changeset,
CHANGELOG entry, adjacent production file or permanent fixture is appropriate for
a report-only experiment. No whole gate was run.

Source and parent-report hashes were rechecked with sha256sum after the run
(exit 0; unchanged). Required report checks, run in the foreground after writing:
`test -s tools/shared/GPU-SLOT-RACE-CPU-20261021.md` and
`rumdl check tools/shared/GPU-SLOT-RACE-CPU-20261021.md`.
Their final results are recorded below after execution.

### Retained scratch test source

Source: /tmp/gpu-slot-race-cpu-20261021-goXpb9/race.test.ts, lines 1–79.
This is the executed fixture, including its failing timing assertion; it has not
been corrected after execution.

```typescript
import { test, expect } from "bun:test";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runGpuSampler, gpuSlotHeld } from "/home/fuyu/dotfiles.ws/ws_gpu-slot-race-cpu/tools/shared/src/gpu-sampler.ts";
import { readGpuState } from "/home/fuyu/dotfiles.ws/ws_gpu-slot-race-cpu/tools/shared/src/gpu-samples.ts";
import { GPU_XML } from "/home/fuyu/dotfiles.ws/ws_gpu-slot-race-cpu/tools/shared/tests/gpu-owner-fixture.ts";

// Consumer: this one focused CPU experiment; no CLI arguments or external dependencies.
test("deterministic slot snapshot versus pre-spawn admission, with held-slot control", async () => {
  const root = import.meta.dir;
  const runtime = join(root, "runtime");
  const slots = join(runtime, "agent-resource", "slots");
  const procRoot = join(root, "proc");
  const bin = join(root, "bin");
  for (const dir of [slots, procRoot, bin, join(root, "home"), join(root, "state")]) mkdirSync(dir, { recursive: true });
  const slot = join(slots, "gpu.0.0");
  writeFileSync(slot, "synthetic slot name only; no flock\n");
  const holderPath = join(root, "holder.json");
  const eventsPath = join(root, "events.jsonl");
  const lslocksPath = join(bin, "lslocks");
  const binary = join(bin, "nvidia-smi");
  const marker = (event: string, data = {}) => appendFileSync(eventsPath, JSON.stringify({ event, ns: process.hrtime.bigint().toString(), ...data }) + "\n");
  const childPrelude = `import { appendFileSync, existsSync, readFileSync } from "node:fs";\nconst marker = (event, data = {}) => appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify({ event, ns: process.hrtime.bigint().toString(), ...data }) + "\\n");\n`;
  writeFileSync(lslocksPath, `#!${process.execPath}\n${childPrelude}const locks = existsSync(${JSON.stringify(holderPath)}) ? JSON.parse(readFileSync(${JSON.stringify(holderPath)}, "utf8")).locks : [];\nmarker("lslocks-snapshot", { locks });\nprocess.stdout.write(JSON.stringify({ locks }));\n`, { mode: 0o755 });
  writeFileSync(binary, `#!${process.execPath}\n${childPrelude}const held = existsSync(${JSON.stringify(holderPath)});\nmarker("fake-executable-start", { held, argv: process.argv.slice(2) });\nif (!held) process.exit(9);\nprocess.stdout.write(${JSON.stringify(GPU_XML)});\n`, { mode: 0o755 });
  const options = { statePath: join(root, "state", "race.json"), path: bin, fallbacks: [], procRoot, slotDirectory: slots, lslocksPath, timeoutMs: 2000, now: () => 1_000_000 };
  const env = { HOME: join(root, "home"), XDG_RUNTIME_DIR: runtime, XDG_STATE_HOME: join(root, "state"), PATH: bin };
  const originalSpawn = Bun.spawn;
  const spawns: string[][] = [];
  let phase = "race";
  let rejectedSpawns = 0;
  // Scratch-only deterministic scheduler. It delegates the real fake child spawn;
  // no production implementation or imported function is replaced.
  Bun.spawn = ((cmd, spawnOptions) => {
    if (!Array.isArray(cmd) || (cmd[0] !== lslocksPath && cmd[0] !== binary)) {
      rejectedSpawns += 1;
      throw new Error("non-fixture child refused");
    }
    spawns.push([...cmd]);
    if (cmd[0] === binary) {
      expect(phase).toBe("race");
      // Arrival here proves runGpuSampler has passed its awaited slot check.
      marker("post-slot-check-pre-spawn");
      expect(existsSync(holderPath)).toBe(false);
      writeFileSync(holderPath, JSON.stringify({ locks: [{ path: slot, pid: 2468 }] }));
      marker("fake-holder-visible", { pid: 2468, slot });
      marker("delegate-fake-spawn");
    }
    return originalSpawn(cmd, { ...spawnOptions, env });
  });
  try {
    marker("run-start");
    const raceResult = await runGpuSampler(options);
    marker("run-return", { result: raceResult });
    expect(raceResult).toBe("sampled");
    const raceState = await readGpuState(options.statePath);
    expect(raceState?.samples.length).toBe(1);
    expect(raceState?.paused).toBeUndefined();
    phase = "control";
    expect(await gpuSlotHeld(options)).toEqual({ slot: "gpu.0.0", pid: 2468 });
    const controlResult = await runGpuSampler({ ...options, statePath: join(root, "state", "control.json") });
    marker("control-return", { result: controlResult });
    expect(controlResult).toBe("probe paused: GPU job admitted");
    const controlState = await readGpuState(join(root, "state", "control.json"));
    expect(controlState?.holder).toEqual({ slot: "gpu.0.0", pid: 2468 });
    const events = readFileSync(eventsPath, "utf8").trim().split("\n").map(line => JSON.parse(line));
    const event = (name: string) => events.find(row => row.event === name);
    const ordered = ["post-slot-check-pre-spawn", "fake-holder-visible", "delegate-fake-spawn", "fake-executable-start", "run-return"];
    for (let i = 1; i < ordered.length; i++) expect(BigInt(event(ordered[i]).ns)).toBeGreaterThan(BigInt(event(ordered[i - 1]).ns));
    expect(event("lslocks-snapshot").locks).toEqual([]);
    expect(event("fake-executable-start").held).toBe(true);
    expect(events.filter(row => row.event === "fake-executable-start").length).toBe(1);
    expect(spawns.filter(cmd => cmd[0] === binary).length).toBe(1);
    expect(spawns.filter(cmd => cmd[0] === lslocksPath).length).toBe(3);
    expect(rejectedSpawns).toBe(0);
    process.stdout.write("RAW_EVENTS\n" + readFileSync(eventsPath, "utf8"));
    process.stdout.write("RAW_SUMMARY " + JSON.stringify({ options, env, spawns, raceResult, controlResult, raceState, controlState, fakeProbeCalls: 1, nativeGpuToolCalls: 0, rejectedSpawns, windowNs: (BigInt(event("fake-executable-start").ns) - BigInt(event("post-slot-check-pre-spawn").ns)).toString(), snapshotToStartNs: (BigInt(event("fake-executable-start").ns) - BigInt(event("lslocks-snapshot").ns)).toString() }) + "\n");
  } finally { Bun.spawn = originalSpawn; }
}, 10000);
```

### Final foreground verification receipt

- `test -s tools/shared/GPU-SLOT-RACE-CPU-20261021.md`: exit 0.
- `rumdl check tools/shared/GPU-SLOT-RACE-CPU-20261021.md`: exit 0;
  `Success: No issues found in 1 file (41ms)` on the first check.
- Both required checks were repeated after appending this receipt; their result
  is also returned in the final machine-readable response.
