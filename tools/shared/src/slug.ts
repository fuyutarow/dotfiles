import type { Attempt } from "./attempt.ts";
import { projectSlug } from "./agent-name.ts";

/** Validate a new workspace, ticket or dispatch name; never silently rename it. */
export function validateSlug(slug: string, creator: string): Attempt<string> {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)
    ? { ok: true, value: slug }
    : {
        ok: false,
        error: `invalid slug '${slug}': use lowercase ASCII words joined by hyphens; try ${creator} ${projectSlug(slug)}`,
      };
}
