# GROUNDING PACKET

SCHEMA: research-section-grounding-packet/v1
PACKET_ID: <stable-id>
GOAL_CONSTITUTION_LOCUS: <locator>
GOAL_CONSTITUTION_SHA256: <lowercase-64-hex>
OBJECTIVE_ID: <stable-objective-id>
SUCCESS_OBSERVABLE_ID: <stable-observable-id>
PROGRAMME_SNAPSHOT_LOCUS: <locator>
PROGRAMME_SNAPSHOT_SHA256: <lowercase-64-hex>
OPEN_ISSUE_LOCUS: <locator>
OPEN_ISSUE_SHA256: <lowercase-64-hex>
SECTION_MANDATE_LOCUS: <locator>
SECTION_MANDATE_SHA256: <lowercase-64-hex>
SECTION_CHARTER_LOCUS: <locator>
SECTION_CHARTER_SHA256: <lowercase-64-hex>
SECTION_CHARTER_REVISION: <integer>
QUERY_DENOMINATOR: <bounded query set and coverage denominator>
CANONICAL_COVERAGE: <canonical sources/results locators>
ALTERNATE_COVERAGE: <credible alternate sources/results locators>
RETRACTION_COVERAGE: <retraction/correction checks and loci>
KNOWN_RESULTS: <bounded result IDs plus dispositions>
FRONTIER: <current unresolved relation>
KNOWN_RESULT: <true|false; false iff disposition is NOVEL_GAP>
KNOWN_RESULT_DISPOSITION: <NOVEL_GAP|REGISTERED_REPLICATION|KNOWN_DUPLICATE|RETRACTION_RISK>
GROUNDING_REVISION: <integer>
GROUNDING_FENCE: <opaque-token>
STALE_AFTER: <event or RFC3339>
GROUNDER_INSTANCE_ID: <ephemeral distinct instance>
GROUNDER_ROLE_GRANT: <one-shot grounder grant>
GROUNDER_PROVENANCE: <queries, source loci, timestamp>

<!-- Grounder is ephemeral and role-distinct from searcher, builder, executor, learner, and Director.
It is never always hot and cannot admit, build, execute, observe, learn, or commit. -->
