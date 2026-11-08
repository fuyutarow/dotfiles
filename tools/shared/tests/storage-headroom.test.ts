import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../src/zod.ts";
import {
  assess,
  isReadOnlyBash,
  loadStorageHeadroom,
  measureStorage,
  storageLine,
} from "../src/storage-headroom.ts";

const GiB = 1024 ** 3;
const REAL_CONFIG = join(
  import.meta.dir,
  "../../../agents/hooks/storage-headroom.toml",
);

describe("storage headroom", () => {
  test("uncached measurement leaves hook cache untouched while existing caller writes and reuses it", async () => {
    const home = mkdtempSync(join(tmpdir(), "headroom-cache-"));
    const module = join(import.meta.dir, "../src/storage-headroom.ts");
    const env = { ...process.env, HOME: home };
    const invoke = async (name: string) => {
      const child = Bun.spawn(
        [
          process.execPath,
          "-e",
          `import { ${name} } from ${JSON.stringify(module)}; console.log(JSON.stringify(${name}(${JSON.stringify(home)})))`,
        ],
        { env, stdout: "pipe", stderr: "pipe" },
      );
      const [out, err, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(exit).toBe(0);
      expect(err).toBe("");
      const parsed = jsonOf(
        z.object({ free: z.number(), total: z.number() }),
      ).safeParse(out);
      expect(parsed.success).toBe(true);
      return parsed.success ? parsed.data : null;
    };
    const dir = join(home, ".cache", "claude-hooks", "storage-headroom");
    const uncached = await invoke("measureStorageUncached");
    expect(uncached?.free).toBeGreaterThanOrEqual(0);
    expect(uncached?.total).toBeGreaterThan(0);
    expect(existsSync(dir)).toBe(false);
    const first = await invoke("measureStorage");
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const file = join(dir, files[0] ?? "");
    const contents = await readFile(file, "utf8");
    expect(await invoke("measureStorage")).toEqual(first);
    expect(await readFile(file, "utf8")).toBe(contents);
    await invoke("measureStorageUncached");
    expect(await readFile(file, "utf8")).toBe(contents);
  });
  test("line math uses the smaller threshold and the absolute line without a total", () => {
    expect(storageLine(40, 10, 1_000 * GiB)).toBe(40 * GiB);
    expect(storageLine(40, 10, 200 * GiB)).toBe(20 * GiB);
    expect(storageLine(40, 10, null)).toBe(40 * GiB);
    expect(storageLine(1_000_000, 0, 500 * GiB)).toBe(0);
  });

  test("loads guest / and host C: thresholds from the authoritative TOML", () => {
    const loaded = loadStorageHeadroom(REAL_CONFIG);
    expect(loaded.errors).toEqual([]);
    const guest = loaded.drives.find((drive) => drive.label === "guest /") ?? {
      label: "",
      path: "",
      deny_gib: 0,
      deny_pct: 0,
    };
    const host = loaded.drives.find((drive) =>
      drive.label.startsWith("host C:"),
    ) ?? {
      label: "",
      path: "",
      deny_gib: 0,
      deny_pct: 0,
    };
    expect(guest).toMatchObject({ path: "/", deny_gib: 6, deny_pct: 10 });
    expect(host).toMatchObject({
      label: "host C: (WSL vhdx)",
      path: "/mnt/c",
      deny_gib: 6,
      deny_pct: 5,
      warn_gib: 6,
      warn_pct: 10,
      stop_gib: 4,
      rate_red_minutes: 30,
      rate_yellow_minutes: 120,
    });
    expect(
      assess(guest, { free: 100 * GiB, total: 1_000 * GiB }).deny_line,
    ).toBe(6 * GiB);
    expect(
      assess(host, { free: 100 * GiB, total: 1_000 * GiB }).deny_line,
    ).toBe(6 * GiB);
  });

  test("assessment boundaries are strict and stop remains an independent line", () => {
    const drive = {
      label: "fixture",
      path: "/",
      deny_gib: 40,
      deny_pct: 10,
      warn_gib: 60,
      warn_pct: 20,
      stop_gib: 10,
    };
    expect(assess(drive, { free: 60 * GiB, total: null })).toEqual({
      state: "ok",
      deny_line: 40 * GiB,
      warn_line: 60 * GiB,
      stop_line: 10 * GiB,
    });
    expect(assess(drive, { free: 60 * GiB - 1, total: null }).state).toBe(
      "warn",
    );
    expect(assess(drive, { free: 40 * GiB, total: null }).state).toBe("warn");
    expect(assess(drive, { free: 40 * GiB - 1, total: null }).state).toBe(
      "deny",
    );
  });

  test("warn fields must be paired, percentages bounded, and host stop below deny", () => {
    const dir = mkdtempSync(join(tmpdir(), "shared-storage-config-"));
    const path = join(dir, "storage.toml");
    writeFileSync(
      path,
      `schema = 1\n[drive.host]\nlabel = "host"\npath = "/mnt/c"\ndeny_gib = 20\ndeny_pct = 101\nwarn_pct = 10\nstop_gib = 20\n`,
    );
    const loaded = loadStorageHeadroom(path);
    expect(loaded.drives).toEqual([]);
    expect(loaded.errors.join("; ")).toContain(
      "drive.host: warn_gib and warn_pct go together",
    );
    expect(loaded.errors.join("; ")).toContain(
      "drive.host.deny_pct: a percentage",
    );
    expect(loaded.errors.join("; ")).toContain(
      "drive.host.stop_gib: must be below deny_gib",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("requires a host drive table", () => {
    const dir = mkdtempSync(join(tmpdir(), "shared-storage-config-"));
    const path = join(dir, "storage.toml");
    writeFileSync(
      path,
      `schema = 1\n[drive.guest]\nlabel = "guest /"\npath = "/"\ndeny_gib = 40\ndeny_pct = 10\n`,
    );
    expect(loadStorageHeadroom(path).errors).toContain(
      "drive.host: required Windows host drive table",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("reports unreadable and invalid TOML instead of guessing thresholds", () => {
    const dir = mkdtempSync(join(tmpdir(), "shared-storage-config-"));
    const path = join(dir, "storage.toml");
    writeFileSync(path, "schema = = 1\n");
    expect(loadStorageHeadroom(path).errors[0]).toContain(
      `cannot read or parse ${path}:`,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test("measures unprivileged free bytes and filesystem capacity with statfs", () => {
    const measured = measureStorage(tmpdir());
    expect(measured).not.toBeNull();
    expect(measured?.free).toBeGreaterThan(0);
    expect(measured?.total).toBeGreaterThan(0);
    expect(measureStorage(join(tmpdir(), "missing-storage-path"))).toBeNull();
  });
});

describe("read-only Bash is decided by effect", () => {
  const cwd = "/tmp";
  test.each([
    "cat /proc/1/cmdline | tr '\\0' ' '",
    "cd /home/x && df -h /",
    "while [ -d /proc/1 ]; do sleep 5; done; df -h /",
    "ps -o pid,etime,args -p 1",
    "jq -c . ~/.claude/settings.json",
    "agx worker ls --running | rg x",
    "agx worker judge some-id accept --note n",
    "agx worker check some-id",
    "agx -V",
    "echo x 2>&1 >/dev/null; ls 2>/dev/null",
    "ps x &>/dev/null",
    "ps x >/dev/null",
    "sort a | uniq -c | sort -rn | head -5",
    "uniq a",
    "date +%s",
    "test -d /tmp && [ -f /etc/hostname ]",
    "for f in a b; do echo $f; done",
    "rg -n foo src",
    "sed -n '1,5p' /etc/hostname",
    "sed -n '/error/p' /var/log/x",
    "awk '{print $1}' /etc/hostname",
    "jj st",
    "jj workspace list",
    "cd /tmp && pwd",
    "cat $X",
  ])("passes below the deny line: %s", (command) => {
    expect(isReadOnlyBash(command, cwd)).toBe(true);
  });

  test.each([
    "echo x > /home/f",
    "echo x >> /home/f",
    "cat a | tee /home/f",
    "cp a b",
    "curl -o f u",
    "cargo build",
    "bun script.ts",
    "cat a 2>&1 > f",
    "ps x >f",
    "ps x &>f",
    "ps x &>> f",
    "ps x >| f",
    "ps; echo x > /home/f",
    "ps && cp a b",
    "echo x | sh",
    "echo $(cp a b)",
    "for f in a b; do cp a $f; done",
    "sort -o out in",
    "sort --output=out in",
    "sort --compress-program=x in",
    "uniq a b",
    "sed -i 's/a/b/' f",
    "sed -n 'w out' f",
    "sed -n '1e date' f",
    "sed -n p -f script.sed",
    "sed p f",
    "awk '{print > \"f\"}' a",
    "awk '{print | \"sh\"}' a",
    "awk -f prog.awk a",
    "rg --pre sh x",
    "date -s '2020-01-01'",
    "env rm x",
    "timeout 5 cp a b",
    "/bin/cp a b",
    "rg $X",
    "agx worker run x",
    "jj abandon",
    "jj workspace add ../x",
    "mise run test",
  ])("denies below the deny line: %s", (command) => {
    expect(isReadOnlyBash(command, cwd)).toBe(false);
  });
});

test("state budgets deduplicate hard links and reuse cached measurements", async () => {
  const { mkdtemp, mkdir, writeFile, link, rm } =
    await import("node:fs/promises");
  const { stateSubtreeBudget, measureStateSubtrees } =
    await import("../src/storage-headroom.ts");
  const home = await mkdtemp(join(tmpdir(), "state-budget-"));
  {
    const state = join(home, ".local/state");
    await Promise.all(
      ["a", "b", "c"].map((name) =>
        mkdir(join(state, name), { recursive: true }),
      ),
    );
    await writeFile(join(state, "a", "one"), new Uint8Array(10 * 1024 * 1024));
    await link(join(state, "a", "one"), join(state, "a", "two"));
    await writeFile(join(state, "b", "one"), new Uint8Array(20 * 1024 * 1024));
    const config = join(home, "config.toml");
    await writeFile(
      config,
      "[measure]\ndu_timeout_seconds = 20\ncache_minutes = 5\n[state_budget]\na = 0.0146484375\nb = 0.0146484375\n",
    );
    const first = await stateSubtreeBudget(config, home);
    const measured = await measureStateSubtrees(config, home);
    const a = measured.entries.find((entry) => entry.name === "a");
    expect(a?.bytes).toBeGreaterThanOrEqual(10 * 1024 * 1024);
    expect(a?.bytes).toBeLessThan(11 * 1024 * 1024);
    expect(first.some((line) => line.includes("state subtree a:"))).toBe(false);
    expect(
      first.some(
        (line) => line.includes("state subtree b:") && line.includes("exceeds"),
      ),
    ).toBe(true);
    expect(
      first.some(
        (line) =>
          line.includes("state subtree c:") && line.includes("undeclared"),
      ),
    ).toBe(true);
    await rm(join(state, "b", "one"));
    expect(await stateSubtreeBudget(config, home)).toEqual(first);
  }
  await rm(home, { recursive: true, force: true });
});
