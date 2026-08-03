# SECTION_MANDATE: [mandate-id]

- Schema / issue / snapshot revision / fence: [section-mandate/v3 | issue-id | integer | token]
- Programme decision: [locus + sha256]
- Exact lineage: [Goal locus+sha256; OBJECTIVE_ID; SUCCESS_OBSERVABLE_ID; Snapshot locus+sha256; Issue locus+sha256]
- Director identity / immutable role grant: [...]
- Granted scope: [issue boundary and expected observable only]
- Comparator / horizon / scaling regime: [...]
- Programme dominance/eligibility release: [upstream receipt locus+sha256 and PROGRAMME_DECISION; NONE means BLOCKED]
- Resource/safety constraints and expiry: [...]
- Event-woken lease: [leaseId; startedAt; expiresAt; firstIntentDueAt <= min(startedAt+30m, 20% of lease); maxControlEventsBeforeIntent=0..2; maxProposalEventsBeforeIntent=0..1]
- Scientific action interface: [allowedActionClasses nonempty subset of `PROOF|BUILD|EXPERIMENT|MEASUREMENT`; terminalTarget=`PROOF_RECEIPT|RUN_RECEIPT|KILL_RECEIPT|EXACT_BLOCKER`]
- Required return: [allowlisted `SECTION_SIGNAL` fields and review event]
- Explicit non-grants: no programme mutation; no programme decision; no supervisor role switch
- Local method/protocol/candidate authority: owned by `directing-research-sections`, not specified here
- Section sequence: [current Goal→Programme→Issue→Mandate lineage -> Director-owned SECTION_CHARTER -> Section-owned GROUNDING_PACKET exact-joined to Charter -> candidate genesis/search/admission]
- Local scale release: [not granted here; `SECTION_DIRECTOR_COMMIT` alone releases minimal-to-escalated scale inside this released mandate]
- Stalled lease: [only Programme `PROGRAMME_DECISION` may release/pause/reopen; no named Director dispatch]
- Signer: [programme-supervisor identity]
