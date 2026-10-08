import { expect, test } from "bun:test";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENT_ROUTER_WORKER_ENV,
  AGENT_ROUTER_WORKER_VALUE,
} from "../../shared/src/worker-env.ts";
import { workerMutationRefusal } from "../src/lib/worker-guard.ts";

test("worker guard rejects when HOME and reclaim state are both outside tmp", () => {
  expect(
    workerMutationRefusal({
      [AGENT_ROUTER_WORKER_ENV]: AGENT_ROUTER_WORKER_VALUE,
      HOME: homedir(),
      RECLAIM_STATE_DIR: join(homedir(), ".local/state/reclaim"),
    }),
  ).toContain("agent-dispatch worker guard");
});

test("worker guard permits a tmp HOME", () => {
  expect(
    workerMutationRefusal({
      [AGENT_ROUTER_WORKER_ENV]: AGENT_ROUTER_WORKER_VALUE,
      HOME: join(tmpdir(), "disk-reclaim-test-home"),
      RECLAIM_STATE_DIR: join(homedir(), ".local/state/reclaim"),
    }),
  ).toBeNull();
});

test("worker guard permits reclaim state under tmp", () => {
  expect(
    workerMutationRefusal({
      [AGENT_ROUTER_WORKER_ENV]: AGENT_ROUTER_WORKER_VALUE,
      HOME: homedir(),
      RECLAIM_STATE_DIR: join(tmpdir(), "disk-reclaim-test-state"),
    }),
  ).toBeNull();
});

test("worker guard permits owner-shell execution without worker marker", () => {
  expect(
    workerMutationRefusal({
      HOME: homedir(),
      RECLAIM_STATE_DIR: join(homedir(), ".local/state/reclaim"),
    }),
  ).toBeNull();
});
