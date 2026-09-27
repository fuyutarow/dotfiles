// A throw, as a value — with no try statement anywhere. `.oxlintrc.json` bans `try { } catch` in
// every audited *.ts with no exception, so the catching happens in Promise.try: it runs `fn`
// synchronously and turns a synchronous throw (or a rejection) into a rejected promise, which
// `.then(onOk, onErr)` maps to a value.
//
// Zero-dep (not even node:), so hooks and bootstrap scripts — which run before `mise run deps`
// has necessarily restored node_modules — can import it. Code that already depends on
// neverthrow may keep fromThrowable; this is the floor for code that cannot.
//
// The price is `await`: the result is a promise even when `fn` is synchronous.

export type Attempt<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

/** Run `fn` (sync or async); a throw or rejection becomes `{ ok: false, error }`. */
export function attempt<T>(fn: () => T | PromiseLike<T>): Promise<Attempt<T>> {
  return Promise.try(fn).then(
    (value): Attempt<T> => ({ ok: true, value }),
    (error: unknown): Attempt<T> => ({ ok: false, error }),
  );
}

/** The value, or `fallback` when `fn` throws — for a catch that only substituted a default. */
export async function attemptOr<T, F>(
  fn: () => T | PromiseLike<T>,
  fallback: F,
): Promise<T | F> {
  const r = await attempt(fn);
  return r.ok ? r.value : fallback;
}

/** Message text of a caught value, for diagnostics. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
