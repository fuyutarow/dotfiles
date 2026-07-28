# Serena operations — capability and resource diagnosis

> **SOLE owner** of Serena-specific activation, capability, memory, and resource recovery.
> Read the live Serena manual and command help before copying any form below.
> Serena behavior snapshot: 2026-07-27; re-fetch current docs or implementation before relying
> on dated internals.

## Contents

1. Live contract and client identity
2. Project and language capability
3. Memory reconciliation
4. Resource and coexistence diagnosis
5. Acceptance matrix

## 1. Live contract and client identity

Start with the server's live contract:

1. Discover and call `initial_instructions`.
2. Record transport, server PID/start time, context, and active project path.
3. Discover the schema for each operation before calling it.
4. Inspect the actual client registration when the context or project is wrong.

Use the configured launcher's root help and descend into the relevant subcommand help. Do not
recall or copy a command catalog. uv isolation, install, pin, upgrade, and trivial version/help
belong to `running-python-tools`; nontrivial Serena result semantics belong here.

Current official examples use client-specific contexts and a cwd-derived project. Treat the
exact values and flags as dated facts: fetch the client documentation and hand current evidence
to `operating-the-harness` before a registration edit.

A cwd-derived selector may find no project boundary, and some clients start the server outside
the visible workspace. Verify the launch cwd and activated root; the selector flag proves
nothing. Context and exposed tools are startup choices, so a running server cannot adopt them.

Registration source, renderer, trust, and scope belong to `operating-the-harness`. This skill may
inspect them to diagnose project identity, but must return a harness handoff instead of editing
them. The harness receipt must cover the canonical source, every rendered client entry, and a
fresh server. Record `{registration_source, rendered_entry, launcher_cwd, args, context,
transport, server_pid, server_start, detected_root}`. When cwd selection changes, test repository
root, a nested directory, a nested worktree, and a path with no project boundary. A generic shared
entry is suspect when clients require different contexts.

A running server retains startup choices. After changing context, project selection, backend,
language servers, or tool exposure, require a new server PID. For stdio this normally follows a
new client process. For HTTP, restart the operator-owned server; reconnecting alone is insufficient.

## 2. Project and language capability

Define the load-bearing language and target set first. Then build a **CAPABILITY RECEIPT** for
each actual target:

1. Confirm the target root.
2. Inspect the effective project config and local override.
3. Confirm a nonignored target file exists and belongs to a load-bearing language.
4. Confirm the live backend supports the target file.
5. Run the current project health check and inspect its exact report and log.
6. Require a nonempty outline and an exact expected declaration locus.
7. Probe a symbol with a known expected reference locus when reference capability matters.
8. Probe the load-bearing target with the exact operation the task's claim needs.

The config line is necessary but insufficient. A language server may fail during startup, retain
old connection state, or recognize zero files.

Treat the health check as a sample, not whole-repository or whole-language proof. Inspect current
coverage because backend behavior can change. In a polyglot project, probe every language and
locus the task's claim depends on through the actual session. Exit zero is not health evidence;
logical failures and warnings can still be reported. An empty result or an unused symbol with no
references is not a positive reference-capability test.

Treat indexing as a mutation: it writes the persistent symbol cache and may create project
configuration. Use it only when the request authorizes that change and only after the health
check. File-level failures may be logged while indexing continues, so capture exit status,
completion summary, nonzero expected per-language counts, failure count/list, log, and cache
artifact path. Exit zero alone is not evidence. Require `failed_count=0`, or adjudicate each
failure outside the claimed scope. Then cold-start a fresh server and repeat the same known-symbol
target probes. Index completion without that probe proves cache construction, not usable semantics
in the client. Do not index a backend whose current docs say it ignores that cache.

When teardown prints a stack trace after an apparent success, do not classify from the trace
alone. Use the process exit status, completed-file summary, and post-index probe. Report the
teardown anomaly separately even when the durable artifact is valid.

## 3. Memory reconciliation

Memories are plain project caches, not a higher-precedence instruction source.

1. Record the absolute active project root and list relevant project/global/read-only memories.
2. Inventory every load-bearing claim in those memories.
3. For each claim, cite its canonical file or a current command result.
4. Replace stale commands, paths, task names, and architecture facts.
5. Write only facts likely to remain useful across tasks.
6. Run the current memory checker and record options plus complete stdout.

