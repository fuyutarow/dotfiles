import { afterAll, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { append, read } from "../../src/core/log.ts";

const root = mkdtempSync(join(tmpdir(), "agx-core-log-"));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

test("append serializes concurrent writers with increasing sequence numbers", async () => {
  const dir = join(root, "concurrent");
  const module = join(import.meta.dir, "../../src/core/log.ts");
  const source = `import {append} from ${JSON.stringify(module)}; for(let i=0;i<10;i++){const r=append(process.env.STATE,{type:"admitted",run_id:process.pid+"-"+i,writes:[],cwd:"/repo",workspace_root:"/repo",ticket:"t",lineage:"l"});if(!r.ok)process.exit(1);}`;
  const children = Array.from({ length: 4 }, () =>
    Bun.spawn([process.execPath, "-e", source], {
      env: { ...process.env, STATE: dir },
      stdout: "pipe",
      stderr: "pipe",
    }),
  );
  const exits = await Promise.all(children.map((child) => child.exited));
  expect(exits).toEqual([0, 0, 0, 0]);
  const result = read(dir);
  expect(result.errors).toEqual([]);
  expect(result.events).toHaveLength(40);
  expect(result.events.map((event) => event.seq)).toEqual(
    Array.from({ length: 40 }, (_, index) => index + 1),
  );
});

test("offset read returns only the complete suffix and leaves a partial tail unread", () => {
  const dir = join(root, "offset");
  const first = append(dir, {
    type: "judged",
    run_id: "first",
    decision: "accept",
  });
  expect(first.ok).toBe(true);
  const offset = read(dir).nextOffset;
  const second = append(dir, {
    type: "judged",
    run_id: "second",
    decision: "reject",
  });
  expect(second.ok).toBe(true);
  writeFileSync(join(dir, "core.jsonl"), "{", { flag: "a" });
  const result = read(dir, offset);
  expect(result.events.map((event) => event.run_id)).toEqual(["second"]);
  expect(result.nextOffset).toBe(
    readFileSync(join(dir, "core.jsonl")).lastIndexOf(10) + 1,
  );
});

test("judgment is one append and advances the log by one event", () => {
  const dir = join(root, "judgment");
  expect(
    append(dir, {
      type: "judged",
      run_id: "r",
      decision: "accept",
      note: "checked",
      refs: ["evidence-1"],
    }).ok,
  ).toBe(true);
  const result = read(dir);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]?.type).toBe("judged");
  expect(result.events[0]?.seq).toBe(1);
});

test("append refuses to extend a malformed log", () => {
  const dir = join(root, "corrupt");
  mkdirSync(dir);
  writeFileSync(join(dir, "core.jsonl"), "{}\n");
  const result = append(dir, {
    type: "judged",
    run_id: "r",
    decision: "accept",
  });
  expect(result.ok).toBe(false);
  expect(readFileSync(join(dir, "core.jsonl"), "utf8")).toBe("{}\n");
});
