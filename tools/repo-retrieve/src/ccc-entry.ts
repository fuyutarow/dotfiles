import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const OWNED_ENTRY_MARKER = "// dotfiles:ccc-index-entry";

// The installed public entry is a Bun wrapper after dotfiles takes ownership of `ccc`; uv's
// original script remains beside it as `ccc-backend` so Python-dependent operations can use its
// interpreter. Ordinary uv-tool installations still resolve directly to their own entry.
export async function cccBackend(entry: string): Promise<string> {
  const source = await readFile(entry, "utf8");
  if (!source.includes(OWNED_ENTRY_MARKER)) return entry;
  const backend = join(dirname(entry), "ccc-backend");
  return access(backend).then(
    () => backend,
    () => entry,
  );
}
