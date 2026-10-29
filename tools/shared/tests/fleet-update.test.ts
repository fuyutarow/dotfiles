import { expect, test } from "bun:test";
import {
  FleetPatchRequestSchema,
  mergeFleetUpdate,
  parseFleetPatchRequest,
  parseFleetSessionV2,
  type FleetPatchRequest,
  type FleetSessionV2,
} from "../src/fleet-update.ts";

const observedAt = "2026-10-21T09:00:00.000Z";
const commitAt = "2026-10-21T10:00:00.000Z";

const current = {
  schema: 2,
  session_id: "session-123",
  vendor: "codex",
  revision: 4,
  fields: {
    name: { value: "core-agt_123", observedAt },
    model: { value: "GPT-6", observedAt },
    effort: { value: "high", observedAt },
    ctx: { value: { tokens: 1200, pct: 24.5 }, observedAt },
    rate: {
      value: {
        five_h_pct: 18,
        seven_d_pct: 42,
        resets: "2026-10-22T00:00:00Z",
      },
      observedAt,
    },
    cwd: { value: "/work/core", observedAt },
    pane_id: { value: null, observedAt: null },
  },
  updated_at: observedAt,
} satisfies FleetSessionV2;

function patch(
  owner: FleetPatchRequest["owner"],
  values: FleetPatchRequest["patch"],
): FleetPatchRequest {
  return {
    kind: "patch",
    target: { session_id: current.session_id, vendor: current.vendor },
    owner,
    patch: values,
  };
}

test("hook with no ctx or rate authority cannot erase them", () => {
  const unknownRate = mergeFleetUpdate(
    current,
    patch("codex-provider-status", {
      rate: {
        value: { na: true, why: "hook did not report usage" },
        observedAt: commitAt,
      },
    }),
    "2026-10-21T11:00:00.000Z",
  );
  expect(unknownRate).toEqual({
    ok: false,
    error: { code: "OWNER_FORBIDDEN" },
  });

  const contextOnly = mergeFleetUpdate(
    current,
    patch("codex-provider-status", {
      ctx: { value: { tokens: 1300, pct: 26 }, observedAt: commitAt },
    }),
    "2026-10-21T11:00:00.000Z",
  );
  expect(contextOnly).toMatchObject({ ok: true, changed: ["ctx"] });
  if (contextOnly.ok)
    expect(contextOnly.value.fields.rate).toEqual(current.fields.rate);
});

test("a stale F0 observation cannot replace F1 and rejects the whole request", () => {
  const result = mergeFleetUpdate(
    current,
    patch("codex-rollout", {
      model: { value: "GPT-F0", observedAt: "2026-10-21T08:59:59.999Z" },
      effort: { value: "low", observedAt: commitAt },
    }),
    "2026-10-21T11:00:00.000Z",
  );
  expect(result).toEqual({
    ok: false,
    error: { code: "STALE_OBSERVATION", field: "model" },
  });
  expect(
    mergeFleetUpdate(
      current,
      patch("codex-rollout", {
        model: { value: "GPT-F0", observedAt },
      }),
      "2026-10-21T11:00:00.000Z",
    ),
  ).toEqual({
    ok: false,
    error: { code: "STALE_OBSERVATION", field: "model" },
  });
});

test("an unrelated update preserves each omitted cell and its observation age", () => {
  const result = mergeFleetUpdate(
    current,
    patch("codex-rollout", {
      model: { value: "GPT-6.1", observedAt: commitAt },
    }),
    "2026-10-21T11:00:00.000Z",
  );
  expect(result).toMatchObject({ ok: true, changed: ["model"] });
  if (result.ok) {
    expect(result.value.fields.ctx).toEqual(current.fields.ctx);
    expect(result.value.fields.rate).toEqual(current.fields.rate);
    expect(result.value.updated_at).toBe("2026-10-21T11:00:00.000Z");
    expect(result.value.revision).toBe(5);
  }
});

test("independent owner fields merge in either order", () => {
  const model = patch("codex-rollout", {
    model: { value: "GPT-6.1", observedAt: "2026-10-21T10:00:00.000Z" },
  });
  const context = patch("codex-provider-status", {
    ctx: {
      value: { tokens: 1400, pct: 28 },
      observedAt: "2026-10-21T10:01:00.000Z",
    },
  });
  const firstModel = mergeFleetUpdate(
    current,
    model,
    "2026-10-21T10:02:00.000Z",
  );
  expect(firstModel.ok).toBe(true);
  if (!firstModel.ok) return;
  const modelThenContext = mergeFleetUpdate(
    firstModel.value,
    context,
    "2026-10-21T10:03:00.000Z",
  );
  const firstContext = mergeFleetUpdate(
    current,
    context,
    "2026-10-21T10:02:00.000Z",
  );
  expect(firstContext.ok).toBe(true);
  if (!firstContext.ok) return;
  const contextThenModel = mergeFleetUpdate(
    firstContext.value,
    model,
    "2026-10-21T10:03:00.000Z",
  );
  expect(modelThenContext).toMatchObject({ ok: true });
  expect(contextThenModel).toMatchObject({ ok: true });
  if (modelThenContext.ok && contextThenModel.ok)
    expect(modelThenContext.value.fields).toEqual(
      contextThenModel.value.fields,
    );
});

