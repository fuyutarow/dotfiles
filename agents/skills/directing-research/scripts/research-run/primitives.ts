import {
  addFinding,
  type Finding,
  field,
  HEX_SHA256,
  type LoadedPacket,
  PLACEHOLDER,
  STABLE_ID,
  type Timestamp,
} from "./model";

export function validateRequiredKeys(
  packet: LoadedPacket,
  required: readonly string[],
  findings: Finding[],
): void {
  const allowed = new Set(required);
  for (const key of required) {
    const value = packet.fields.get(key);
    if (value === undefined)
      addFinding(findings, "RR001", packet.path, `missing required key ${key}`);
    else if (value === "" || PLACEHOLDER.test(value))
      addFinding(
        findings,
        "RR003",
        packet.path,
        `${key} is blank or a placeholder`,
      );
  }
  for (const key of packet.fields.keys())
    if (!allowed.has(key))
      addFinding(findings, "RR015", packet.path, `unknown key ${key}`);
}

export function validateSchema(
  packet: LoadedPacket,
  expected: string,
  findings: Finding[],
): void {
  const actual = field(packet, "SCHEMA");
  if (actual !== undefined && actual !== expected)
    addFinding(
      findings,
      "RR004",
      packet.path,
      `SCHEMA must be ${expected}, got ${actual}`,
    );
}

export function validateStableId(
  packet: LoadedPacket,
  key: string,
  findings: Finding[],
): void {
  const value = field(packet, key);
  if (value !== undefined && !STABLE_ID.test(value))
    addFinding(
      findings,
      "RR007",
      packet.path,
      `${key} must match ${STABLE_ID.source}`,
    );
}

export function validateDigestField(
  packet: LoadedPacket,
  key: string,
  findings: Finding[],
): void {
  const value = field(packet, key);
  if (value !== undefined && !HEX_SHA256.test(value))
    addFinding(
      findings,
      "RR006",
      packet.path,
      `${key} must be lowercase 64-hex SHA-256`,
    );
}

export function validateLocatorField(
  packet: LoadedPacket,
  key: string,
  findings: Finding[],
): void {
  const value = field(packet, key);
  if (
    value !== undefined &&
    (value.length > 1024 ||
      Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
      }))
  )
    addFinding(
      findings,
      "RR015",
      packet.path,
      `${key} must be a bounded single-line locator`,
    );
}

export function parseTimestamp(
  value: string | undefined,
  allowNone: boolean,
): Timestamp {
  if (value === undefined) return { kind: "invalid" };
  if (allowNone && value === "NONE") return { kind: "none" };
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/u,
  );
  if (match === null) return { kind: "invalid" };
  const year = Number(match[1] ?? "");
  const month = Number(match[2] ?? "");
  const day = Number(match[3] ?? "");
  const hour = Number(match[4] ?? "");
  const minute = Number(match[5] ?? "");
  const second = Number(match[6] ?? "");
  const offsetHour = Number(match[10] ?? "0");
  const offsetMinute = Number(match[11] ?? "0");
  const maxDay = Temporal.PlainYearMonth.from(
    { year, month },
    { overflow: "constrain" },
  ).daysInMonth;
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > maxDay ||
    hour > 23 ||
    minute > 59 ||
    second > 60 ||
    offsetHour > 23 ||
    offsetMinute > 59
  )
    return { kind: "invalid" };
  const fractionNanoseconds = (match[7] ?? "").padEnd(9, "0");
  const safeSecond = Math.min(second, 59).toString().padStart(2, "0");
  const normalized = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${safeSecond}${match[8]}`;
  // All fields above are already bounds-checked (year>=1, month 1-12, day<=maxDay,
  // hour<=23, minute<=59, second clamped to <=59 via safeSecond, offset<=23:59), so
  // `normalized` is always a well-formed RFC3339 instant string with an explicit
  // offset; Temporal.Instant.from does not reject it the way it would a date-only
  // or offset-less string.
  const leapSecondNanoseconds = second === 60 ? 1_000_000_000n : 0n;
  return {
    epochNanoseconds:
      Temporal.Instant.from(normalized).epochNanoseconds +
      BigInt(fractionNanoseconds) +
      leapSecondNanoseconds,
    kind: "value",
  };
}

export function validateTimestampField(
  packet: LoadedPacket,
  key: string,
  allowNone: boolean,
  findings: Finding[],
): Timestamp {
  const parsed = parseTimestamp(field(packet, key), allowNone);
  if (parsed.kind === "invalid")
    addFinding(
      findings,
      "RR010",
      packet.path,
      `${key} must be RFC3339${allowNone ? " or NONE" : ""}`,
    );
  return parsed;
}

export function parseIdList(
  packet: LoadedPacket,
  key: string,
  allowNone: boolean,
  findings: Finding[],
): string[] {
  const value = field(packet, key);
  if (value === undefined) return [];
  if (allowNone && value === "NONE") return [];
  const ids = value.split(",").map((id) => id.trim());
  if (ids.length === 0 || ids.some((id) => !STABLE_ID.test(id)))
    addFinding(
      findings,
      "RR007",
      packet.path,
      `${key} must be a comma-separated stable RUN_ID list${allowNone ? " or NONE" : ""}`,
    );
  if (new Set(ids).size !== ids.length)
    addFinding(findings, "RR002", packet.path, `${key} contains duplicate IDs`);
  return ids;
}
