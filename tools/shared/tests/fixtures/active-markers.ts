/** Sanitized shape copies of the live agx marker records observed on 2026-10-10. */
export const fixtureSession = "75f7601f-a75c-474f-8373-39c9776a5e18";

export const ownFreshMarker = {
  schema: 1,
  run_id: "2026-10-10T01-08-11.887224Z-480",
  display_id: "agt_run_v2",
  kind: "token",
  labels: [],
  pid: 480,
  label: "Repo: dotfiles, package tools/agx (alpha is agx 2.4.0). You ",
  choice: "luna-xhigh",
  pick_source: "override",
  started_at: "2026-10-10T01:08:12.278084Z",
  cwd: "/fixture/dotfiles-arm-runv2",
  dispatcher_session: fixtureSession,
  ticket: {
    writes: [
      "tools/agx/**",
      "agents/models/**",
      "scripts/render-home.ts",
      "scripts/tests/render-home.test.ts",
    ],
  },
};

export const ownResumedMarker = {
  schema: 1,
  run_id: "2026-10-10T01-35-03.369337Z-64584",
  display_id: "agt_deploy_hosts",
  kind: "token",
  labels: [],
  pid: 64584,
  label: "resume: Repo: dotfiles. Read CLAUDE.md INV-6 first: the mise shim di",
  choice: "luna-xhigh",
  pick_source: "resume",
  started_at: "2026-10-10T01:35:03.372806Z",
  cwd: "/fixture/dotfiles-arm-hosts-1010",
  dispatcher_session: fixtureSession,
  ticket: { writes: ["scripts/**", "zsh/**", "mise.toml", "tools/coredev/**"] },
};

export const malformedMarker = {
  schema: 1,
  display_id: "agt_malformed",
  kind: "token",
  labels: [],
  label: "marker without identity",
  choice: "luna-xhigh",
  pick_source: "fixture",
  started_at: "2026-10-10T01:35:03.372806Z",
  cwd: "/fixture/dotfiles",
};

export const unreadableMarker = {
  schema: 1,
  run_id: "2026-10-10T01-50-00.000000Z-1",
  pid: 1,
};

export const deadOwnMarker = {
  ...ownFreshMarker,
  run_id: "2026-10-09T12-31-31.115639Z-97420",
  display_id: "agt_deploy_hosts",
  pid: 2_147_483_647,
  label: "Repo: dotfiles.",
  choice: "sol-high",
  pick_source: "override",
  started_at: "2026-10-09T12:31:32.232298Z",
  cwd: "/fixture/dotfiles-arm-hosts",
  ticket: { writes: ["scripts/**", "zsh/**", "mise.toml", "tools/coredev/**"] },
};
