import { expect, test } from "bun:test";
import {
  resolveGlobalRecipientSelector,
  resolveRecipientSelector,
  shortRecipientAddress,
  type RecipientCandidate,
  type RecipientInventoryEvidence,
  type RecipientVendor,
} from "../src/recipient-prefix.ts";

const idA = "01a15754-6cc0-4f8b-9674-3b5f482a3b11";
const idB = "01a15754-6cc0-4f8b-9674-3b5f482a3b99";
const idDisplayCollision = "01a15754-7cc0-4f8b-9674-3b5f482a3b11";
const idC = "deadbeef-1234-4abc-8def-0123456789ab";

function recipient(
  vendor: RecipientVendor,
  id: string,
  name: string | null = null,
): RecipientCandidate {
  return {
    vendor,
    id,
    address: `${vendor}:${id}`,
    name,
  };
}

const complete = (vendor: RecipientVendor): RecipientInventoryEvidence => ({
  vendor,
  available: true,
  complete: true,
});

test("resolves a unique UUID prefix to the exact known address", () => {
  const target = recipient("codex", idA);
  const candidates = [target];
  expect(
    resolveRecipientSelector("codex:01a1", candidates, complete("codex")),
  ).toEqual({
    ok: true,
    recipient: target,
    address: `codex:${idA}`,
  });
});

test("returns all same-vendor matches when a UUID prefix is ambiguous", () => {
  const candidates = [recipient("codex", idA), recipient("codex", idB)];
  const result = resolveRecipientSelector(
    "codex:01a15754",
    candidates,
    complete("codex"),
  );
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBe("ambiguous");
    expect(result.candidates).toEqual(candidates);
    expect(result.reason).toContain("add UUID prefix digits");
  }
});

test("returns not-found for a valid prefix with no matches", () => {
  const result = resolveRecipientSelector(
    "codex:ffff",
    [recipient("codex", idA)],
    complete("codex"),
  );
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBe("not-found");
});

test.each([
  "codex:abc",
  "codex:01a1*",
  "codex:01a1?",
  "codex:01a1-57",
  "codex:01a15754-6cc04f8b-9674-3b5f482a3b11",
])("rejects malformed or too-short UUID input %s", (selector) => {
  const result = resolveRecipientSelector(
    selector,
    [recipient("codex", idA, "known")],
    complete("codex"),
  );
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBe("invalid");
});

test("accepts case-insensitive UUID prefixes with canonical hyphens", () => {
  const candidates = [recipient("codex", idC)];
  expect(
    resolveRecipientSelector(
      "codex:DEADBEEF-12",
      candidates,
      complete("codex"),
    ),
  ).toMatchObject({
    ok: true,
    recipient: candidates[0],
  });
});

test("accepts a full UUID written as 32 hexadecimal digits", () => {
  const candidates = [recipient("codex", idA)];
  expect(
    resolveRecipientSelector(
      "codex:01A157546CC04F8B96743B5F482A3B11",
      candidates,
      complete("codex"),
    ),
  ).toMatchObject({
    ok: true,
    recipient: candidates[0],
  });
});

test("a vendor-qualified prefix ignores matching IDs from another vendor", () => {
  const candidates = [recipient("codex", idA), recipient("claude", idB)];
  expect(
    resolveRecipientSelector("codex:01a15754", candidates, complete("codex")),
  ).toMatchObject({
    ok: true,
    recipient: candidates[0],
  });
});

test("deduplicates vendor plus ID but preserves ambiguity across duplicate names", () => {
  const original = recipient("codex", idA, "shared");
  const candidates = [
    original,
    { ...original },
    recipient("codex", idB, "shared"),
  ];
  const byPrefix = resolveRecipientSelector(
    "codex:01a1",
    candidates,
    complete("codex"),
  );
  expect(byPrefix.ok).toBe(false);
  if (!byPrefix.ok) {
    expect(byPrefix.error).toBe("ambiguous");
    expect(byPrefix.candidates).toHaveLength(2);
  }
  const byName = resolveRecipientSelector(
    "codex:shared",
    candidates,
    complete("codex"),
  );
  expect(byName.ok).toBe(false);
  if (!byName.ok) {
    expect(byName.error).toBe("ambiguous");
    expect(byName.candidates).toHaveLength(2);
  }
});

test("exact full UUID wins before an exact name collision", () => {
  const uuidRecipient = recipient("codex", idA, "UUID owner");
  const nameRecipient = recipient("codex", idB, idA);
  expect(
    resolveRecipientSelector(
      `codex:${idA.toUpperCase()}`,
      [uuidRecipient, nameRecipient],
      complete("codex"),
    ),
  ).toMatchObject({
    ok: true,
    recipient: uuidRecipient,
  });
});

