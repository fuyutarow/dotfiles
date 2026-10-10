// Consumer: link:dots deploy. Copy the declared unit, enable every time, never restart an active
// daemon. The .wsl source suffix must not become a systemd alias through a renamed symlink.
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const CCC_UNIT = "ccc-daemon.service";
export type SystemctlResult = { code: number; out: string };
export type Systemctl = (args: string[]) => SystemctlResult;
export function systemctl(args: string[]): SystemctlResult {
  const r = Bun.spawnSync(["systemctl", "--user", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  return {
    code: r.exitCode,
    out: `${r.stdout.toString()}${r.stderr.toString()}`.trim(),
  };
}

export function deployCccDaemon(
  ctx: { home: string; dotfiles: string; os: string; mode: string },
  run: Systemctl = systemctl,
  available = Bun.which("systemctl") !== null &&
    Bun.which("systemctl") !== undefined &&
    existsSync("/run/systemd/system"),
): Error | undefined {
  if (ctx.os === "mac" || ctx.mode === "check") return undefined;
  if (!available) {
    process.stdout.write("skip: ccc-daemon (no systemd on this host)\n");
    return undefined;
  }
  const source = join(ctx.dotfiles, "cocoindex/ccc-daemon.service.wsl");
  const unit = join(ctx.home, ".config/systemd/user", CCC_UNIT);
  const wanted = readFileSync(source, "utf8");
  const st = lstatSync(unit, { throwIfNoEntry: false });
  if (st?.isSymbolicLink() === true) {
    if (readlinkSync(unit) !== source)
      return new Error(
        `${unit} is a foreign symlink; inspect it before mise run link:dots`,
      );
  } else if (st !== undefined && !st.isFile()) {
    return new Error(`${unit} is not a regular file`);
  }
  if (
    st?.isSymbolicLink() === true ||
    !existsSync(unit) ||
    readFileSync(unit, "utf8") !== wanted
  ) {
    mkdirSync(dirname(unit), { recursive: true });
    const temporary = `${unit}.deploy-${process.pid}`;
    writeFileSync(temporary, wanted, { mode: 0o644 });
    renameSync(temporary, unit);
  }
  // Old enables may have linked the .wsl source directly. Remove only that repo-owned edge so
  // enable can replace it with an edge to the installed real unit; leave foreign edges alone.
  const edge = join(
    ctx.home,
    ".config/systemd/user/default.target.wants",
    CCC_UNIT,
  );
  if (
    lstatSync(edge, { throwIfNoEntry: false })?.isSymbolicLink() === true &&
    existsSync(edge) &&
    realpathSync(edge) === realpathSync(source)
  )
    unlinkSync(edge);
  for (const args of [["daemon-reload"], ["enable", CCC_UNIT]]) {
    const r = run(args);
    if (r.code !== 0)
      return new Error(
        `systemctl --user ${args.join(" ")} failed: ${r.out}; repair: mise run link:dots`,
      );
  }
  // start is a no-op for an active unit, unlike restart; do not stop any incumbent here.
  const active = run(["is-active", CCC_UNIT]);
  if (active.code !== 0 || active.out !== "active") {
    const r = run(["start", CCC_UNIT]);
    if (r.code !== 0)
      return new Error(
        `ccc-daemon start failed: ${r.out}; repair: mise run link:dots`,
      );
  }
  process.stdout.write(
    "enabled: ccc-daemon (default.target; active daemon preserved)\n",
  );
  return undefined;
}
