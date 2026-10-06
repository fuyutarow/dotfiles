# CLI CONTRACT — bundled Jev evaluator

## C0 CONSUMERS

- Consumer regimes: shell-pipeline, ci, agent

| Regime | Supported work | Noninteractive path | Machine-readable result |
|---|---|---|---|
| shell-pipeline | evaluate one request from a file or stdin | required; no prompts | one JSON response on stdout |
| ci | fixture/evaluation calls with explicit timeout and env key | required; no TTY dependency | JSON response plus recovery-class exit |
| agent | invoke one bounded typed judgment and preserve the raw result | file or `-` stdin | JSON response; diagnostic on stderr |

## C1 INVOCATION

- Parser profile: Cleye strict long flags plus exactly one positional request operand.
- Ambiguous / invalid cases: final repeated value wins. Unknown flags and extra operands are rejected.
  Missing values, `--__proto__`, interactive `-`, and undeclared custom endpoints are also rejected.

| Synopsis / input | Ordering and repetition | stdin | Help / example |
|---|---|---|---|
| `bun jev.ts <request.json\|-> [--timeout-ms N] [--base-url URL --allow-custom-base-url]` | flags may surround the operand; exactly one operand; `--` follows the parser profile | `-` reads exactly one JSON value; rejected when stdin is a TTY | `bun jev.ts --help`; `bun jev.ts request.json` |

## C2 EFFECTS

- Effects / recovery: reads one request file or stdin and one environment secret.
  Performs one POST and writes no persistent state. There is no preview, force, or automatic retry.
  Timeout cancels the request and leaves no local partial state.

| Effect boundary | Preview / force | Partial state | Retry / cancellation |
|---|---|---|---|
| local read + one network POST to the declared base URL | none; custom routing requires an explicit acknowledgement flag | none retained by the runner; provider-side handling follows the account contract | timeout aborts; exit 4 permits caller-owned bounded retry; all other failures require repair/review |

## C3 CHANNELS

- Machine mode: always-on JSON success route.
- Machine framing: one UTF-8 JSON value plus newline on stdout. Failure leaves stdout empty.
- Machine compatibility: provider fields are relayed without deletion. Callers tolerate added fields.
  Runner diagnostics are not part of the stdout schema.

| Mode / TTY | stdout | stderr | Decoration / framing |
|---|---|---|---|
| noninteractive success | raw provider JSON | empty | single JSON value + newline; no decoration |
| noninteractive failure | empty | one `FATAL:` diagnostic line | bounded text; never includes the API key |
| help | Cleye help | empty | human text; not machine schema |

## C4 OUTCOMES

| Outcome class | Exit / status | Output | Retry / next action |
|---|---|---|---|
| typed response received | 0 | stdout JSON | apply the predeclared result policy |
| parser/help rejection | 1 from Cleye | stderr diagnostic, except help on stdout/0 | correct invocation |
| local request/config invalid | 2 | stderr `FATAL:` | correct request, key presence, or endpoint declaration |
| authentication/permission rejected | 3 | stderr `FATAL:` | repair account/key; do not retry unchanged |
| timeout/network/rate-limit/overload | 4 | stderr `FATAL:` | caller may apply one bounded backoff policy |
| other upstream rejection | 5 | stderr `FATAL:` | inspect status/body and repair before retry |

## C5 EVOLUTION

- Positive receipt: valid fixture POST returns provider JSON on stdout, empty stderr, and exit 0.
- Negative receipt: unacknowledged custom loopback URL returns empty stdout, a `FATAL:` diagnostic, and exit 2.

| Surface | Promise | Change / deprecation | Verification receipt |
|---|---|---|---|
| one operand + current flags | stable inside this skill major version | remove/rename only with contract and fixture update | help/strict/prototype/extra-operand tests |
| stdout success framing | stable one-JSON-value route | provider may add fields; runner will not silently delete them | positive fixture receipt |
| exit classes 0/2/3/4/5 | stable recovery classes | new class requires contract + negative fixture | success, validation, auth, and retryable fixtures |
| provider request/response fields | extensible and provider-owned | current facts revalidated in `model-and-api.md` | pass-through request/response fixture |
