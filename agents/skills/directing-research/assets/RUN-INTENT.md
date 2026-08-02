# RUN INTENT

<!--
Copy this template once for each admitted in-scope research run. Replace every
angle-bracket placeholder, then freeze the whole file before observation, data
access, execution, or unblinding. Its SHA-256 over the exact file bytes is the
identity cited by the terminal RUN RECEIPT.

PRECOMMITMENT_LOCUS points to the domain owner's prediction/threshold artifact;
it does not duplicate or revise that artifact. Store locators and digests, not
raw transcripts, prompts, private reasoning, credentials, or secret values.
-->

SCHEMA: research-run-intent/v1
RUN_ID: <stable-run-id>
PROGRAMME_OR_QUESTION_LOCUS: <programme-or-question-locus>
REGISTERED_AT: <RFC3339-timestamp-before-access>
ACCESS_BOUNDARY: <what-observation-access-execution-or-unblinding-starts-the-run>
PRECOMMITMENT_LOCUS: <domain-owned-precommitment-locus>
PRECOMMITMENT_SHA256: <lowercase-64-hex-sha256>
DENOMINATOR_MEMBERSHIP: <declared-candidate-run-seed-analysis-membership>
ACTOR_OVERLAY_LOCUS: <orchestration-overlay-or-solo-actor-record-locus>
ACTOR_OVERLAY_SHA256: <lowercase-64-hex-sha256>
EVIDENCE_SINK: <where-the-terminal-observation-will-be-captured>
PRIVACY_CLASS: <repository-defined-privacy-class>
RETENTION_CLASS: <repository-defined-retention-class>
REGISTERED_EXPECTATION: <prediction-fixed-before-access>
DISCRIMINATING_OUTCOMES: <outcomes-that-distinguish-live-alternatives>
NEXT_ACTIONS_BY_OUTCOME: <prospective-outcome-to-action-map>
