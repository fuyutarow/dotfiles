// CONFIG for the /quote pair (capture-last-response.ts writes, quote-command.ts reads).
// Single source for the turn-depth cap so the two hooks can never drift out of sync — see
// quote-command.ts's header for why a literal `/quote N > MAX_QUOTE_TURNS` must be rejected
// rather than silently clamped: capture-last-response.ts only ever HAS this many turns to give.
export const MAX_QUOTE_TURNS = 200;
