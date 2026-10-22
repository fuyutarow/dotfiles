import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { ticketContext } from "../../src/next/ticket-home.ts";
import { prepareTicketRepo } from "../ticket-repo.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test.each([
  ["scratch", false],
  ["scratch", true],
  ["git", false],
  ["jj", false],
] as const)(
  "repository ticket with %s --cd records worker provenance (failed check: %s)",
  async (kind, failed) => {
    const root = await mkdtemp(join(tmpdir(), "agx-scratch-cd-"));
    roots.push(root);
    const repository = join(root, "tickets-repo");
    const cwd = join(root, "worker");
    await mkdir(repository);
    await mkdir(cwd);
    await prepareTicketRepo(repository);
    if (kind === "git") await prepareTicketRepo(cwd, "worker-tickets");
    if (kind === "jj") {
      const child = Bun.spawn(["jj", "git", "init", "."], {
        cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5000,
      });
      const [exit, , err] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(exit, err).toBe(0);
    }
    const workerContext = await ticketContext(cwd);
    expect(workerContext.ok).toBe(true);
    if (!workerContext.ok) return;
    const ticket = join(repository, "scratch.md");
    const verify = ["pwd", "test -s work.txt", failed ? "false" : "true"];
    await writeFile(
      ticket,
      `+++\nschema = 2\nname = "scratch"\noutcome = "write survey data"\nwrites = ["work.txt"]\nverify = ${JSON.stringify(verify)}\npremises = ["file:input.txt"]\n[proposition]\nid = "SCRATCH"\nclaim = "scratch cwd works"\nrefuted_by = "run fails or provenance is wrong"\n+++\nSurvey data.\n`,
    );
    await writeFile(join(cwd, "input.txt"), "survey input\n");
    const state = join(root, "state");
    const child = Bun.spawn(
      [
        process.execPath,
        resolve("tools/agx-worker/src/next/cli.ts"),
        "run",
        ticket,
        "--cd",
        cwd,
      ],
      {
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_DIR: undefined,
          GIT_WORK_TREE: undefined,
          GIT_INDEX_FILE: undefined,
          AGX_NEXT_STATE_DIR: state,
          AGX_TMP_ROOT: join(root, "tmp"),
          AGX_WORKER_BIN: join(import.meta.dir, "fixtures/outcome-worker.ts"),
          AGX_OUTCOME_FIXTURE: "ok",
          JEV_URL: "http://127.0.0.1:1/choice",
          DISPATCH_ROSTER_PATH: resolve("agents/models/dispatch-roster.toml"),
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: 15000,
      },
    );
    const [exit, out, err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit, `${out}\n${err}`).toBe(0);
    const receipt = jsonOf(z.looseObject({ outcome: z.string() })).safeParse(
      out,
    );
    expect(receipt.success).toBe(true);
    if (!receipt.success) return;
    expect(receipt.data.outcome).toBe(failed ? "verify-failed" : "ok");
    const events = (await readFile(join(state, "records.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .flatMap((line) => {
        const parsed = jsonOf(z.record(z.string(), z.unknown())).safeParse(
          line,
        );
        expect(parsed.success).toBe(true);
        return parsed.success ? [parsed.data] : [];
      });
    const started = events.find((event) => event.kind === "started");
    expect(started).toBeDefined();
    expect(started?.cwd).toBe(cwd);
    if (kind === "scratch") {
      expect(started).not.toHaveProperty("base_rev");
      expect(started?.premise_commits).toEqual([]);
      expect(err).toContain("no repository");
    } else {
      expect(started?.base_rev).toBe(workerContext.base_rev);
      expect(started?.base_rev).toMatch(/^[a-f0-9]{40}$/u);
      expect(started?.premise_commits).toEqual([
        { premise: "file:input.txt", commit: workerContext.base_rev },
      ]);
    }
    const ended = z
      .looseObject({
        outcome: z.string(),
        changed_files: z.number(),
        verify: z.array(z.object({ exit: z.number(), log_path: z.string() })),
      })
      .safeParse(events.find((event) => event.kind === "ended"));
    expect(ended.success).toBe(true);
    if (!ended.success) return;
    expect(ended.data.outcome).toBe(receipt.data.outcome);
    expect(ended.data.changed_files).toBe(1);
    expect(ended.data.verify.map((check) => check.exit)).toEqual([
      0,
      0,
      failed ? 1 : 0,
    ]);
    const pwd = ended.data.verify.at(0);
    expect(pwd).toBeDefined();
    if (pwd === undefined) return;
    expect(await readFile(pwd.log_path, "utf8")).toBe(`${cwd}\n`);
    expect(await readFile(join(cwd, "work.txt"), "utf8")).toContain(
      "changed by ok",
    );
    expect(await Bun.file(join(repository, "work.txt")).exists()).toBe(false);
  },
  30000,
);
