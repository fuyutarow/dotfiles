import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fromThrowable } from "neverthrow";
import { errorMessage } from "../../../shared/src/attempt.ts";
import { z } from "../../../shared/src/zod.ts";

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

export function codexHostDeclarationPath(): string {
  return (
    process.env.AGENT_DISPATCH_CODEX_HOST_FILE ??
    join(
      process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
      "agent-dispatch",
      "host.toml",
    )
  );
}

/** Parse the one agent-dispatch host declaration schema. */
export function readCodexHostDeclaration(
  path: string,
): CodexHostDeclarationResult {
  const hostText = fromThrowable(
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
      basename(hostDirectory) === "agent-dispatch" &&
      !existsSync(path) &&
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
