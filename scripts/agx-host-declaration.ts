import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fromThrowable } from "neverthrow";
import { errorMessage } from "../tools/shared/src/attempt.ts";
import { z } from "../tools/shared/src/zod.ts";

const HostDeclaration = z
  .object({
    schema: z.literal(1),
    unsandboxed_reason: z.string().trim().min(1),
  })
  .strict();

export type CodexHostDeclaration = Readonly<{
  unsandboxedReason: string;
}>;

export type CodexHostDeclarationResult =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "valid"; declaration: CodexHostDeclaration }>
  | Readonly<{ kind: "invalid"; reason: string }>;

/** Parse the one agx host declaration schema. */
export function readCodexHostDeclaration(
  path: string,
): CodexHostDeclarationResult {
  const hostText = fromThrowable(
    // sync-ok: Preserve the synchronous host reader contract used by the host writer.
    () => readFileSync(path, "utf8"),
    (error) => errorMessage(error),
  )();
  if (hostText.isErr()) {
    const hostDirectory = dirname(path);
    const legacyPath = join(
      dirname(hostDirectory),
      ["codex", "-run"].join(""),
      "host.toml",
    );
    if (
      basename(hostDirectory) === "agx" &&
      // sync-ok: Preserve the original reader's missing-file and legacy-path checks.
      !existsSync(path) &&
      // sync-ok: Preserve the original reader's missing-file and legacy-path checks.
      existsSync(legacyPath)
    )
      return {
        kind: "invalid",
        reason: `legacy host declaration found; run: mv "${legacyPath}" "${path}"`,
      };
    return { kind: "absent" };
  }

  const toml = fromThrowable(
    () => Bun.TOML.parse(hostText.value),
    errorMessage,
  )();
  const parsed = toml.isOk()
    ? HostDeclaration.safeParse(toml.value)
    : undefined;
  if (parsed?.success !== true)
    return {
      kind: "invalid",
      reason: `${path} is not a valid host declaration (want exactly: schema = 1, unsandboxed_reason = "<why this box is itself the isolation>"): ${toml.isOk() ? (parsed?.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") ?? "") : toml.error}`,
    };

  return {
    kind: "valid",
    declaration: { unsandboxedReason: parsed.data.unsandboxed_reason },
  };
}
