# C2 fixture provenance

`agx-c2-1.4.0.json` records the repository-pinned agx 1.4.0 command:

```sh
AGX_STATE_DIR="$fixture/state" XDG_STATE_HOME="$fixture/xdg" mise -C "$PWD" exec -- agx worker ls --json
```

Captured on 2026-10-24 with a new temporary state directory. Four synthetic,
ended runs cover reported cumulative progress, real zero counts with unreported
optional values, missing progress, and rejected invalid progress. The producer's
own listing-progress test supplied the isolated-state setup pattern. Only paths,
the temporary workspace basename, and the fixture process ID were normalized to
`/fixture/c2`, `c2`, and `4242`; progress and listing values were left intact.
The private setup script lived in `/tmp/sep-capture.ts`; no private writer schema
or fixture-state generator is retained in dotfiles production code.

Tests separately vary the returned public row's state and nullable counters to
exercise live display and forward compatibility. Historical marker/sidecar
strings in older display fixtures remain test inputs only; their adapter emits
inline C2 progress rather than production code reading those files.
