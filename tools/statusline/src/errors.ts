// The statusline's one error vocabulary. A reading that cannot be shown is one of these, never a
// bare string: the renderer decides what to draw from the tag, not by sniffing the text (the
// GPU row once rendered a stall red only when its reason began with "⚠ GPU stalled since ").
// `message` is the `n/a (<why>)` text, so every surface keeps printing the same words.
import { errorMessage, TaggedError } from "@dotfiles/shared/src/result.ts";
import { z } from "#src/zod.ts";

/** The source does not exist here: no file, no state written yet, no command on PATH. */
export class SourceMissing extends TaggedError("SourceMissing")<{
  source: string;
  message: string;
}> {}

/** The source answered with something the reader cannot use. */
export class SourceUnparsable extends TaggedError("SourceUnparsable")<{
  source: string;
  message: string;
}> {}

/** The source exists, but no observation is recent enough for this render. */
export class SourceStale extends TaggedError("SourceStale")<{
  source: string;
  message: string;
}> {}

/** A command the reader runs failed, timed out, or printed too much. */
export class ToolFailed extends TaggedError("ToolFailed")<{
  tool: string;
  message: string;
}> {}

/** The GPU sampler recorded consecutive probe misses: an alert, not a quiet n/a. */
export class GpuStalled extends TaggedError("GpuStalled")<{
  since: string;
  message: string;
}> {}

export type ReadError =
  | SourceMissing
  | SourceUnparsable
  | SourceStale
  | ToolFailed
  | GpuStalled;

export const missing = (source: string, message = `no ${source}`) =>
  new SourceMissing({ source, message });
export const unparsable = (source: string, message = `${source} unparsable`) =>
  new SourceUnparsable({ source, message });
export const stale = (source: string, message: string) =>
  new SourceStale({ source, message });
export const toolFailed = (tool: string, message: string) =>
  new ToolFailed({ tool, message });
export const gpuStalled = (since: string) =>
  new GpuStalled({
    since,
    message: `⚠ GPU stalled since ${since} JST · gpu-sampler --check`,
  });

// Wire form between the sampler and the renderer: the tag and its fields as plain JSON. A plain
// string is the format older samplers wrote; it decodes as SourceStale so a field written before
// an upgrade still renders its words during the minute it takes to be resampled.
const WireError = z.discriminatedUnion("_tag", [
  z.object({
    _tag: z.literal("SourceMissing"),
    source: z.string(),
    message: z.string(),
  }),
  z.object({
    _tag: z.literal("SourceUnparsable"),
    source: z.string(),
    message: z.string(),
  }),
  z.object({
    _tag: z.literal("SourceStale"),
    source: z.string(),
    message: z.string(),
  }),
  z.object({
    _tag: z.literal("ToolFailed"),
    tool: z.string(),
    message: z.string(),
  }),
  z.object({
    _tag: z.literal("GpuStalled"),
    since: z.string(),
    message: z.string(),
  }),
]);

/** The error as stored: owner-state keeps this raw form and decodes it at the read. */
export const ErrorWireSchema = z.union([WireError, z.string()]);
export type ErrorWire = z.output<typeof ErrorWireSchema>;

/** Decode one stored error; ErrorWireSchema has already admitted its shape. */
export function decodeError(wire: ErrorWire): ReadError {
  if (typeof wire === "string") return stale("sampler", wire);
  if (wire._tag === "SourceMissing") return new SourceMissing(wire);
  if (wire._tag === "SourceUnparsable") return new SourceUnparsable(wire);
  if (wire._tag === "SourceStale") return new SourceStale(wire);
  if (wire._tag === "ToolFailed") return new ToolFailed(wire);
  return new GpuStalled(wire);
}

export const ReadErrorSchema = ErrorWireSchema.transform(decodeError);

/** A value thrown where a Result was expected: the source's own failure, in its words. */
export const thrown = (tool: string, error: unknown): ReadError =>
  toolFailed(tool, errorMessage(error));

/** The JSON a sampler writes for an error; decodeError reads it back as the same tag. */
export function wireError(error: ReadError): z.output<typeof WireError> {
  if (error._tag === "ToolFailed")
    return { _tag: error._tag, tool: error.tool, message: error.message };
  if (error._tag === "GpuStalled")
    return { _tag: error._tag, since: error.since, message: error.message };
  return { _tag: error._tag, source: error.source, message: error.message };
}

/** Wire form of whatever an Err carried; a non-ReadError keeps only its words. */
export function toWire(error: unknown): ErrorWire {
  if (
    error instanceof SourceMissing ||
    error instanceof SourceUnparsable ||
    error instanceof SourceStale ||
    error instanceof ToolFailed ||
    error instanceof GpuStalled
  )
    return wireError(error);
  return errorMessage(error);
}
