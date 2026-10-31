// Minimum versions required by this checkout; shared by post-merge and doctor.
export const CORE_FLOORS = { agx: "1.22.8", semlint: "0.2.1" } as const;
type Tool = keyof typeof CORE_FLOORS;
type ProbeError = { stderr: string; timeout?: boolean };
export type FloorIO = {
  read: (tool: Tool) => Promise<string | undefined | ProbeError>;
  installed: (tool: Tool) => Promise<boolean | ProbeError>;
  upgrade: (tool: Tool) => Promise<void | ProbeError>;
};

async function command(
  args: string[],
  ms: number,
): Promise<{ code: number; out: string; err: string; timeout: boolean }> {
  return Promise.try(async () => {
    const signal = AbortSignal.timeout(ms);
    const proc = Bun.spawn(args, {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal,
      killSignal: "SIGKILL",
    });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return {
      code,
      out: out.trim(),
      err: err.slice(0, 8192),
      timeout: signal.aborted,
    };
  }).catch(() => ({ code: 127, out: "", err: "", timeout: false }));
}

function trustError(result: {
  code: number;
  err: string;
}): ProbeError | undefined {
  return result.code !== 0 &&
    /untrusted tap fuyutarow\/tap\b/iu.test(result.err)
    ? { stderr: result.err }
    : undefined;
}

export const coreFloorIO: FloorIO = {
  read: async (tool) => {
    const result = await command(
      [tool, tool === "agx" ? "-V" : "--version"],
      3000,
    );
    if (result.timeout) return { stderr: result.err, timeout: true };
    return trustError(result) ?? (result.code === 0 ? result.out : undefined);
  },
  installed: async (tool) => {
    const result = await command(
      ["brew", "list", `fuyutarow/tap/${tool}`],
      15000,
    );
    return (
      trustError(result) ??
      (result.timeout
        ? { stderr: result.err, timeout: true }
        : result.code === 0)
    );
  },
  upgrade: async (tool) => {
    const result = await command(
      ["brew", "upgrade", `fuyutarow/tap/${tool}`],
      15000,
    );
    return trustError(result);
  },
};

async function upgradeAndRead(
  io: FloorIO,
  tool: Tool,
): Promise<string | undefined | ProbeError> {
  const error = await io.upgrade(tool);
  if (error !== undefined) return error;
  return io.read(tool);
}

export async function checkCoreFloor(
  io: FloorIO,
  upgrade: boolean,
): Promise<{ ok: boolean; detail: string; fix?: string; warning?: boolean }> {
  const tools: Tool[] = ["agx", "semlint"];
  const observations = await Promise.all(
    tools.map(async (tool) => {
      const [output, installed] = await Promise.all([
        io.read(tool),
        io.installed(tool),
      ]);
      const match =
        typeof output === "string"
          ? output.match(new RegExp(`^${tool} (\\d+\\.\\d+\\.\\d+)$`, "u"))
          : undefined;
      let error = typeof output === "object" ? output : undefined;
      if (typeof installed === "object") error = installed;
      return {
        tool,
        version: match?.[1],
        installed: installed === true,
        error,
      };
    }),
  );
  const trustFailure = observations.find(
    (item) =>
      item.error !== undefined &&
      /untrusted tap fuyutarow\/tap\b/iu.test(item.error.stderr),
  );
  if (trustFailure !== undefined)
    return {
      ok: false,
      detail: `${trustFailure.tool}: untrusted tap fuyutarow/tap; repair: brew trust fuyutarow/tap`,
      fix: "brew trust fuyutarow/tap",
    };
  const timeout = observations.find((item) => item.error?.timeout === true);
  if (timeout !== undefined)
    return {
      ok: false,
      detail: `${timeout.tool}: probe timed out; retry the check`,
    };
  const invalid = observations.find(
    (item) => !item.installed || item.version === undefined,
  );
  if (invalid !== undefined) {
    const detail =
      invalid.tool === "agx"
        ? "agx: fuyutarow/tap/agx not installed or PATH agx is another program"
        : "semlint: fuyutarow/tap/semlint not installed or PATH semlint is unavailable";
    return { ok: false, detail: `${detail}; repair: mise run up` };
  }
  for (const item of observations) {
    const required = CORE_FLOORS[item.tool];
    let version = item.version;
    let output: string | undefined | ProbeError;
    if (
      version !== undefined &&
      !Bun.semver.satisfies(version, `>=${required}`) &&
      upgrade
    ) {
      output = await upgradeAndRead(io, item.tool);
      version =
        typeof output === "string"
          ? output.match(
              new RegExp(`^${item.tool} (\\d+\\.\\d+\\.\\d+)$`, "u"),
            )?.[1]
          : undefined;
    }
    if (
      typeof output === "object" &&
      /untrusted tap fuyutarow\/tap\b/iu.test(output.stderr)
    )
      return {
        ok: false,
        detail: `${item.tool}: untrusted tap fuyutarow/tap; repair: brew trust fuyutarow/tap`,
        fix: "brew trust fuyutarow/tap",
      };
    if (
      version === undefined ||
      !Bun.semver.satisfies(version, `>=${required}`)
    )
      return {
        ok: false,
        detail: `${item.tool}: installed ${version ?? "unknown"}, required ${required}; repair: mise run up`,
      };
  }
  return { ok: true, detail: `agx and semlint meet declared floors` };
}

if (import.meta.main) {
  const result = await checkCoreFloor(coreFloorIO, true);
  let verdict = result.ok ? "PASS" : "FAIL";
  if (result.warning === true) verdict = "WARN";
  process.stderr.write(`${verdict} core-floor: ${result.detail}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