test("exact unique native name wins before prefix matching", () => {
  const named = recipient("codex", idA, "01a1");
  const prefixMatch = recipient("codex", idB);
  expect(
    resolveRecipientSelector(
      "codex:01a1",
      [named, prefixMatch],
      complete("codex"),
    ),
  ).toMatchObject({
    ok: true,
    recipient: named,
  });
});

test("exact native names win before UUID-format rejection", () => {
  const named = recipient("codex", idA, "01a1-57");
  expect(
    resolveRecipientSelector("codex:01a1-57", [named], complete("codex")),
  ).toMatchObject({
    ok: true,
    recipient: named,
  });
});

test("incomplete inventory permits known exact matches but blocks prefix resolution", () => {
  const candidates = [recipient("codex", idA, "known")];
  const evidence = {
    vendor: "codex",
    available: true,
    complete: false,
  } satisfies RecipientInventoryEvidence;
  expect(
    resolveRecipientSelector(`codex:${idA}`, candidates, evidence).ok,
  ).toBe(true);
  expect(
    resolveRecipientSelector("codex:known", candidates, evidence),
  ).toMatchObject({
    ok: false,
    error: "discovery-unavailable",
  });
  expect(
    resolveRecipientSelector("codex:01a1", candidates, evidence),
  ).toMatchObject({
    ok: false,
    error: "discovery-unavailable",
    candidates,
  });
});

test("opaque ID deduplication is case sensitive", () => {
  const candidates = [
    recipient("claude", "Native", "same"),
    recipient("claude", "native", "same"),
  ];
  expect(
    resolveRecipientSelector("claude:same", candidates, complete("claude")),
  ).toMatchObject({
    ok: false,
    error: "ambiguous",
    candidates,
  });
});

test("display avoids an exact-name collision with its UUID prefix", () => {
  const candidates = [
    recipient("codex", idA),
    recipient("codex", idC, "01a15754"),
  ];
  const address = shortRecipientAddress(
    candidates[0]!,
    candidates,
    complete("codex"),
  );
  expect(address).toBe("codex:01a157546");
  expect(
    resolveRecipientSelector(address, candidates, complete("codex")),
  ).toMatchObject({
    ok: true,
    recipient: candidates[0],
  });
});

test("display address uses the shortest unique prefix and accounts for collisions", () => {
  const candidates = [
    recipient("codex", idA),
    recipient("codex", idDisplayCollision),
    recipient("claude", idA),
  ];
  expect(
    shortRecipientAddress(candidates[0]!, candidates, complete("codex")),
  ).toBe("codex:01a157546");
  expect(
    shortRecipientAddress(
      candidates[0]!,
      candidates.slice(0, 1),
      complete("codex"),
    ),
  ).toBe("codex:01a15754");
});

test("display address stays full unless selected-vendor discovery is proven complete", () => {
  const target = recipient("claude", idA);
  expect(
    shortRecipientAddress(target, [target], {
      vendor: "claude",
      available: true,
      complete: false,
    }),
  ).toBe(`claude:${idA}`);
});

test("display address stays full when the selected recipient is absent from the snapshot", () => {
  const target = recipient("claude", idA);
  expect(shortRecipientAddress(target, [], complete("claude"))).toBe(
    `claude:${idA}`,
  );
});

test.each([idA, "01a1", "known"])(
  "global resolution requires complete evidence even for %s",
  (selector) => {
    const candidates = [recipient("codex", idA, "known")];
    for (const vendor of ["codex", "claude"] satisfies RecipientVendor[]) {
      const evidence = [complete("codex"), complete("claude")].map((item) =>
        item.vendor === vendor
          ? Object.assign({}, item, { complete: false })
          : item,
      );
      expect(
        resolveGlobalRecipientSelector(selector, candidates, evidence),
      ).toMatchObject({
        ok: false,
        error: "discovery-unavailable",
      });
    }
    expect(
      resolveGlobalRecipientSelector(selector, candidates, [complete("codex")]),
    ).toMatchObject({
      ok: false,
      error: "discovery-unavailable",
    });
  },
);

test("global deduplication counts vendor plus canonical identity and keeps cross-vendor ambiguity", () => {
  const target = recipient("codex", idA);
  const evidence = [complete("codex"), complete("claude")];
  const duplicate = recipient("codex", idA.toUpperCase());
  expect(
    resolveGlobalRecipientSelector(idA, [target, duplicate], evidence),
  ).toMatchObject({
    ok: true,
    recipient: target,
  });
  expect(
    resolveGlobalRecipientSelector(
      idA,
      [target, duplicate, recipient("claude", idA)],
      evidence,
    ),
  ).toMatchObject({
    ok: false,
    error: "ambiguous",
    candidates: [target, recipient("claude", idA)],
  });
});
