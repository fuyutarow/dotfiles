import { watch as watchFs, type FSWatcher } from "node:fs";
import { fromThrowable } from "neverthrow";
import { errorMessage } from "../../shared/src/attempt.ts";

export const FOLLOW_FALLBACK_MS = 2_000;

export function createFollowWaiter(
  paths: string[],
  fallbackMs = FOLLOW_FALLBACK_MS,
): { wait: () => Promise<"event" | "fallback">; close: () => void } {
  const watchers: FSWatcher[] = [];
  let pending = false;
  let wake: (() => void) | undefined;
  const signal = (): void => {
    pending = true;
    wake?.();
  };
  for (const path of paths) {
    const opened = fromThrowable(() => watchFs(path, signal), errorMessage)();
    if (opened.isOk()) watchers.push(opened.value);
  }
  return {
    wait: () => {
      if (pending) {
        pending = false;
        return Promise.resolve("event");
      }
      return new Promise((resolve) => {
        let settled = false;
        const finish = (cause: "event" | "fallback"): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          wake = undefined;
          pending = false;
          resolve(cause);
        };
        const timer = setTimeout(() => {
          finish("fallback");
        }, fallbackMs);
        wake = () => {
          finish("event");
        };
      });
    },
    close: () => {
      watchers.forEach((watcher) => {
        watcher.close();
      });
    },
  };
}
