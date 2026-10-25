import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { attempt } from "../../agents/hooks/attempt.ts";

const root = resolve(import.meta.dir, "../..");

test.each([
  { name: "no global tool rows", main: "", extra: "", exit: 0 },
  { name: "one global tool row", main: 'node = "latest"', extra: "", exit: 1 },
  {
    name: "tool rows across config files are forbidden",
    main: 'bun = "latest"',
    extra: 'node = "latest"',
    exit: 1,
  },
  {
    name: "disable_tools is accepted as a setting",
    main: "",
    extra: "",
    exit: 0,
  },
])("global mise scope: $name", async ({ main, extra, exit }) => {
  const fixture = await mkdtemp(join(tmpdir(), "mise-global-config-"));
  const result = await attempt(async () => {
    await Bun.write(join(fixture, "mise/config.toml"), `[tools]\n${main}\n`);
    await Bun.write(
      join(fixture, "mise/conf.d/extra.toml"),
      `[tools]\n${extra}\n`,
    );
    const signal = AbortSignal.timeout(10_000);
    const child = Bun.spawn(
      ["zsh", "zsh/tests/mise-scope.test.zsh", "--global-config-only"],
      {
        cwd: root,
        env: { ...process.env, XDG_CONFIG_HOME: fixture },
        stdout: "pipe",
        stderr: "pipe",
        signal,
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    expect(signal.aborted).toBe(false);
    expect(stderr).toBe("");
    expect(stdout).toContain(exit === 0 ? "[PASS]" : "[FAIL]");
    expect(code).toBe(exit);
  });
  await rm(fixture, { recursive: true, force: true });
  expect(result).toEqual({ ok: true, value: undefined });
});
