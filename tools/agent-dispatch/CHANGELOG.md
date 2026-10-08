# Changelog

## 1.1.2 — 2026-10-08

- Jev failures name their cause: the HTTP status and error message, or the transport error class, instead of a generic "socket connection was closed".
- `grade` records an automatic waiver naming the cause when Jev answers 401/402/403/429/5xx or is unreachable, so a dead key no longer leaves runs ungraded and gating; a 400/422 stays a hard failure.

## 1.1.1 — 2026-10-08

- Route Jev auto-picks through the official TypeSafe API.

## 1.1.0 — 2026-10-08

- Folded the Codex worker into agent-dispatch: removed the `codex-run` bin and moved the host declaration to `~/.config/agent-dispatch/host.toml`.

## 1.0.0 — 2026-10-07

- Moved from `agents/routing-control/`; behavior unchanged.
