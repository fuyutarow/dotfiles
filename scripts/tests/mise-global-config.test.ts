import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { attempt } from "../../agents/hooks/attempt.ts";

const root = resolve(import.meta.dir, "../..");
const agx =
  '"github:fuyutarow/agx" = { version = "latest", minimum_release_age = "0" }';
const dx =
  '"github:fuyutarow/dx" = { version = "latest", minimum_release_age = "0" }';

test.each([
  { name: "exactly both suites", main: `${agx}\n${dx}`, extra: "", exit: 0 },
  {
    name: "both suites across config files and reordered fields",
    main: agx,
    extra:
      '"github:fuyutarow/dx" = { minimum_release_age = "0", version = "latest" }',
    exit: 0,
  },
  { name: "missing dx", main: agx, extra: "", exit: 1 },
  { name: "missing agx", main: dx, extra: "", exit: 1 },
  { name: "no suites", main: "", extra: "", exit: 1 },
  {
    name: "third global tool",
    main: `${agx}\n${dx}\nnode = "latest"`,
    extra: "",
    exit: 1,
  },
  { name: "duplicate agx", main: `${agx}\n${dx}`, extra: agx, exit: 1 },
  { name: "duplicate dx", main: `${agx}\n${dx}`, extra: dx, exit: 1 },
  {
    name: "dx release-age delay",
    main: `${agx}\n"github:fuyutarow/dx" = "latest"`,
    extra: "",
    exit: 1,
  },
  {
    name: "dx repository-style pin",
    main: `${agx}\n${dx.replace('"latest"', '"0.1.6"')}`,
    extra: "",
    exit: 1,
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
