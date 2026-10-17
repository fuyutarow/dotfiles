import { getFlag } from "type-flag";
import { stripVTControlCharacters } from "node:util";

type Parser = typeof import("cleye").cli;
type Options = Parameters<Parser>[0];
type Help = Exclude<Options["help"], false | undefined>;
type Package = { version: string; bin?: Record<string, string> };

/** Keep Cleye's document and parameter mapping, with a deterministic plain renderer. */
export const plainHelp: NonNullable<Help["render"]> = (nodes, renderers) => {
  renderers.bold = (text) => text.toUpperCase();
  renderers.table = ({ tableData }) => {
    const rows = tableData.map((row) =>
      row.map((cell) => renderers.render(cell)),
    );
    const widths = rows.reduce<number[]>((max, row) => {
      for (const [column, cell] of row.entries())
        max[column] = Math.max(max[column] ?? 0, cell.length);
      return max;
    }, []);
    return rows
      .map(
        (row) =>
          `  ${row.map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd((widths[column] ?? 0) + 2))).join("")}`,
      )
      .join("\n");
  };
  return stripVTControlCharacters(renderers.render(nodes));
};

/** Bin aliases share the package's first declared command name. */
export function cliName(pkg: Package, fallback: string): string {
  return Object.keys(pkg.bin ?? {})[0] ?? fallback;
}

export function printVersion(
  pkg: Package,
  name: string,
  argv: string[],
): boolean {
  if (argv.length !== 1 || (argv[0] !== "-V" && argv[0] !== "--version"))
    return false;
  process.stdout.write(`${cliName(pkg, name)} ${pkg.version}\n`);
  return true;
}

function surface(options: Options, argv: string[], version: string): Options {
  const ignore = options.ignoreArgv;
  const helpRequested =
    options.help !== false &&
    getFlag("--help,-h", [Boolean], [...argv]).at(-1) === true;
  return {
    ...options,
    version,
    flags: {
      ...options.flags,
      version: { type: Boolean, alias: "V", description: "Show version" },
    },
    help:
      options.help === false ? false : { ...options.help, render: plainHelp },
    ignoreArgv(type, flag, value) {
      const ignored = ignore?.(type, flag, value);
      if (type === "unknown-flag" && flag === "__proto__") {
        process.stderr.write("Error: unknown option '--__proto__'\n");
        process.exit(2);
      }
      if (
        ignored === true ||
        type !== "unknown-flag" ||
        options.strictFlags !== true ||
        helpRequested
      )
        return ignored;
      // type-flag supplies a stripped name, including for short-flag clusters.
      const typed = argv.find((token) =>
        token.startsWith("--")
          ? token.slice(2).split(/[=:.]/u)[0] === flag
          : token.startsWith("-") &&
            (token.slice(1).split(/[=:.]/u)[0]?.includes(flag) ?? false),
      );
      // Cleye already preserves long names and owns their suggestions/value formatting.
      if (typed === undefined || typed.startsWith("--")) return ignored;
      process.stderr.write(`Error: Unknown flag: ${typed}.\n`);
      process.exit(1);
    },
    ...(options.commands === undefined
      ? {}
      : {
          commands: options.commands.map((entry) => ({
            ...entry,
            options: {
              ...surface(
                {
                  ...entry.options,
                  strictFlags:
                    entry.options.strictFlags ?? options.strictFlags ?? false,
                },
                argv.slice(1),
                version,
              ),
              name: entry.options.name,
            },
          })),
        }),
  };
}

/** A proxy retains all Cleye overloads and inferred flag/parameter types. */
export function standardCli(
  parser: Parser,
  pkg: Package,
  readArgv: () => string[],
): Parser {
  return new Proxy(parser, {
    apply(target, _receiver, [options, callback, input]: Parameters<Parser>) {
      const argv = input ?? readArgv();
      if (printVersion(pkg, options.name ?? "cli", argv)) process.exit(0);
      return target(surface(options, argv, pkg.version), callback, argv);
    },
  });
}
