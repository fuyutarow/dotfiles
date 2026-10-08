// Enumerate tracked paths for task selectors. Git-index callers opt out of jj fallback.
import { cli } from "cleye";

type Listing = { code: number; stdout: string; stderr: string };
type Options = {
  pathspecs: string[];
  gitIndex: boolean;
  expectNonEmpty: boolean;
};
type Selection = { ok: true; files: string[] } | { ok: false; message: string };

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("FATAL: unknown option '--__proto__'\n");
    process.exit(2);
  }
}

const run = (command: string[], cwd: string): Listing => {
  const result = Bun.spawnSync(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  return {
    code: result.exitCode ?? 1,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString().trim(),
  };
};

function matchesJjPath(path: string, pathspecs: string[]): boolean {
  const includes: Bun.Glob[] = [];
  const excludes: Bun.Glob[] = [];
  for (const pathspec of pathspecs) {
    const exclude = pathspec.startsWith(":(exclude)");
    const pattern = pathspec.replace(/^:\((?:glob|exclude)\)/u, "");
    (exclude ? excludes : includes).push(new Bun.Glob(pattern));
  }
  return (
    (includes.length === 0 || includes.some((glob) => glob.match(path))) &&
    !excludes.some((glob) => glob.match(path))
  );
}

export function trackedFiles(options: Options, cwd = process.cwd()): Selection {
  const gitRoot = run(["git", "rev-parse", "--show-toplevel"], cwd);
  if (gitRoot.code === 0) {
    const listing = run(
      ["git", "ls-files", "-z", "--", ...options.pathspecs],
      cwd,
    );
    if (listing.code !== 0)
      return {
        ok: false,
        message: `git ls-files failed: ${listing.stderr !== "" ? listing.stderr : "unknown error"}`,
      };
    return selection(
      listing.stdout.split("\0").filter(Boolean),
      options.expectNonEmpty,
    );
  }
  if (options.gitIndex)
    return {
      ok: false,
      message:
        "no git worktree: run in the main checkout (this check reads the Git index)",
    };

  const listing = run(
    ["jj", "--ignore-working-copy", "file", "list", "-T", 'path ++ "\\0"'],
    cwd,
  );
  if (listing.code !== 0)
    return {
      ok: false,
      message: `cannot enumerate tracked files: no git worktree and jj file list failed: ${listing.stderr !== "" ? listing.stderr : "unknown error"}`,
    };
  const files = listing.stdout
    .split("\0")
    .filter(Boolean)
    .filter((path) => matchesJjPath(path, options.pathspecs));
  return selection(files, options.expectNonEmpty);
}

function selection(files: string[], expectNonEmpty: boolean): Selection {
  if (expectNonEmpty && files.length === 0)
    return {
      ok: false,
      message: "tracked-file selection was empty; expected at least one file",
    };
  return { ok: true, files };
}

function main(): number {
  const parsed = cli(
    {
      name: "tracked-files.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["[pathspecs...]"],
      flags: {
        gitIndex: {
          type: Boolean,
          default: false,
          description:
            "require Git because the caller reads staged/index content",
        },
        expectNonEmpty: {
          type: Boolean,
          default: false,
          description: "fail if the selection contains no files",
        },
      },
      help: {
        description: "Print tracked repository paths as NUL-delimited records.",
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  const result = trackedFiles({
    pathspecs: parsed._,
    gitIndex: parsed.flags.gitIndex,
    expectNonEmpty: parsed.flags.expectNonEmpty,
  });
  if (!result.ok) {
    process.stderr.write(`tracked-files: ${result.message}\n`);
    return 2;
  }
  process.stdout.write(result.files.map((file) => `${file}\0`).join(""));
  return 0;
}

if (import.meta.main) process.exit(main());
