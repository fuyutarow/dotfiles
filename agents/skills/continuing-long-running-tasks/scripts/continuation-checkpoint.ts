/**
 * Single-writer checkpoint transaction for TASK-CONTINUATION.md.
 * A short exclusive lock plus revision/digest CAS prevents accidental stale overwrites.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { cli } from "cleye";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import {
  continuationProjectRoot,
  continuationWorkspaceRootFromSlot,
  inspectContinuationRecord,
  MAX_RECORD_BYTES,
  readContinuationBindingAtSlot,
  validateContinuationRecord,
} from "./continuation-record";

type Snapshot = Readonly<{
  path: string;
  revision: number;
  sha256: string;
  text: string;
  writer: string;
}>;

class TransactionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

type TransactionResult<T> = Result<T, TransactionError>;

const failure = (
  code: string,
  message: string,
  exitCode = 1,
): TransactionResult<never> =>
  err(new TransactionError(code, message, exitCode));

const unexpectedFailure = (): TransactionError =>
  new TransactionError("TCR51", "checkpoint transaction failed", 2);

const capture = <T>(operation: () => T): TransactionResult<T> =>
  fromThrowable(operation)().mapErr(() => unexpectedFailure());

function nonEmpty(value: string): TransactionResult<string> {
  return value === "" ? failure("TCR39", "empty option", 2) : ok(value);
}

function positiveInteger(value: string): TransactionResult<number> {
  if (!/^[1-9]\d*$/u.test(value)) {
    return failure("TCR39", "--base-revision requires a positive integer", 2);
  }
  return ok(Number(value));
}

function sha256Value(value: string): TransactionResult<string> {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    return failure(
      "TCR39",
      "--base-sha256 requires 64 lowercase hex characters",
      2,
    );
  }
  return ok(value);
}

function metadata(text: string, key: string): TransactionResult<string> {
  const values = [...text.matchAll(new RegExp(`^${key}:\\s*(.*)$`, "gmu"))].map(
    (match) => match[1]?.trim() ?? "",
  );
  const only = values[0];
  if (values.length !== 1 || only === undefined || only === "") {
    return failure("TCR49", `${key} metadata is not singular`);
  }
  return ok(only);
}

function digest(text: string): TransactionResult<string> {
  return capture(() => createHash("sha256").update(text).digest("hex"));
}

function readRegularText(
  path: string,
  code: string,
): TransactionResult<string> {
  type ReadOutcome = { safe: true; text: string } | { safe: false };
  const result = fromThrowable((): ReadOutcome => {
    const descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    using _closeDescriptor = {
      [Symbol.dispose]: () => {
        closeSync(descriptor);
      },
    };
    const stat = fstatSync(descriptor);
    return stat.isFile() && stat.size <= MAX_RECORD_BYTES
      ? { safe: true, text: readFileSync(descriptor, "utf8") }
      : { safe: false };
  })().mapErr(
    () => new TransactionError(code, "file could not be read safely"),
  );
  return result.andThen((file) =>
    file.safe
      ? ok(file.text)
      : failure(
          code,
          `file must be regular and at most ${MAX_RECORD_BYTES} bytes`,
        ),
  );
}

function workspaceRoot(
  recordPath: string,
  slot?: string,
): TransactionResult<string> {
  return capture(() => {
    const fromSlot =
      slot === undefined
        ? undefined
        : continuationWorkspaceRootFromSlot(resolve(slot));
    return fromSlot ?? continuationProjectRoot(dirname(resolve(recordPath)));
  }).andThen((root) =>
    root === undefined
      ? failure("TCR23", "workspace root is not trustworthy")
      : ok(root),
  );
}

function snapshot(
  recordPath: string,
  root: string,
): TransactionResult<Snapshot> {
  const path = resolve(recordPath);
  return capture(() => inspectContinuationRecord(path, root)).andThen(
    (inspection) => {
      if (inspection.status === "absent") {
        return failure("TCR00", "record does not exist");
      }
      if (inspection.status === "invalid") {
        return failure(
          inspection.findings[0]?.code ?? "TCR49",
          inspection.findings.map((finding) => finding.message).join("; "),
        );
      }
      return readRegularText(path, "TCR49").andThen((text) =>
        capture(() => validateContinuationRecord(text, path, root)).andThen(
          (findings) => {
            if (findings.length > 0) {
              return failure(
                findings[0]?.code ?? "TCR49",
                findings.map((finding) => finding.message).join("; "),
              );
            }
            return metadata(text, "REVISION").andThen((revision) =>
              metadata(text, "WRITER").andThen((writer) =>
                digest(text).map((sha256) => ({
                  path,
                  revision: Number(revision),
                  sha256,
                  text,
                  writer,
                })),
              ),
            );
          },
        ),
      );
    },
  );
}

function writerForBoundSlot(
  slotPath: string,
  recordPath: string,
): TransactionResult<string> {
  type SlotBinding = NonNullable<
    ReturnType<typeof readContinuationBindingAtSlot>
  >;
  type BindingOutcome =
    { bound: true; binding: SlotBinding } | { bound: false };
  return fromThrowable((): BindingOutcome => {
    const binding = readContinuationBindingAtSlot(resolve(slotPath));
    if (binding?.status === "bound" && binding.record === resolve(recordPath)) {
      return { bound: true, binding };
    }
    return { bound: false };
  })()
    .mapErr(() => unexpectedFailure())
    .andThen((value) =>
      value.bound
        ? ok(`session:${basename(dirname(value.binding.slot))}`)
        : failure("TCR52", "writer slot is not validly bound to this record"),
    );
}

function proposalText(
  proposalPath: string,
  recordPath: string,
): TransactionResult<string> {
  const proposal = resolve(proposalPath);
  if (
    proposal === resolve(recordPath) ||
    dirname(proposal) !== dirname(recordPath)
  ) {
    return failure(
      "TCR49",
      "proposal must be a distinct regular file beside the canonical record",
    );
  }
  return fromThrowable(() => lstatSync(proposal))()
    .mapErr(() => new TransactionError("TCR49", "proposal does not exist"))
    .andThen((stat) =>
      stat.isSymbolicLink() || !stat.isFile()
        ? failure("TCR49", "proposal must be a regular file, never a symlink")
        : readRegularText(proposal, "TCR49"),
    );
}

function requireSameMetadata(
  current: Snapshot,
  proposal: string,
  key: string,
): TransactionResult<void> {
  return metadata(current.text, key).andThen((currentValue) =>
    metadata(proposal, key).andThen((proposalValue) =>
      currentValue === proposalValue
        ? ok(undefined)
        : failure("TCR46", `${key} is immutable`),
    ),
  );
}

function validateProposal(
  current: Snapshot,
  proposal: string,
  root: string,
  handoffSlot?: string,
): TransactionResult<Readonly<{ revision: number; writer: string }>> {
  return capture(() =>
    validateContinuationRecord(proposal, current.path, root),
  ).andThen((findings) => {
    if (findings.length > 0) {
      return failure(
        findings[0]?.code ?? "TCR49",
        findings.map((finding) => finding.message).join("; "),
      );
    }
    return validateProposalFields(current, proposal, handoffSlot);
  });
}

function validateProposalFields(
  current: Snapshot,
  proposal: string,
  handoffSlot?: string,
): TransactionResult<Readonly<{ revision: number; writer: string }>> {
  return requireSameMetadata(current, proposal, "SCHEMA").andThen(() =>
    requireSameMetadata(current, proposal, "TASK_ID").andThen(() =>
      requireSameMetadata(current, proposal, "PATH").andThen(() =>
        validateProposalRevision(current, proposal, handoffSlot),
      ),
    ),
  );
}

function validateProposalRevision(
  current: Snapshot,
  proposal: string,
  handoffSlot?: string,
): TransactionResult<Readonly<{ revision: number; writer: string }>> {
  return metadata(proposal, "REVISION").andThen((revisionText) => {
    const revision = Number(revisionText);
    if (revision !== current.revision + 1) {
      return failure(
        "TCR45",
        `proposal REVISION must be ${current.revision + 1}`,
      );
    }
    return metadata(proposal, "UPDATED").andThen((updated) =>
      metadata(current.text, "UPDATED").andThen((currentUpdated) =>
        updated === currentUpdated
          ? failure("TCR45", "proposal UPDATED must name this checkpoint")
          : validateProposalWriter(current, revision, proposal, handoffSlot),
      ),
    );
  });
}

function validateProposalWriter(
  current: Snapshot,
  revision: number,
  proposal: string,
  handoffSlot?: string,
): TransactionResult<Readonly<{ revision: number; writer: string }>> {
  return metadata(proposal, "WRITER").andThen((writer) => {
    if (writer === current.writer) return ok({ revision, writer });
    return metadata(proposal, "STATE").andThen((state) => {
      if (writer === "none" && state === "closed") {
        return ok({ revision, writer });
      }
      if (handoffSlot === undefined || state === "closed") {
        return failure(
          "TCR48",
          "WRITER may change only through a pre-bound handoff or an atomic close",
        );
      }
      return writerForBoundSlot(handoffSlot, current.path).andThen(
        (targetWriter) =>
          writer === targetWriter
            ? ok({ revision, writer })
            : failure(
                "TCR48",
                "WRITER may change only through a pre-bound handoff or an atomic close",
              ),
      );
    });
  });
}

function createProposal(
  path: string,
  output: string,
  text: string,
): TransactionResult<string> {
  const proposal = resolve(output);
  if (
    proposal === resolve(path) ||
    dirname(proposal) !== dirname(resolve(path))
  ) {
    return failure(
      "TCR49",
      "proposal must be a distinct file beside the canonical record",
    );
  }
  return fromThrowable(() => {
    writeFileSync(proposal, text, { flag: "wx", mode: 0o600 });
  })()
    .mapErr(
      () =>
        new TransactionError(
          "TCR49",
          "proposal already exists or could not be created",
        ),
    )
    .map(() => proposal);
}

type CheckpointArgs = {
  baseRevision: number;
  baseSha256: string;
  handoffSlot?: string | undefined;
  path: string;
  proposal: string;
  writerSlot: string;
};

function applyCheckpoint(args: CheckpointArgs): TransactionResult<void> {
  return fromThrowable(() => applyCheckpointTransaction(args))()
    .andThen((result) => result)
    .mapErr((error) =>
      error instanceof TransactionError ? error : unexpectedFailure(),
    );
}

function applyCheckpointTransaction(
  args: CheckpointArgs,
): TransactionResult<void> {
  const path = resolve(args.path);
  const rootResult = workspaceRoot(path, args.writerSlot);
  if (rootResult.isErr()) return err(rootResult.error);
  const root = rootResult.value;
  const callerResult = writerForBoundSlot(args.writerSlot, path);
  if (callerResult.isErr()) return err(callerResult.error);
  const caller = callerResult.value;
  const lock = join(dirname(path), ".TASK-CONTINUATION.lock");
  let lockHeld = false;
  let temporary: string | undefined;

  // Disposal runs in reverse registration order, so the lock disposer is
  // registered first and fires second — matching the original finally's
  // temporary-then-lock cleanup order.
  using _cleanup = new DisposableStack();
  _cleanup.defer(() => {
    if (lockHeld) {
      // Fail closed on the next update; stale locks require human inspection.
      fromThrowable(() => {
        unlinkSync(lock);
      })();
    }
  });
  _cleanup.defer(() => {
    if (temporary !== undefined) {
      // The randomized incomplete file is never a canonical record.
      const leftover = temporary;
      fromThrowable(() => {
        unlinkSync(leftover);
      })();
    }
  });

  const lockWritten = fromThrowable(() => {
    writeFileSync(
      lock,
      `${JSON.stringify({ pid: process.pid, started_at: Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }), transaction: randomUUID() })}\n`,
      { flag: "wx", mode: 0o600 },
    );
  })();
  if (lockWritten.isErr()) {
    return failure(
      "TCR40",
      "checkpoint is locked; do not wait or reclaim automatically",
    );
  }
  lockHeld = true;

  const currentResult = snapshot(path, root);
  if (currentResult.isErr()) return err(currentResult.error);
  const current = currentResult.value;
  if (current.revision !== args.baseRevision) {
    return failure(
      "TCR42",
      `base revision is stale; current is ${current.revision}`,
    );
  }
  if (current.sha256 !== args.baseSha256) {
    return failure("TCR43", "base digest is stale");
  }
  if (current.writer !== caller) {
    return failure(
      "TCR44",
      `caller is ${caller}, record writer is ${current.writer}`,
    );
  }

  const candidateTextResult = proposalText(args.proposal, path);
  if (candidateTextResult.isErr()) return err(candidateTextResult.error);
  const candidateText = candidateTextResult.value;
  const candidateResult = validateProposal(
    current,
    candidateText,
    root,
    args.handoffSlot,
  );
  if (candidateResult.isErr()) return err(candidateResult.error);
  const candidate = candidateResult.value;

  const recheckedResult = snapshot(path, root);
  if (recheckedResult.isErr()) return err(recheckedResult.error);
  const rechecked = recheckedResult.value;
  if (
    rechecked.revision !== current.revision ||
    rechecked.sha256 !== current.sha256
  ) {
    return failure("TCR43", "record changed while the checkpoint was prepared");
  }

  temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  const mode = lstatSync(path).mode & 0o777;
  writeFileSync(temporary, candidateText, { flag: "wx", mode });
  const descriptor = openSync(temporary, constants.O_RDONLY);
  using _closeDescriptor = {
    [Symbol.dispose]: () => {
      closeSync(descriptor);
    },
  };
  fsyncSync(descriptor);
  renameSync(temporary, path);
  temporary = undefined;

  const proposalRemoved = fromThrowable(() => {
    unlinkSync(resolve(args.proposal));
  })().isOk();
  const sha256Result = digest(candidateText);
  if (sha256Result.isErr()) return err(sha256Result.error);
  process.stdout.write(
    `${JSON.stringify({
      path,
      proposal_removed: proposalRemoved,
      revision: candidate.revision,
      sha256: sha256Result.value,
      status: "applied",
      writer: candidate.writer,
    })}\n`,
  );
  return ok(undefined);
}

function optionalNonEmpty(
  value: string | undefined,
): TransactionResult<string | undefined> {
  return value === undefined ? ok(undefined) : nonEmpty(value);
}

function optionalPositiveInteger(
  value: string | undefined,
): TransactionResult<number | undefined> {
  return value === undefined ? ok(undefined) : positiveInteger(value);
}

function optionalSha256(
  value: string | undefined,
): TransactionResult<string | undefined> {
  return value === undefined ? ok(undefined) : sha256Value(value);
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

function main(): TransactionResult<void> {
  const parsed = cli(
    {
      name: "continuation-checkpoint.ts",
      parameters: ["<action>"],
      flags: {
        baseRevision: String,
        baseSha256: String,
        handoffSlot: String,
        path: String,
        proposal: String,
        writerSlot: String,
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  return optionalPositiveInteger(parsed.flags.baseRevision).andThen(
    (baseRevision) =>
      optionalSha256(parsed.flags.baseSha256).andThen((baseSha256) =>
        optionalNonEmpty(parsed.flags.handoffSlot).andThen((handoffSlot) =>
          optionalNonEmpty(parsed.flags.path).andThen((path) =>
            optionalNonEmpty(parsed.flags.proposal).andThen((proposal) =>
              optionalNonEmpty(parsed.flags.writerSlot).andThen((writerSlot) =>
                dispatchCheckpoint({
                  parsed,
                  baseRevision,
                  baseSha256,
                  handoffSlot,
                  path,
                  proposal,
                  writerSlot,
                }),
              ),
            ),
          ),
        ),
      ),
  );
}

function dispatchCheckpoint(args: {
  parsed: { _: { length: number; action: string } };
  baseRevision: number | undefined;
  baseSha256: string | undefined;
  handoffSlot: string | undefined;
  path: string | undefined;
  proposal: string | undefined;
  writerSlot: string | undefined;
}): TransactionResult<void> {
  const { parsed } = args;
  if (parsed._.length !== 1) {
    return failure(
      "TCR39",
      "expected exactly one action: snapshot or apply",
      2,
    );
  }
  const action = parsed._.action;
  const path = args.path;
  if (path === undefined) {
    return failure("TCR39", "required option: --path", 2);
  }

  if (action === "snapshot") {
    return workspaceRoot(path, args.writerSlot).andThen((root) =>
      snapshot(path, root).andThen((current) => {
        const proposalResult: TransactionResult<string | undefined> =
          args.proposal === undefined
            ? ok(undefined)
            : createProposal(path, args.proposal, current.text);
        return proposalResult.andThen((proposal) => {
          process.stdout.write(
            `${JSON.stringify({
              path: current.path,
              proposal,
              revision: current.revision,
              sha256: current.sha256,
              status: "snapshot",
              writer: current.writer,
            })}\n`,
          );
          return ok(undefined);
        });
      }),
    );
  }

  if (action !== "apply") {
    return failure("TCR39", `unknown action: ${action}`, 2);
  }
  const { baseRevision, baseSha256, proposal, writerSlot } = args;
  if (
    baseRevision === undefined ||
    baseSha256 === undefined ||
    proposal === undefined ||
    writerSlot === undefined
  ) {
    return failure(
      "TCR39",
      "apply requires --base-revision, --base-sha256, --proposal, and --writer-slot",
      2,
    );
  }
  return applyCheckpoint({
    baseRevision,
    baseSha256,
    handoffSlot: args.handoffSlot,
    path,
    proposal,
    writerSlot,
  });
}

const mainResult = fromThrowable(main)()
  .andThen((result) => result)
  .mapErr((error) =>
    error instanceof TransactionError ? error : unexpectedFailure(),
  );
mainResult.match(
  () => process.exit(0),
  (error) => {
    process.stderr.write(
      `${JSON.stringify({ code: error.code, message: error.message, status: "error" })}\n`,
    );
    process.exit(error.exitCode);
  },
);
