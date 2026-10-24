# C5 routing statistics fixture

Recorded on 2026-10-24 from the dotfiles agx 1.5.0 pin with:

```sh
mise -C "$PWD" exec -- agx worker stats --routing --window 24h
```

The release emits JSON without `--json`; that flag exits 1. The corresponding
public contract is `tools/agx-worker/contract.md`, “Routing statistics (schema 1)”,
read at agx trunk revision `f8b5feb6c19d46d3de3bcf822f5f1bd2391a76af`.

The unmodified recording has unknown Codex capability. Tests derive count, host,
null and failure variants from this response. The `state: available` variant is
synthetic and explicitly required by coordinator decision Continuation 1 of
SEP-G4B-ROUTING-CONTRACT-1024. It is not a claim that 1.5.0 reports affirmative
capability. Configuration, executable presence and subscription permission never
substitute for affirmative capability. Unknown and unavailable suppress the warning.
