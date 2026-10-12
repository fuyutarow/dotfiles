import { describe, expect, test } from "bun:test";
import { matchLauncher, type Launcher } from "../enforce-storage-headroom.ts";

const LAUNCHERS: Launcher[] = [
  { command: "mise", subcommands: ["run"], tasks: ["test", "build"] },
  { command: "cargo", subcommands: ["build"] },
];

const label = (command: string): string | undefined =>
  matchLauncher(command, LAUNCHERS)?.label;

describe("storage-headroom reads syntax, not text", () => {
  test("launcher text inside a heredoc body or a quoted word is not a launch", () => {
    for (const command of [
      `cat > brief.md <<'EOF'\ntimeout 110 mise run test\ncargo build --release\nEOF`,
      `cat > brief.md <<EOF\nrun: timeout 110 mise run build\nEOF`,
      `echo "then cargo build" && printf 'mise run test'`,
      `git commit -m "timeout 110 mise run test; cargo build"`,
    ])
      expect(label(command)).toBeUndefined();
  });

  test("the same launches used for real are still judged", () => {
    for (const [command, expected] of [
      ["timeout 110 mise run test", "mise run test"],
      ["cd x && FOO=1 cargo build --release", "cargo build"],
      ["sudo -u me env A=1 timeout 900 mise run build", "mise run build"],
      [`cat brief.md | xargs echo; /opt/bin/cargo build`, "cargo build"],
      [`bash <<EOF\ntimeout 110 mise run test\nEOF`, "mise run test"],
      [`echo $(cargo build)`, "cargo build"],
      [`cat <<EOF\n$(timeout 110 mise run test)\nEOF`, "mise run test"],
    ] as const)
      expect(label(command)).toBe(expected);
  });

  test("unparseable syntax keeps the text-based behaviour", () => {
    expect(label(`echo 'x; timeout 110 mise run test`)).toBe("mise run test");
  });
});
