import {
  access,
  lstat,
  mkdir,
  readFile,
  readlink,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { attemptOr } from "../tools/shared/src/attempt.ts";

export const CCC_UNIT = "ccc-daemon.service";
export type SystemctlResult = { code: number; out: string };
export type Systemctl = (args: string[]) => Promise<SystemctlResult>;

export async function systemctl(args: string[]): Promise<SystemctlResult> {
  const child = Bun.spawn(["systemctl", "--user", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  const [out, err, code] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  return { code, out: `${out}${err}`.trim() };
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function lstatOrUndefined(path: string) {
  return attemptOr(() => lstat(path), null);
}

export async function deployCccDaemon(
  ctx: { home: string; dotfiles: string; os: string; mode: string },
  run: Systemctl = systemctl,
  available?: boolean,
): Promise<Error | undefined> {
  if (ctx.os === "mac" || ctx.mode === "check") return undefined;
  const systemdAvailable =
    available ??
    (Bun.which("systemctl") !== null &&
      Bun.which("systemctl") !== undefined &&
      (await exists("/run/systemd/system")));
  if (!systemdAvailable) {
    process.stdout.write("skip: ccc-daemon (no systemd on this host)\n");
    return undefined;
  }
  const source = join(ctx.dotfiles, "cocoindex/ccc-daemon.service.wsl");
  const unit = join(ctx.home, ".config/systemd/user", CCC_UNIT);
  const wanted = await readFile(source, "utf8");
  const stResult = await lstatOrUndefined(unit);
  const st = stResult;
  const unitIsSymlink = st?.isSymbolicLink() === true;
  if (unitIsSymlink) {
    if ((await readlink(unit)) !== source)
      return new Error(
        `${unit} is a foreign symlink; inspect it before mise run link:dots`,
      );
  } else if (st !== null && !st.isFile()) {
    return new Error(`${unit} is not a regular file`);
  }
  if (
    unitIsSymlink ||
    !(await exists(unit)) ||
    (await readFile(unit, "utf8")) !== wanted
  ) {
    await mkdir(dirname(unit), { recursive: true });
    const temporary = `${unit}.deploy-${process.pid}`;
    await writeFile(temporary, wanted, { mode: 0o644 });
    await rename(temporary, unit);
  }
  // Old enables may have linked the .wsl source directly. Remove only that repo-owned edge so
  // enable can replace it with an edge to the installed real unit; leave foreign edges alone.
  const edge = join(
    ctx.home,
    ".config/systemd/user/default.target.wants",
    CCC_UNIT,
  );
  const edgeStat = await lstatOrUndefined(edge);
  const edgeIsSymlink = edgeStat?.isSymbolicLink() === true;
  const edgeExists = edgeIsSymlink && (await exists(edge));
  if (edgeExists) {
    const edgeTarget = await realpath(edge);
    const sourceTarget = await realpath(source);
    if (edgeTarget === sourceTarget) await unlink(edge);
  }
  for (const args of [["daemon-reload"], ["enable", CCC_UNIT]]) {
    const r = await run(args);
    if (r.code !== 0)
      return new Error(
        `systemctl --user ${args.join(" ")} failed: ${r.out}; repair: mise run link:dots`,
      );
  }
  process.stdout.write(
    "enabled: ccc-daemon (activation preserved; start explicitly with systemctl --user start ccc-daemon)\n",
  );
  return undefined;
}
