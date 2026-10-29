# `disk free targets mise-configs`

Delegates the existing `mise prune --configs` operation as one target item. It rechecks eligible metadata and its identity under the reclaim lock, records the operation, and reports before/after statfs measurements. Counts refer to target items; backend metadata counts remain in item detail. Per-record selection is a follow-up; this command retains the bulk operation's scope.
