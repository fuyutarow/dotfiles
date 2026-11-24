import { describe, expect, test } from "bun:test";
import {
  checkClipboardRoundTrip,
  type Deps,
  type Reader,
} from "#src/doctor-clipboard.ts";

const TOKEN = "dotfiles-doctor-clipboard-test";

function deps(over: Partial<Deps>): Deps {
  return {
    copy: () =>
      Promise.resolve({
        code: 0,
        out: "terminal: written; native: ok (pbcopy)\n",
        err: "",
      }),
    reader: () => ({
      name: "stub reader",
      read: () => Promise.resolve({ ok: true as const, text: TOKEN }),
    }),
    token: () => TOKEN,
    settleMs: 0,
    ...over,
  };
}

describe("doctor:clipboard round trip", () => {
  test("PASS when the token reads back (trailing newline ignored)", async () => {
    const reader: Reader = {
      name: "stub",
      read: () => Promise.resolve({ ok: true as const, text: `${TOKEN}\r\n` }),
    };
    const f = await checkClipboardRoundTrip(deps({ reader: () => reader }));
    expect(f.verdict).toBe("PASS");
  });

  test("SKIP without a reader, and nothing is copied", async () => {
    let copied = false;
    const f = await checkClipboardRoundTrip(
      deps({
        reader: () => "no clipboard reader on this OS",
        copy: () => {
          copied = true;
          return Promise.resolve({ code: 0, out: "", err: "" });
        },
      }),
    );
    expect(f.verdict).toBe("SKIP");
    expect(f.detail).toContain("no clipboard reader");
    expect(copied).toBe(false);
  });

  test("FAIL with smart-copy's reasons when it exits nonzero", async () => {
    const f = await checkClipboardRoundTrip(
      deps({
        copy: () =>
          Promise.resolve({
            code: 1,
            out: "",
            err: "smart-copy: native: boom\n",
          }),
      }),
    );
    expect(f.verdict).toBe("FAIL");
    expect(f.lines).toEqual(["smart-copy: native: boom"]);
  });

  test("FAIL when the clipboard holds something else", async () => {
    const reader: Reader = {
      name: "stub",
      read: () => Promise.resolve({ ok: true as const, text: "other" }),
    };
    const f = await checkClipboardRoundTrip(deps({ reader: () => reader }));
    expect(f.verdict).toBe("FAIL");
    expect(f.detail).toContain('"other"');
  });

  test("FAIL with the reader's reason when the clipboard cannot be read", async () => {
    const reader: Reader = {
      name: "stub",
      read: () =>
        Promise.resolve({
          ok: false as const,
          reason: "no desktop-session socket",
        }),
    };
    const f = await checkClipboardRoundTrip(deps({ reader: () => reader }));
    expect(f.verdict).toBe("FAIL");
    expect(f.detail).toContain("no desktop-session socket");
  });
});
