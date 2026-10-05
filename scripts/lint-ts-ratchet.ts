// The TS lint ratchet, at its floor. Called by `mise run lint:ts-ratchet` (part of `lint`).
//
// History: the trust-boundary rules (no hand-written type guards, `in` probing, `as` casts,
// un-parsed JSON.parse, unsafe any) landed on 2026-10-03 with a backlog of 1534 errors in 105
// files, recorded as one `overrides` entry in .oxlintrc.json — a ledger of files exempt from the
// new rules — and this script failed when a listed file was already clean, so the list could only
// shrink. By the end of that day the last file was converted and the ledger deleted.
//
// A ratchet at zero means any entry is an increase. So this now fails when .oxlintrc.json carries
// ANY `overrides`: there is no standing exception. A file that breaks a rule is converted, not
// listed. (The one structural exclusion lives in `ignorePatterns`, not here: a symlink that oxlint
// resolves at the link path, the same reason tsconfig.json excludes it.)

import { readFileSync } from "node:fs";
import { fromThrowable } from "neverthrow";
import { jsonText, z } from "../agents/hooks/zod.ts";

const text = fromThrowable(() => readFileSync(".oxlintrc.json", "utf8"))();
const config = text.isOk() ? jsonText.safeParse(text.value) : undefined;
if (!config?.success) {
  console.error("lint:ts-ratchet: .oxlintrc.json is unreadable");
  process.exit(2);
}

const shape = z.object({ overrides: z.array(z.unknown()).optional() });
const checked = shape.safeParse(config.data);
if (!checked.success) {
  console.error("lint:ts-ratchet: .oxlintrc.json has an unexpected shape");
  process.exit(2);
}

const entries = checked.data.overrides ?? [];
if (entries.length > 0) {
  console.error(
    `lint:ts-ratchet: .oxlintrc.json has ${entries.length} \`overrides\` entr${entries.length === 1 ? "y" : "ies"} — the debt ledger was paid down to zero on 2026-10-03 and there is no standing exception. Convert the file that needs one instead of listing it.`,
  );
  process.exit(1);
}
console.log("lint:ts-ratchet: no overrides — every file meets the full rules");
