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
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const match = line.match(/^([A-Z][A-Z0-9_]*):\s*(.*)$/);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      const key = match[1];
      if (fields.has(key))
        addFinding(
          findings,
          "RR002",
          path,
          `duplicate key ${key} at line ${index + 1}`,
        );
      else fields.set(key, match[2].trim());
      continue;
    }
    if (
      line.trim() !== "" &&
      !/^\s*#{1,6}\s+/.test(line) &&
      !/^\s*\|.*\|\s*$/.test(line)
    )
      addFinding(
        findings,
        "RR015",
        path,
        `unrecognized content at line ${index + 1}; use key: value rows and the PROCESS LENSES table`,
      );
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
): Promise<Uint8Array> {
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
    throw new Error(`packet exceeds ${MAX_PACKET_BYTES} bytes while reading`);
  return buffer.subarray(0, offset);
}

export async function loadPacket(
  path: string,
  kind: PacketKind,
  findings: Finding[],
): Promise<LoadedPacket> {
  const resolved = resolve(path);
  let initialMetadata: ReturnType<typeof lstatSync>;
  let canonicalPath: string;
  try {
    initialMetadata = lstatSync(resolved);
    canonicalPath = realpathSync(resolved);
  } catch (error) {
    throw new Error(
      `cannot inspect ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (initialMetadata.isSymbolicLink() || canonicalPath !== resolved)
    throw new Error(`symlink inputs are refused: ${path}`);
  if (!initialMetadata.isFile()) throw new Error(`not a regular file: ${path}`);
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(
      resolved,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
  } catch (error) {
    throw new Error(
      `cannot open ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    const metadata = await handle.stat();
    if (
      metadata.dev !== initialMetadata.dev ||
      metadata.ino !== initialMetadata.ino
    )
      throw new Error(`input changed during inspection: ${path}`);
    if (!metadata.isFile()) throw new Error(`not a regular file: ${path}`);
    if (metadata.size > MAX_PACKET_BYTES)
      throw new Error(
        `packet exceeds ${MAX_PACKET_BYTES} bytes: ${path} (${metadata.size})`,
      );
    const bytes = await readBounded(handle);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return {
      digest: sha256(bytes),
      fields: parseFields(text, resolved, kind, findings),
      kind,
      path: resolved,
      text,
    };
  } finally {
    await handle.close();
  }
}
