#!/usr/bin/env bun
/**
 * Single-writer checkpoint transaction for TASK-CONTINUATION.md.
 * A short exclusive lock plus revision/digest CAS prevents accidental stale overwrites.
 */

import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { cli } from "cleye";
import {
  err,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  type Result,
} from "neverthrow";
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

const captureAsync = async <T>(
  operation: () => Promise<T> | T,
): Promise<TransactionResult<T>> =>
  fromAsyncThrowable(async () => operation())().mapErr(() =>
    unexpectedFailure(),
  );

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

async function readRegularText(
  path: string,
  code: string,
): Promise<TransactionResult<string>> {
  type ReadOutcome = { safe: true; text: string } | { safe: false };
  const read = await fromAsyncThrowable(async (): Promise<ReadOutcome> => {
    const handle = await open(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    await using _closeHandle = {
      [Symbol.asyncDispose]: async () => {
        await handle.close();
      },
    };
    const stat = await handle.stat();
    return stat.isFile() && stat.size <= MAX_RECORD_BYTES
      ? { safe: true, text: await handle.readFile("utf8") }
      : { safe: false };
  })().mapErr(
    () => new TransactionError(code, "file could not be read safely"),
  );
  if (read.isErr()) return err(read.error);
  return read.value.safe
    ? ok(read.value.text)
    : failure(
        code,
        `file must be regular and at most ${MAX_RECORD_BYTES} bytes`,
      );
}

async function workspaceRoot(
  recordPath: string,
  slot?: string,
): Promise<TransactionResult<string>> {
  const found = await captureAsync(async () => {
    const fromSlot =
      slot === undefined
        ? undefined
        : continuationWorkspaceRootFromSlot(resolve(slot));
    return (
      fromSlot ?? (await continuationProjectRoot(dirname(resolve(recordPath))))
    );
  });
  if (found.isErr()) return err(found.error);
  return found.value === undefined
    ? failure("TCR23", "workspace root is not trustworthy")
    : ok(found.value);
}

async function snapshot(
  recordPath: string,
  root: string,
): Promise<TransactionResult<Snapshot>> {
  const path = resolve(recordPath);
  const inspected = await captureAsync(() =>
    inspectContinuationRecord(path, root),
  );
  if (inspected.isErr()) return err(inspected.error);
  const inspection = inspected.value;
  if (inspection.status === "absent") {
    return failure("TCR00", "record does not exist");
  }
  if (inspection.status === "invalid") {
    return failure(
      inspection.findings[0]?.code ?? "TCR49",
      inspection.findings.map((finding) => finding.message).join("; "),
    );
  }
  const read = await readRegularText(path, "TCR49");
  if (read.isErr()) return err(read.error);
  const text = read.value;
  const validated = await captureAsync(() =>
    validateContinuationRecord(text, path, root),
  );
  if (validated.isErr()) return err(validated.error);
  const findings = validated.value;
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
}

async function writerForBoundSlot(
  slotPath: string,
  recordPath: string,
): Promise<TransactionResult<string>> {
  const read = await captureAsync(() =>
    readContinuationBindingAtSlot(resolve(slotPath)),
  );
  if (read.isErr()) return err(read.error);
  const binding = read.value;
  if (binding?.status === "bound" && binding.record === resolve(recordPath)) {
    return ok(`session:${basename(dirname(binding.slot))}`);
  }
  return failure("TCR52", "writer slot is not validly bound to this record");
}

async function proposalText(
  proposalPath: string,
  recordPath: string,
): Promise<TransactionResult<string>> {
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
  const statResult = await fromAsyncThrowable(() => lstat(proposal))();
  if (statResult.isErr()) return failure("TCR49", "proposal does not exist");
  const stat = statResult.value;
  return stat.isSymbolicLink() || !stat.isFile()
    ? failure("TCR49", "proposal must be a regular file, never a symlink")
    : readRegularText(proposal, "TCR49");
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

async function validateProposal(
  current: Snapshot,
  proposal: string,
  root: string,
  handoffSlot?: string,
): Promise<TransactionResult<Readonly<{ revision: number; writer: string }>>> {
  const validated = await captureAsync(() =>
    validateContinuationRecord(proposal, current.path, root),
  );
  if (validated.isErr()) return err(validated.error);
  const findings = validated.value;
  if (findings.length > 0) {
    return failure(
      findings[0]?.code ?? "TCR49",
      findings.map((finding) => finding.message).join("; "),
    );
  }
  return validateProposalFields(current, proposal, handoffSlot);
}

async function validateProposalFields(
  current: Snapshot,
  proposal: string,
  handoffSlot?: string,
): Promise<TransactionResult<Readonly<{ revision: number; writer: string }>>> {
  for (const key of ["SCHEMA", "TASK_ID", "PATH"]) {
    const same = requireSameMetadata(current, proposal, key);
    if (same.isErr()) return err(same.error);
  }
  return validateProposalRevision(current, proposal, handoffSlot);
}

async function validateProposalRevision(
  current: Snapshot,
  proposal: string,
  handoffSlot?: string,
): Promise<TransactionResult<Readonly<{ revision: number; writer: string }>>> {
  const revisionResult = metadata(proposal, "REVISION");
  if (revisionResult.isErr()) return err(revisionResult.error);
  const revision = Number(revisionResult.value);
  if (revision !== current.revision + 1) {
    return failure(
      "TCR45",
      `proposal REVISION must be ${current.revision + 1}`,
    );
  }
  const updated = metadata(proposal, "UPDATED");
  if (updated.isErr()) return err(updated.error);
  const currentUpdated = metadata(current.text, "UPDATED");
  if (currentUpdated.isErr()) return err(currentUpdated.error);
  if (updated.value === currentUpdated.value) {
    return failure("TCR45", "proposal UPDATED must name this checkpoint");
  }
  return validateProposalWriter(current, revision, proposal, handoffSlot);
}

async function validateProposalWriter(
  current: Snapshot,
  revision: number,
  proposal: string,
  handoffSlot?: string,
): Promise<TransactionResult<Readonly<{ revision: number; writer: string }>>> {
  const writerResult = metadata(proposal, "WRITER");
  if (writerResult.isErr()) return err(writerResult.error);
  const writer = writerResult.value;
  if (writer === current.writer) return ok({ revision, writer });
  const stateResult = metadata(proposal, "STATE");
  if (stateResult.isErr()) return err(stateResult.error);
  const state = stateResult.value;
  if (writer === "none" && state === "closed") {
    return ok({ revision, writer });
  }
  const handoffDenied = () =>
    failure(
      "TCR48",
      "WRITER may change only through a pre-bound handoff or an atomic close",
    );
  if (handoffSlot === undefined || state === "closed") return handoffDenied();
  const target = await writerForBoundSlot(handoffSlot, current.path);
  if (target.isErr()) return err(target.error);
  return writer === target.value ? ok({ revision, writer }) : handoffDenied();
}

async function createProposal(
  path: string,
  output: string,
  text: string,
): Promise<TransactionResult<string>> {
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
  const written = await fromAsyncThrowable(() =>
    writeFile(proposal, text, { flag: "wx", mode: 0o600 }),
  )();
  return written.isErr()
    ? failure("TCR49", "proposal already exists or could not be created")
    : ok(proposal);
}

type CheckpointArgs = {
  baseRevision: number;
  baseSha256: string;
  handoffSlot?: string | undefined;
  path: string;
  proposal: string;
  writerSlot: string;
};

async function applyCheckpoint(
  args: CheckpointArgs,
): Promise<TransactionResult<void>> {
  const outcome = await fromAsyncThrowable(() =>
    applyCheckpointTransaction(args),
  )();
  if (outcome.isErr()) {
    return err(
      outcome.error instanceof TransactionError
        ? outcome.error
        : unexpectedFailure(),
    );
  }
  return outcome.value;
}

async function applyCheckpointTransaction(
  args: CheckpointArgs,
): Promise<TransactionResult<void>> {
  const path = resolve(args.path);
  const rootResult = await workspaceRoot(path, args.writerSlot);
  if (rootResult.isErr()) return err(rootResult.error);
  const root = rootResult.value;
  const callerResult = await writerForBoundSlot(args.writerSlot, path);
  if (callerResult.isErr()) return err(callerResult.error);
  const caller = callerResult.value;
  const lock = join(dirname(path), ".TASK-CONTINUATION.lock");
  let lockHeld = false;
  let temporary: string | undefined;

  // Disposal runs in reverse registration order, so the lock disposer is
  // registered first and fires second — matching the original finally's
  // temporary-then-lock cleanup order. The async stack is awaited at scope
  // exit, so the caller never returns before the unlinks finish.
  await using _cleanup = new AsyncDisposableStack();
  _cleanup.defer(async () => {
    if (lockHeld) {
      // Fail closed on the next update; stale locks require human inspection.
      await fromAsyncThrowable(() => unlink(lock))();
    }
  });
  _cleanup.defer(async () => {
    const leftover = temporary;
    if (leftover !== undefined) {
      // The randomized incomplete file is never a canonical record.
      await fromAsyncThrowable(() => unlink(leftover))();
    }
  });

  const lockWritten = await fromAsyncThrowable(() =>
    writeFile(
      lock,
      `${JSON.stringify({ pid: process.pid, started_at: Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }), transaction: randomUUID() })}\n`,
      { flag: "wx", mode: 0o600 },
    ),
  )();
  if (lockWritten.isErr()) {
    return failure(
      "TCR40",
      "checkpoint is locked; do not wait or reclaim automatically",
    );
  }
  lockHeld = true;

  const currentResult = await snapshot(path, root);
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

  const candidateTextResult = await proposalText(args.proposal, path);
  if (candidateTextResult.isErr()) return err(candidateTextResult.error);
  const candidateText = candidateTextResult.value;
  const candidateResult = await validateProposal(
    current,
    candidateText,
    root,
    args.handoffSlot,
  );
  if (candidateResult.isErr()) return err(candidateResult.error);
  const candidate = candidateResult.value;

  const recheckedResult = await snapshot(path, root);
  if (recheckedResult.isErr()) return err(recheckedResult.error);
  const rechecked = recheckedResult.value;
  if (
    rechecked.revision !== current.revision ||
    rechecked.sha256 !== current.sha256
  ) {
    return failure("TCR43", "record changed while the checkpoint was prepared");
  }

  temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  const mode = (await lstat(path)).mode & 0o777;
  await writeFile(temporary, candidateText, { flag: "wx", mode });
  const handle = await open(temporary, constants.O_RDONLY);
  await using _closeHandle = {
    [Symbol.asyncDispose]: async () => {
      await handle.close();
    },
  };
  await handle.sync();
  await rename(temporary, path);
  temporary = undefined;

  const proposalRemoved = await unlink(resolve(args.proposal)).then(
    () => true,
    () => false,
  );
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

async function main(): Promise<TransactionResult<void>> {
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
  const options = optionalPositiveInteger(parsed.flags.baseRevision).andThen(
    (baseRevision) =>
      optionalSha256(parsed.flags.baseSha256).andThen((baseSha256) =>
        optionalNonEmpty(parsed.flags.handoffSlot).andThen((handoffSlot) =>
          optionalNonEmpty(parsed.flags.path).andThen((path) =>
            optionalNonEmpty(parsed.flags.proposal).andThen((proposal) =>
              optionalNonEmpty(parsed.flags.writerSlot).map((writerSlot) => ({
                parsed,
                baseRevision,
                baseSha256,
                handoffSlot,
                path,
                proposal,
                writerSlot,
              })),
            ),
          ),
        ),
      ),
  );
  if (options.isErr()) return err(options.error);
  return dispatchCheckpoint(options.value);
}

async function dispatchCheckpoint(args: {
  parsed: { _: { length: number; action: string } };
  baseRevision: number | undefined;
  baseSha256: string | undefined;
  handoffSlot: string | undefined;
  path: string | undefined;
  proposal: string | undefined;
  writerSlot: string | undefined;
}): Promise<TransactionResult<void>> {
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
    const rootResult = await workspaceRoot(path, args.writerSlot);
    if (rootResult.isErr()) return err(rootResult.error);
    const current = await snapshot(path, rootResult.value);
    if (current.isErr()) return err(current.error);
    const created: TransactionResult<string | undefined> =
      args.proposal === undefined
        ? ok(undefined)
        : await createProposal(path, args.proposal, current.value.text);
    if (created.isErr()) return err(created.error);
    const proposal = created.value;
    process.stdout.write(
      `${JSON.stringify({
        path: current.value.path,
        proposal,
        revision: current.value.revision,
        sha256: current.value.sha256,
        status: "snapshot",
        writer: current.value.writer,
      })}\n`,
    );
    return ok(undefined);
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

const mainResult = await main().catch((error: unknown) =>
  err(error instanceof TransactionError ? error : unexpectedFailure()),
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
