import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const OWNED_ENTRY_MARKER = "// dotfiles:ccc-index-entry";

// The installed public entry is a Bun wrapper after dotfiles takes ownership of `ccc`; uv's
// original script remains beside it as `ccc-backend` so Python-dependent operations can use its
// interpreter. Ordinary uv-tool installations still resolve directly to their own entry.
export function cccBackend(entry: string): string {
  // sync-ok: this resolver is called by synchronous extraction setup and reads one tiny wrapper.
  const source = readFileSync(entry, "utf8");
  if (!source.includes(OWNED_ENTRY_MARKER)) return entry;
  const backend = join(dirname(entry), "ccc-backend");
  // sync-ok: checking one adjacent executable is part of the same synchronous resolution.
  return existsSync(backend) ? backend : entry;
}
