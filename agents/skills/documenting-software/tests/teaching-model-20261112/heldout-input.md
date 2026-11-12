# Gatelet input facts

Gatelet is a fictional pure authorization evaluator used by applications. This file contains all
supported behavior. It does not imply a storage service, identity provider or enforcement gateway.

The caller supplies an already-authenticated subject, a resource's policy and a snapshot of that
subject's current grants. Authentication and grant issuance are application responsibilities.
The evaluator returns a boolean. A true result performs no file read, write or other external effect.
The application must check the decision where it performs the protected operation.

Read and write policies are separate lists of clauses. A list is OR; an empty list denies.
An Owner clause matches an explicit owner proof for that resource. A Grant(scope, mask) clause
matches one supplied grant if the scope is exactly equal and the bitwise mask intersection is
nonzero. This means any common bit, not possession of all bits in the clause mask. Bit meanings
are defined by the application. There is no implicit parent-folder inheritance and no deny clause.

The evaluator tries each supplied grant separately. A failed candidate does not cancel a successful
one. It never merges grants across different scopes into a new grant. Removing one grant need not
remove access if another valid grant independently permits the same operation. Decisions concern
the supplied snapshot; applications must reevaluate after their grant state changes. A grant-state
change does not erase data already obtained by the user. Gatelet does not revoke grants or retain
state between calls, and does not provide a subscription/cache-invalidation service.
