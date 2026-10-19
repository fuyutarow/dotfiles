import { cli } from "cleye";
import { LAND_HOSTS } from "./config-registry.ts";
import { doctorReport, doctorStep } from "./land-doctor.ts";
import { foreignWip } from "./land-verdict.ts";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("FATAL: unknown option --__proto__\n");
    process.exit(2);
  }
}

const parsed = cli({
  name: "deploy",
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  parameters: [],
  flags: {
    since: {
      type: String,
      description: "Commit to deploy (defaults to alpha).",
    },
    smoke: {
      type: String,
      description: "Command to run on each remote host after deployment.",
    },
  },
});
if (parsed._.length > 0 || parsed.flags.since === "") {
  process.stderr.write(
    "FATAL: deploy accepts flags only; --since needs a commit\n",
  );
  process.exit(2);
}
const emit = (line: string) => process.stdout.write(`[deploy] ${line}\n`);
function reportTimers(host: string, output: string): void {
  for (const line of output.split("\n"))
    if (/^(started|left inactive): \S+\.(timer|path) \(/u.test(line))
      emit(`${host}: ${line}`);
}
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const revision = parsed.flags.since ?? "alpha";
const begin = `__DEPLOY_SMOKE_BEGIN_${process.pid}__`;
const end = `__DEPLOY_SMOKE_END_${process.pid}__`;
const state = new Map<string, string>();

type Execution = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};
async function execute(
  argv: string[],
  cwd: string,
  timeoutMs = 600_000,
  env = process.env,
): Promise<Execution> {
  const signal = AbortSignal.timeout(timeoutMs);
  const child = Bun.spawn(argv, {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal,
    env,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr, timedOut: signal.aborted };
}

function diagnostic(stderr: string): string {
  return stderr.trim().replaceAll(/\s+/gu, " ").slice(-1000);
}

function reportDoctor(name: string, output: string | undefined): string {
  // The final RESULT is authoritative; nested tasks may print earlier summaries.
  const final = output
    ?.split("\n")
    .toReversed()
    .find((line) => /RESULT:/u.test(line));
  const counts =
    final === undefined
      ? null
      : /RESULT:[^\n]*?\bFAIL (\d+) · WARN (\d+) · PASS (\d+) · SKIP (\d+)/u.exec(
          final,
        );
  const normalized =
    counts === null
      ? output
          ?.split("\n")
          .filter((line) => !/RESULT:/u.test(line) || line === final)
          .join("\n")
      : [
          ...(output ?? "")
            .split("\n")
            .filter((line) => !/RESULT:/u.test(line)),
          `RESULT: summary · FAIL ${counts[1]} · WARN ${counts[2]} · PASS ${counts[3]} · SKIP ${counts[4]}`,
        ].join("\n");
  const doctor = doctorReport(normalized);
  for (const line of doctor.lines) emit(`doctor: ${name} ${line}`);
  return `${doctor.status}; doctor PASS ${doctor.pass} / FAIL ${doctor.fail}`;
}

async function deployLocal(): Promise<string> {
  const env = {
    ...process.env,
    DOTFILES_RENDER_REV: revision,
    DOTFILES_RENDER_FROM_WORKING_COPY: "0",
    DOCTOR_ONLY: "",
  };
  const mise = process.env.DEPLOY_MISE ?? "mise";
  for (const task of ["deps", "hook:post-merge"]) {
    const result = await execute(
      [mise, "run", task],
      process.cwd(),
      600_000,
      env,
    );
    reportTimers("local", result.stdout);
    if (result.timedOut) return `FAIL ${task} timed out`;
    if (result.code !== 0)
      return `FAIL ${task} exited ${result.code}: ${diagnostic(result.stderr)}`;
  }
  const proof = await execute(
    [mise, "run", "doctor"],
    process.cwd(),
    90_000,
    env,
  );
  const exit = proof.timedOut ? 124 : proof.code;
  return reportDoctor(
    "local",
    proof.timedOut
      ? undefined
      : `${proof.stdout}\n__LAND_DOCTOR_EXIT_${exit}__`,
  );
}

const local = await deployLocal();
state.set("local", local);
emit(`local: ${local}`);

const doctorBegin = `__DEPLOY_DOCTOR_BEGIN_${process.pid}__`;
const doctorEnd = `__DEPLOY_DOCTOR_END_${process.pid}__`;
for (const host of LAND_HOSTS) {
  if (!host.deploy) {
    state.set(host.alias, `skipped (${host.reason ?? "disabled"})`);
    emit(`${host.alias}: ${state.get(host.alias)}`);
    continue;
  }
  const smoke =
    parsed.flags.smoke === undefined
      ? ""
      : ` && { printf '\\n${begin}\\n'; ( ${parsed.flags.smoke}\n ) 2>&1; _smoke=$?; printf '\\n${end}\\n'; exit "$_smoke"; }`;
  const remote = `cd ~/dotfiles && export DOTFILES_RENDER_REV=${shellQuote(revision)} DOTFILES_RENDER_FROM_WORKING_COPY=0 && mise run pull && mise run deps${doctorStep(doctorBegin, doctorEnd)}${smoke}`;
  const locked = `flock -w 600 ~/.cache/dotfiles-land.lock sh -c ${shellQuote(remote)}`;
  const command = `mkdir -p ~/.cache; setsid sh -c ${shellQuote(locked)} & _deploy_pid=$!; trap 'kill -TERM -$_deploy_pid 2>/dev/null || true; wait $_deploy_pid 2>/dev/null || true' HUP TERM INT; wait $_deploy_pid; _deploy_status=$?; trap - HUP TERM INT; exit "$_deploy_status"`;
  emit(`${host.alias}: waiting for host lock`);
  const result = await execute(
    [
      process.env.DEPLOY_SSH ?? "ssh",
      "-o",
      "BatchMode=yes",
      host.alias,
      command,
    ],
    process.cwd(),
  );
  const detail = diagnostic(result.stderr);
  reportTimers(host.alias, result.stdout);
  const refusal = foreignWip(`${result.stdout}\n${result.stderr}`);
  let verdict: string;
  let smokeText: string | undefined;
  if (result.timedOut)
    verdict = `FAIL SSH command timed out${detail !== "" ? `: ${detail}` : ""}`;
  else if (
    result.code === 255 &&
    /could not resolve hostname|name or service not known|temporary failure in name resolution|nodename nor servname provided/iu.test(
      detail,
    )
  )
    verdict = "skipped: unresolvable";
  else if (result.code !== 0 && refusal !== undefined)
    verdict = `blocked: foreign WIP (${refusal.join(", ")})`;
  else if (result.code === 255)
    verdict = `FAIL ${detail !== "" ? detail : "ssh exited 255"}`;
  else if (result.code !== 0)
    verdict = `FAIL remote command exited ${result.code}${detail !== "" ? `: ${detail}` : ""}`;
  else {
    const doctorText =
      /\n__DEPLOY_DOCTOR_BEGIN_\d+___DOCTOR\n([\s\S]*?)\n__DEPLOY_DOCTOR_END_\d+___DOCTOR\n/u.exec(
        result.stdout,
      )?.[1];
    verdict = reportDoctor(host.alias, doctorText);
    smokeText =
      /\n__DEPLOY_SMOKE_BEGIN_\d+__\n([\s\S]*?)\n__DEPLOY_SMOKE_END_\d+__\n/u.exec(
        result.stdout,
      )?.[1];
  }
  if (smokeText !== undefined) emit(`smoke: ${host.alias}\n${smokeText}`);
  state.set(host.alias, verdict);
  emit(`${host.alias}: ${verdict}`);
}

const failed = [...state.values()].some((value) => value.startsWith("FAIL "));
emit(`summary: ${JSON.stringify(Object.fromEntries(state))}`);
process.exitCode = failed ? 1 : 0;