Inspect the checker's report, not only its exit status; the current CLI can exit zero while
reporting stale references. Even an empty report proves only structural consistency. It does not
prove that a command, path, version, or policy still matches the repository. The canonical source
comparison is the freshness oracle.

Do not write global memory unless the user explicitly requests cross-project scope. Do not delete
a memory without explicit instruction or permission.

## 4. Resource and coexistence diagnosis

Enter this branch only on a spawn failure, FD error, process multiplication, heavy LSP startup,
or an explicit resource audit. Normal healthy use does not require process ceremony.

### Observe before changing

On Linux/WSL:

```bash
ulimit -n
cat /proc/sys/fs/file-nr
cat /proc/sys/fs/file-max
ps -e --no-headers | wc -l
ps -eLf --no-headers | wc -l
ps -p <client-pid> -o pid,ppid,nlwp,stat,comm,args
awk '/Max open files/ {print}' /proc/<client-pid>/limits
ls /proc/<client-pid>/fd | wc -l
```

On macOS:

```bash
ulimit -n
launchctl limit maxfiles
ps -p <client-pid> -o pid,ppid,state,comm,args
lsof -p <client-pid> | wc -l
```

Enumerate Serena, language-server, and CocoIndex processes with their parent PID, start time, age,
FD count, executable, command line, process/session group, transport, and endpoint. Do not infer
ownership from a process name alone. Map every candidate back to the client or task that spawned
it.

Record the transport before cleanup. A stdio client's subprocess should follow that client's
lifecycle. An HTTP server remains the operator's responsibility after a client disconnects. Use
the owning client's or server's current graceful shutdown path. Do not assume a session-data
cleanup hook stops MCP or language-server processes.

Immediately before signaling, re-read `{pid, start_time, exe, cmdline, ppid, pgid_or_sid,
transport, endpoint}`. Any mismatch or uncertain ownership means no action. After shutdown, verify
both the intended descendants and an expected-survivor manifest.

### Isolate, validate, reintroduce

1. Stop only a task-owned service or an explicitly authorized, revalidated exact identity.
2. Validate Serena alone: health check, index if needed, target-locus probe.
3. Reintroduce CocoIndex once under `driving-cocoindex`.
4. Run one refresh/search acceptance cycle.
5. Stop a one-shot daemon when the user does not want it resident.
6. Re-measure FD usage and child-process count.

Never kill all matching processes. Leave other tasks' clients, Serena servers, language servers,
and daemons untouched.

Raising a live process's FD limit can confirm the diagnosis. Record that as
`DIAGNOSIS_CONFIRMED`, never `DURABLE_REPAIR`; a restart can restore the old limit and duplicate
children can keep growing. Durable repair requires a change at the owning harness/system source,
a fresh server restart, working services, and repeated connect/probe/disconnect cycles with no
monotonic FD or child growth. Launch the acceptance operation from the affected owner, not an
unrelated audit shell. If the owner change is outside the request, leave durable repair red and
hand it off.

Transport-specific steady state:

| Transport/topology | Required observation |
|---|---|
| stdio | client exit removes its Serena process and language-server descendants |
| HTTP reconnect | one server/language-server set survives; reconnect creates no duplicate |
| HTTP shutdown | the operator-owned shutdown removes the intended descendants |
| concurrent clients, same project | interleaved probes stay on one active root |
| different projects | separate server instances/endpoints preserve their own roots |

## 5. Acceptance matrix

| Surface | Minimum evidence |
|---|---|
| harness precondition | canonical/rendered registration, launch cwd/args/context, transport, new server identity, and detected root |
| external harness repair | owner source changed, renderer rerun, client entries compared, and fresh server reports intended root/context |
| activation | live instructions or activation output names the intended root |
| target-locus capability | `{session, backend, root, language, target_file, target_symbol, operation, expected_result, observed_result}` |
| index | nonzero expected language counts, failure list/log/cache artifact, no in-scope failures, and cold target probe |
| memory | absolute root, complete claim inventory/canonical loci, checker options/stdout, and zero parsed findings |
| refactor | uniquely resolved declaration/signature, same capability receipt, semantic receipt, and task oracle |
| resource diagnosis | limit/headroom change reproduces or relieves the symptom; durable repair remains red |
| durable resource repair | owner source changed; fresh-server repeated cycles show stable FDs/children; owned extras are gone |

Report these surfaces independently. One green row never launders another red row.
