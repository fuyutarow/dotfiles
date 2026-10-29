import { jsonOf } from "@dotfiles/shared/src/zod.ts";
import { ReclaimRecord } from "./records.ts";

/** Classify records without touching their paths or invoking a target. */
export function unavailableRecords(input: string, approve: string[]) {
  return input
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .flatMap((line, index) => {
      const parsed = jsonOf(ReclaimRecord).safeParse(line);
      if (!parsed.success) return [];
      const record = parsed.data;
      let verdict = "unknown";
      let reason = "bounded records adapter unavailable";
      if (record.fingerprint === null) {
        verdict = "deny";
        reason =
          "record has no local fingerprint; remote host records cannot be applied here";
      } else if (record.verdict === "keep" || record.verdict === "deny") {
        verdict = record.verdict;
        reason = `verdict is ${record.verdict}`;
      } else if (
        record.verdict === "ask" &&
        (record.owner_item === undefined ||
          !approve.includes(record.owner_item))
      ) {
        verdict = "ask";
        reason = "owner item approval required";
      } else if (
        record.owner_item !== undefined &&
        !approve.includes(record.owner_item)
      ) {
        verdict = "ask";
        reason = `requires --approve ${record.owner_item}`;
      }
      return [
        {
          id: String(index + 1),
          target: record.target,
          path: record.path,
          verdict,
          reason,
          fingerprint: record.fingerprint,
          effect: "none",
          logical_bytes: null,
          allocated_bytes: record.bytes_allocated,
          eligible_at: null,
          error: null,
        },
      ];
    });
}
