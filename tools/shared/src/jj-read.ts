// Avoid routine snapshot/import/export and divergent-operation reconciliation.
// These flags are NOT a write barrier: readonlyCommand supplies kernel denial.
export const JJ_READ_ARGS = ["--ignore-working-copy", "--at-operation=@"];
