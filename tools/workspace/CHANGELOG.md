# Changelog

## 0.1.1 — 2026-10-16

- Trust workspace mise configs before readiness so sandboxed workers can use them without writing mise trust state.

## 0.1.0 — 2026-10-16

- Add ws, the run-workspace lifecycle tool: add creates <repo>.ws/ws_<slug> and runs the repo's readiness commands, rm refuses an unlanded change, gc collects only terminal agx lineages with no live pid and no unlanded change; it keeps no state of its own.
