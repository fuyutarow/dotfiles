# Bun implementation evidence

These observations motivate the active guidance in [SKILL.md](../SKILL.md); verify the relevant
behavior against the runtime used by the task. The measurements below are historical.

- Bun Shell escapes interpolated values by default and provides a raw escape hatch. Separate
  awaits preserve the order of side effects. [Bun Shell](https://bun.com/docs/runtime/shell)
## §3 Subprocesses

- Bun Shell has no timeout API in the 2026-07 observation; use `Bun.spawn` for a hangable child.
  [Bun spawn](https://bun.com/docs/api/spawn)
- On Bun 1.3.14, `proc.killed` was true after clean exit; `signalCode` alone could not distinguish
  timeout from external termination. `AbortSignal.timeout` and its `aborted` state did distinguish
  the tested cases. Concurrently drain both pipes and await exit to avoid pipe deadlock; cap relay.
## §4 Dependency resolution

- An ancestor `node_modules` made inline version imports fail in a skill setup. A lockfile-backed
  project avoids relying on the cwd-sensitive auto-install path. [Bun auto-install](https://bun.com/docs/runtime/auto-install)
## §5 bunx

- Unpinned bunx has selected stale cached or global versions. A pinned isolated tool can lose
  globally installed plugins; pin the tool and plugins together in a project. Historical evidence:
  [Bun issue 4989](https://github.com/oven-sh/bun/issues/4989).
## Workspace boundaries

- In coralbase, ancestor dependency resolution caused a boundary test to pass falsely. A graph
  gate covered workspace dependencies and cycles. Out-of-package `imports` targets and accepted
  workspace cycles were observed there, but not confirmed by Bun documentation.
  [Module resolution](https://bun.com/docs/runtime/module-resolution),
  [workspaces](https://bun.com/docs/pm/workspaces).
