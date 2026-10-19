// CLI lifetime, including lock waits, filesystem awaits and final output delivery.
import { AsyncLocalStorage } from "node:async_hooks";
import { attempt, errorMessage } from "../../shared/src/attempt.ts";
import { z } from "../../shared/src/zod.ts";

const context = new AsyncLocalStorage<{
  step: string;
  children: Set<() => void>;
}>();
const Timeout = z.coerce.number().int().positive().max(2_147_483_647);
export const ADD_TIMEOUT_MS = 900_000;

/** Logical phases persist; a nested subprocess restores its enclosing phase on return. */
export function enterStep(step: string): () => void {
  const state = context.getStore();
  if (state === undefined) return () => {};
  const previous = state.step;
  state.step = step;
  return () => {
    state.step = previous;
  };
}

export function watchChild(kill: () => void): () => void {
  const children = context.getStore()?.children;
  children?.add(kill);
  return () => {
    children?.delete(kill);
  };
}

/** Only the CLI owns process exit. Keep a referenced timer until explicit exit, even on success. */
export async function runAddCommand(
  action: () => Promise<void>,
): Promise<never> {
  const timeout = Timeout.safeParse(
    process.env.WS_ADD_TIMEOUT_MS ?? ADD_TIMEOUT_MS,
  );
  if (!timeout.success) {
    process.stderr.write(
      "ws: WS_ADD_TIMEOUT_MS must be a positive integer of at most 2147483647 milliseconds\n",
    );
    process.exit(2);
  }
  const state = {
    step: "initialize agx ws add",
    children: new Set<() => void>(),
  };
  // Deliberately referenced: AbortSignal.timeout alone is not a command-lifetime watchdog.
  setTimeout(() => {
    for (const kill of state.children) kill();
    process.stderr.write(
      `ws: whole-command deadline exceeded after ${timeout.data}ms in step: ${state.step}\n`,
    );
    process.exit(124);
  }, timeout.data);
  return context.run(state, async () => {
    const result = await attempt(action);
    if (!result.ok) {
      await new Promise<void>((resolve) => {
        process.stderr.write(`ws: ${errorMessage(result.error)}\n`, () => {
          resolve();
        });
      });
      process.exitCode = 1;
    }
    enterStep("flush command output");
    await Promise.all(
      [process.stdout, process.stderr].map(
        (stream) =>
          new Promise<void>((resolve) => {
            // Bun acknowledges an empty write before earlier large writes have drained.
            stream.end(() => {
              resolve();
            });
          }),
      ),
    );
    // Do not leave Bun waiting on retained handles after the last awaited step.
    process.exit(process.exitCode ?? 0);
  });
}
