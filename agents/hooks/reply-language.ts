// Shared Japanese-primary decision inputs for vendor Stop adapters. The classifier owns text
// analysis; this module owns the one declared policy source consumed by Claude and Codex.
import { join } from "node:path";
import { strAt } from "./narrow.ts";
import {
  classifyJapanesePrimary,
  type JapaneseClassification,
} from "../../tools/detect-japanese/src/classify.ts";

export type ReplyLanguageVendor = "claude" | "codex";
export type { JapaneseClassification };
export { classifyJapanesePrimary };

export const JAPANESE_REPLY_BLOCK_REASON =
  "直前の返答が日本語中心ではありません。日本語で書き直してください（コードや識別子は原文のままで構いません）。";

/** Read the one shared policy declaration. Invalid or unsupported policy is a hook fail-open. */
export async function requiredReplyLanguage(
  vendor: ReplyLanguageVendor,
): Promise<string | Error> {
  const policy = Bun.TOML.parse(
    await Bun.file(join(import.meta.dir, "reply-language.toml")).text(),
  );
  const language = strAt(policy, vendor, "language");
  if (language === undefined)
    return new Error(`missing ${vendor}.language in reply-language.toml`);
  return language;
}
