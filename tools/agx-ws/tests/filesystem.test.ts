import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { fsType } from "../src/workspace.ts";

describe("graveyard filesystem type probe", () => {
  test("uses GNU stat when its form succeeds", async () => {
    const calls: string[][] = [];
    const result = await fsType(tmpdir(), (cmd) => {
      calls.push(cmd);
      return Promise.resolve({
        ok: true,
        value: { code: 0, out: "apfs\n", err: "" },
      });
    });

    expect(result).toEqual({ ok: true, value: "apfs" });
    expect(calls).toEqual([["stat", "-f", "-c", "%T", tmpdir()]]);
  });

  test("falls back to BSD stat when GNU stat rejects its form", async () => {
    const calls: string[][] = [];
    const result = await fsType(tmpdir(), (cmd) => {
      calls.push(cmd);
      return calls.length === 1
        ? Promise.resolve({
            ok: true,
            value: { code: 1, out: "", err: "invalid option" },
          })
        : Promise.resolve({
            ok: true,
            value: { code: 0, out: "apfs\n", err: "" },
          });
    });

    expect(result).toEqual({ ok: true, value: "apfs" });
    expect(calls).toEqual([
      ["stat", "-f", "-c", "%T", tmpdir()],
      ["stat", "-f", "%T", tmpdir()],
    ]);
  });
});