test("identity, vendor, and field ownership checks fail closed", () => {
  const wrongIdentity = mergeFleetUpdate(
    current,
    {
      ...patch("codex-rollout", {
        model: { value: "GPT-6.1", observedAt: commitAt },
      }),
      target: { session_id: "other", vendor: "codex" },
    },
    "2026-10-21T11:00:00.000Z",
  );
  expect(wrongIdentity).toEqual({
    ok: false,
    error: { code: "IDENTITY_MISMATCH" },
  });
  const wrongVendor = mergeFleetUpdate(
    current,
    patch("claude-statusline", {
      model: { value: "GPT-6.1", observedAt: commitAt },
    }),
    "2026-10-21T11:00:00.000Z",
  );
  expect(wrongVendor).toEqual({
    ok: false,
    error: { code: "VENDOR_FORBIDDEN" },
  });
  const wrongOwner = mergeFleetUpdate(
    current,
    patch("codex-thread-identity", {
      model: { value: "GPT-6.1", observedAt: commitAt },
    }),
    "2026-10-21T11:00:00.000Z",
  );
  expect(wrongOwner).toEqual({ ok: false, error: { code: "OWNER_FORBIDDEN" } });
});

test("raw decoded unknown keys and malformed cells are invalid requests", () => {
  const unknownKey = {
    ...patch("codex-rollout", {
      model: { value: "GPT-6.1", observedAt: commitAt },
    }),
    patch: {
      model: { value: "GPT-6.1", observedAt: commitAt },
      rate: { value: "not a rate", observedAt: commitAt },
      extra: true,
    },
  };
  expect(parseFleetPatchRequest(JSON.stringify(unknownKey)).success).toBe(
    false,
  );
  expect(
    FleetPatchRequestSchema.safeParse({
      ...patch("codex-rollout", {
        model: { value: "GPT-6.1", observedAt: commitAt },
      }),
      patch: { model: { value: "GPT-6.1", observedAt: null } },
    }).success,
  ).toBe(false);
  expect(
    parseFleetSessionV2(JSON.stringify({ ...current, unexpected: true }))
      .success,
  ).toBe(false);
  expect(
    mergeFleetUpdate(current, unknownKey, "2026-10-21T11:00:00.000Z"),
  ).toEqual({ ok: false, error: { code: "INVALID_REQUEST" } });
});

test("empty or undefined-only patches are invalid and do not advance the record", () => {
  const empty = {
    kind: "patch",
    target: { session_id: current.session_id, vendor: current.vendor },
    owner: "codex-rollout",
    patch: {},
  };
  const undefinedOnly = { ...empty, patch: { model: undefined } };
  const before = structuredClone(current);
  expect(FleetPatchRequestSchema.safeParse(empty).success).toBe(false);
  expect(FleetPatchRequestSchema.safeParse(undefinedOnly).success).toBe(false);
  expect(mergeFleetUpdate(current, empty, commitAt)).toEqual({
    ok: false,
    error: { code: "INVALID_REQUEST" },
  });
  expect(mergeFleetUpdate(current, undefinedOnly, commitAt)).toEqual({
    ok: false,
    error: { code: "INVALID_REQUEST" },
  });
  expect(current).toEqual(before);

  const mixed = mergeFleetUpdate(
    current,
    patch("codex-rollout", {
      model: { value: "GPT-6.1", observedAt: commitAt },
      effort: undefined,
    }),
    "2026-10-21T11:00:00.000Z",
  );
  expect(mixed).toMatchObject({ ok: true, changed: ["model"] });
  if (mixed.ok) {
    expect(mixed.value.revision).toBe(current.revision + 1);
    expect(mixed.value.updated_at).toBe("2026-10-21T11:00:00.000Z");
  }
});

test("a true owner observation replaces a legacy null age and explicit unavailable is owner-limited", () => {
  const legacy = {
    ...current,
    fields: { ...current.fields, model: { value: "GPT-5", observedAt: null } },
  };
  const replaced = mergeFleetUpdate(
    legacy,
    patch("codex-rollout", {
      model: { value: "GPT-6", observedAt: commitAt },
    }),
    "2026-10-21T11:00:00.000Z",
  );
  expect(replaced).toMatchObject({ ok: true });
  if (replaced.ok)
    expect(replaced.value.fields.model).toEqual({
      value: "GPT-6",
      observedAt: commitAt,
    });

  const unavailable = mergeFleetUpdate(
    current,
    patch("codex-rollout", {
      effort: {
        value: { na: true, why: "provider omitted effort" },
        observedAt: commitAt,
      },
    }),
    "2026-10-21T11:00:00.000Z",
  );
  expect(unavailable).toMatchObject({ ok: true, changed: ["effort"] });
});
