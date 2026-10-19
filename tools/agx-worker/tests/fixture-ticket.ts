// Test fixtures name only the ticket fields their test is about; this fills in the rest of a valid
// ticket so each fixture states its subject, not the schema.
export const FIXTURE_PROPOSITION = [
  "[proposition]",
  'id = "T1"',
  'claim = "the fixture behaves as the test states"',
  'decides = "infrastructure"',
  'refuted_by = "the test assertion fails"',
  'serves = ["T0"]',
].join("\n");

const DEFAULTS: [key: string, line: string][] = [
  ["outcome", 'outcome = "fixture outcome"'],
  ["consumer", 'consumer = "test"'],
  ["first_return", 'first_return = "fixture return"'],
  ["writes", "writes = []"],
];

/** A complete ticket around `text`: plain prose gets a whole front matter; an existing front matter
 *  keeps every field it names and gains the missing required ones. */
export function completeTicket(text: string): string {
  if (!text.startsWith("+++\n"))
    return `+++\nschema = 2\n${DEFAULTS.map(([, line]) => line).join("\n")}\nverify = []\n${FIXTURE_PROPOSITION}\n+++\n${text}`;
  const end = text.indexOf("\n+++", 4);
  if (end < 0) return text;
  let front = text.slice(4, end);
  const rest = text.slice(end);
  const has = (key: string): boolean =>
    new RegExp(`^\\s*${key}\\s*=`, "mu").test(front);
  const added = DEFAULTS.filter(([key]) => !has(key)).map(([, line]) => line);
  if (!has("verify") && !/^read_only_diagnostic\s*=\s*true/mu.test(front))
    added.push("verify = []");
  front = front.replace(/^schema\s*=\s*1\s*$/mu, "schema = 2");
  if (!has("schema")) added.unshift("schema = 2");
  const table = front.search(/^\[/mu);
  const head = table < 0 ? front : front.slice(0, table);
  const tables = table < 0 ? "" : front.slice(table);
  return `+++\n${[head.trimEnd(), ...added].filter((part) => part !== "").join("\n")}${tables === "" ? "" : `\n${tables.trimEnd()}`}${/^\[proposition\]/mu.test(front) ? "" : `\n${FIXTURE_PROPOSITION}`}${rest}`;
}
