import { resolve } from "node:path";

/** Bundle one Bun entry and report its resolved inputs. */
export async function bundleEntry(path: string, plugins: Bun.BunPlugin[] = []) {
  const build = await Bun.build({
    entrypoints: [path],
    target: "bun",
    throw: false,
    metafile: true,
    plugins,
  });
  if (!build.success)
    return {
      ok: false as const,
      error: `${path}: ${build.logs.map(String).join("\n")}`,
    };
  const output = build.outputs[0];
  if (output === undefined)
    return { ok: false as const, error: `${path}: bundler produced no output` };
  return {
    ok: true as const,
    text: await output.text(),
    inputs: Object.keys(build.metafile?.inputs ?? {}).map((input) =>
      resolve(input),
    ),
  };
}
