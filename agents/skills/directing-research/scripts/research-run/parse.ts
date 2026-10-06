import { constants, lstatSync, realpathSync } from "node:fs";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import {
  addFinding,
  CONTROL_ARTIFACT,
  type Finding,
  type LoadedPacket,
  MAX_PACKET_BYTES,
  type PacketKind,
  PRIVATE_REASONING,
  RECEIPT_INTERPRETATION,
  SCALAR_CREATIVITY,
  SECRET_PATTERNS,
  sha256,
  withoutComments,
} from "./model";

function parseFields(
  text: string,
  path: string,
  kind: PacketKind,
  findings: Finding[],
): ReadonlyMap<string, string> {
  const content = withoutComments(text);
  if (PRIVATE_REASONING.test(content) || CONTROL_ARTIFACT.test(content))
    addFinding(
      findings,
      "RR008",
      path,
      "raw reasoning, transcript, prompt, or control text is forbidden",
    );
  if (SECRET_PATTERNS.some((pattern) => pattern.test(content)))
    addFinding(
      findings,
      "RR008",
      path,
      "probable credential material detected; use a redacted locator",
    );
  if (SCALAR_CREATIVITY.test(content))
    addFinding(
      findings,
      "RR009",
      path,
      "scalar creativity scores are forbidden; preserve typed process lenses",
    );
  const fields = new Map<string, string>();
  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    const match = line.match(/^([A-Z][A-Z0-9_]*):\s*(.*)$/u);
    if (
      match === null &&
      line.trim() !== "" &&
      !/^\s*#{1,6}\s+/u.test(line) &&
      !/^\s*\|.*\|\s*$/u.test(line)
    )
      addFinding(
        findings,
        "RR015",
        path,
        `unrecognized content at line ${index + 1}; use key: value rows and the PROCESS LENSES table`,
      );
    if (match === null) continue;
    const key = match[1] ?? "";
    const value = match[2] ?? "";
    if (fields.has(key))
      addFinding(
        findings,
        "RR002",
        path,
        `duplicate key ${key} at line ${index + 1}`,
      );
    else fields.set(key, value.trim());
  }
  if (
    kind === "receipt" &&
    RECEIPT_INTERPRETATION.test(fields.get("FAILURE_OR_EXCLUSION_REASON") ?? "")
  )
    addFinding(
      findings,
      "RR014",
      path,
      "receipt contains a bounded interpretation phrase; move claims to RETROSPECTIVE JUDGMENT",
    );
  return fields;
}

async function readBounded(
  handle: Awaited<ReturnType<typeof open>>,
): Promise<{ ok: true; value: Uint8Array } | { ok: false; error: string }> {
  const buffer = Buffer.allocUnsafe(MAX_PACKET_BYTES + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      buffer.length - offset,
      offset,
    );
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset > MAX_PACKET_BYTES)
    return {
      ok: false,
      error: `packet exceeds ${MAX_PACKET_BYTES} bytes while reading`,
    };
  return { ok: true, value: buffer.subarray(0, offset) };
}

export async function loadPacket(
  path: string,
  kind: PacketKind,
  findings: Finding[],
): Promise<{ ok: true; value: LoadedPacket } | { ok: false; error: string }> {
  const resolved = resolve(path);
  const inspected = await Promise.try(() => {
    const metadata = lstatSync(resolved);
    return { canonicalPath: realpathSync(resolved), initialMetadata: metadata };
  }).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({
      ok: false as const,
      error: `cannot inspect ${path}: ${error instanceof Error ? error.message : String(error)}`,
    }),
  );
  if (!inspected.ok) return inspected;
  const { canonicalPath, initialMetadata } = inspected.value;
  if (initialMetadata.isSymbolicLink() || canonicalPath !== resolved)
    return { ok: false, error: `symlink inputs are refused: ${path}` };
  if (!initialMetadata.isFile())
    return { ok: false, error: `not a regular file: ${path}` };
  const opened = await Promise.try(() =>
    open(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)),
  ).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({
      ok: false as const,
      error: `cannot open ${path}: ${error instanceof Error ? error.message : String(error)}`,
    }),
  );
  if (!opened.ok) return opened;
  await using handle = opened.value;
  const metadata = await handle.stat();
  if (
    metadata.dev !== initialMetadata.dev ||
    metadata.ino !== initialMetadata.ino
  )
    return { ok: false, error: `input changed during inspection: ${path}` };
  if (!metadata.isFile())
    return { ok: false, error: `not a regular file: ${path}` };
  if (metadata.size > MAX_PACKET_BYTES)
    return {
      ok: false,
      error: `packet exceeds ${MAX_PACKET_BYTES} bytes: ${path} (${metadata.size})`,
    };
  const read = await readBounded(handle);
  if (!read.ok) return read;
  const bytes = read.value;
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return {
    ok: true,
    value: {
      digest: sha256(bytes),
      fields: parseFields(text, resolved, kind, findings),
      kind,
      path: resolved,
      text,
    },
  };
}
