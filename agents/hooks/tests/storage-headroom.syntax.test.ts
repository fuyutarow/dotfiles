// The storage gate judges what a command LAUNCHES (2026-10-06, case 3): `timeout 110 mise run test`
// inside a heredoc body is text, not a launch. The fixture config denies every launch it matches.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { decisionOf, runHook, tempDir } from "./helpers.ts";

const HOOK = "enforce-storage-headroom.ts";

const CONFIG = `schema = 1
[drive.host]
label = "tmp"
path = "/"
deny_gib = 999999
deny_pct = 100
[deny]
advice = "free space"
[[launcher]]
command = "mise"
subcommands = ["run"]
tasks = ["test", "build"]
[[launcher]]
command = "cargo"
subcommands = ["build"]
[measure]
du_timeout_seconds = 5
cache_minutes = 1
`;

const config = join(tempDir("storage-syntax-"), "storage-headroom.toml");
writeFileSync(config, CONFIG);

const verdict = (command: string): string | undefined => {
  const r = runHook(
    HOOK,
    { tool_name: "Bash", tool_input: { command }, cwd: "/tmp" },
    { STORAGE_HEADROOM_CONFIG: config },
  );
  expect(r.code).toBe(0);
  return decisionOf(r.stdout)?.permissionDecision;
};

describe("storage-headroom reads syntax, not text", () => {
  test("launcher text inside a heredoc body or a quoted word is not a launch", () => {
    for (const command of [
      `cat > brief.md <<'EOF'\ntimeout 110 mise run test\ncargo build --release\nEOF`,
      `cat > brief.md <<EOF\nrun: timeout 110 mise run build\nEOF`,
      `echo "then cargo build" && printf 'mise run test'`,
      `git commit -m "timeout 110 mise run test; cargo build"`,
    ])
      expect(verdict(command)).toBeUndefined();
  });

  test("the same launches used for real are still judged", () => {
    for (const command of [
      "timeout 110 mise run test",
      "cd x && FOO=1 cargo build --release",
      "sudo -u me env A=1 timeout 900 mise run build",
      `cat brief.md | xargs echo; /opt/bin/cargo build`,
      `bash <<EOF\ntimeout 110 mise run test\nEOF`,
      `echo $(cargo build)`,
      `cat <<EOF\n$(timeout 110 mise run test)\nEOF`,
    ])
      expect(verdict(command)).toBe("deny");
  });

  test("unparseable syntax keeps the text-based behaviour", () => {
    expect(verdict(`echo 'x; timeout 110 mise run test`)).toBe("deny");
  });
});
