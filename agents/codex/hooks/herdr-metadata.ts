// Lifecycle hooks must stay silent: their stdout becomes Codex model context. The hook input's
// exact session_id selects its rollout, avoiding ambiguity when panes share a working directory.
import { findExe, readBoundedStdinJson } from "../../hooks/lib.ts";
import { at, obj, parseJson, strAt } from "../../hooks/narrow.ts";

async function targetPane(input: unknown): Promise<string | undefined> {
  const workspaceId = process.env.HERDR_WORKSPACE_ID;
  const tabId = process.env.HERDR_TAB_ID;
  const declaredPaneId = process.env.HERDR_PANE_ID;
  const cwd = strAt(input, "cwd");
  if (
    workspaceId === undefined ||
    workspaceId === "" ||
    tabId === undefined ||
    tabId === "" ||
    cwd === undefined ||
    cwd === ""
  )
    return undefined;
  const herdr = findExe("herdr");
  if (herdr === null) return undefined;
  const child = Bun.spawn([herdr, "pane", "list", "--workspace", workspaceId], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = await new Response(child.stdout).text();
  if ((await child.exited) !== 0) return undefined;
  const panes = at(obj(parseJson(output)), "result", "panes");
  if (!Array.isArray(panes)) return undefined;
  const candidates = panes.filter(
    (pane) =>
      strAt(pane, "agent") === "codex" &&
      strAt(pane, "tab_id") === tabId &&
      strAt(pane, "cwd") === cwd &&
      strAt(pane, "pane_id") !== undefined,
  );
  if (
    declaredPaneId !== undefined &&
    candidates.some((pane) => strAt(pane, "pane_id") === declaredPaneId)
  )
    return declaredPaneId;
  return candidates.length === 1 ? strAt(candidates[0], "pane_id") : undefined;
}

const input = readBoundedStdinJson();
const ending = strAt(input, "hook_event_name") === "SessionEnd";
const sessionId = strAt(input, "session_id");
if (!ending && (sessionId === undefined || sessionId === "")) process.exit(0);
const paneId = await targetPane(input);
if (paneId === undefined) process.exit(0);

const statusline = findExe("statusline", [
  `${process.env.HOME ?? ""}/.bun/bin`,
]);
if (statusline === null) process.exit(0);

const child = Bun.spawn(
  ending
    ? [statusline, "--codex", "--herdr-metadata-clear"]
    : [
        statusline,
        "--codex",
        "--session-id",
        sessionId ?? "",
        "--herdr-metadata",
        ...(strAt(input, "model") !== undefined
          ? ["--metadata-model", strAt(input, "model") ?? ""]
          : []),
        ...(strAt(input, "effort") !== undefined
          ? ["--metadata-effort", strAt(input, "effort") ?? ""]
          : strAt(input, "reasoning_effort") !== undefined
            ? [
                "--metadata-effort",
                strAt(input, "reasoning_effort") ?? "",
              ]
            : []),
      ],
  {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
    env: { ...process.env, HERDR_PANE_ID: paneId },
  },
);
await child.exited;
