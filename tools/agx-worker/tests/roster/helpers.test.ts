import { expect, test } from "bun:test";
import * as legacy from "../../../../agents/models/roster.ts";
import * as roster from "../../src/roster/index.ts";

const policyPath = new URL(
  "../../src/roster/policy.example.toml",
  import.meta.url,
).pathname;

test("moved pure helpers preserve roster evidence and policy labels", async () => {
  const loaded = await roster.loadRoster({ policyPath });
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) return;
  const value = loaded.value;
  expect(roster.ROUTING_OBJECTIVE).toBe(legacy.ROUTING_OBJECTIVE);
  for (const routes of [
    undefined,
    ["codex"] as const,
    ["codex", "claude"] as const,
  ]) {
    const auto = {
      ...value.auto,
      ...(routes === undefined ? {} : { routes: [...routes] }),
    };
    if (routes === undefined) delete auto.routes;
    expect(roster.routeFilterLabel(auto)).toBe(legacy.routeFilterLabel(auto));
    expect(roster.exhaustionPolicy(auto)).toEqual(
      legacy.exhaustionPolicy(auto),
    );
  }
  const omitted = { ...value.auto };
  delete omitted.on_window_exhausted;
  expect(roster.exhaustionPolicy(omitted)).toEqual(
    legacy.exhaustionPolicy(omitted),
  );
  for (const row of value.choice) {
    expect(roster.costMultiple(value, row)).toBe(
      legacy.costMultiple(value, row),
    );
    expect(roster.criterionFor(value, row)).toBe(
      legacy.criterionFor(value, row),
    );
  }
});
