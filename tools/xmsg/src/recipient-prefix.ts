export type RecipientVendor = "codex" | "claude";

/** Minimal structural view of the recipient discovery record. */
export type RecipientCandidate = {
  vendor: RecipientVendor;
  id: string;
  address: string;
  name: string | null;
};

/** Evidence that discovery returned every recipient for one selected vendor. */
export type RecipientInventoryEvidence = {
  vendor: RecipientVendor;
  available: boolean;
  complete: boolean;
  reason?: string;
};

export type RecipientSelectorError =
  | "invalid"
  | "not-found"
  | "ambiguous"
  | "discovery-unavailable";

export type RecipientResolution<R> =
  | { ok: true; recipient: R; address: string }
  | {
      ok: false;
      error: RecipientSelectorError;
      candidates: readonly R[];
      reason: string;
    };

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const UUID_INPUT_CHARS = /^[0-9a-f-]+$/iu;
const WILDCARD_OR_PATTERN = "*?[]{}()^$|\\";

export function canonicalUuid(value: string): string | undefined {
  const lower = value.toLowerCase();
  if (!UUID_SHAPE.test(lower) && !/^[0-9a-f]{32}$/u.test(lower))
    return undefined;
  const compact = lower.replaceAll("-", "");
  const canonical = `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  return UUID_SHAPE.test(canonical) ? canonical : undefined;
}

function canonicalPrefix(value: string): string | undefined {
  if (!UUID_INPUT_CHARS.test(value)) return undefined;
  const compact = value.replaceAll("-", "");
  if (
    compact.length < 4 ||
    compact.length > 32 ||
    !/^[0-9a-f]+$/iu.test(compact)
  )
    return undefined;

  const boundaries = new Set([8, 12, 16, 20]);
  const seenBoundaries = new Set<number>();
  let digitsSeen = 0;
  for (const character of value) {
    if (character !== "-") {
      digitsSeen++;
      continue;
    }
    if (!boundaries.has(digitsSeen) || seenBoundaries.has(digitsSeen))
      return undefined;
    seenBoundaries.add(digitsSeen);
  }
  if (
    seenBoundaries.size > 0 &&
    [...boundaries].some(
      (boundary) => boundary < compact.length && !seenBoundaries.has(boundary),
    )
  )
    return undefined;
  return compact.toLowerCase();
}

function uniqueByVendorId<R extends RecipientCandidate>(
  candidates: readonly R[],
  vendor: RecipientVendor,
): R[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const normalizedId = canonicalUuid(candidate.id) ?? candidate.id;
    const key = `${candidate.vendor}:${normalizedId}`;
    if (candidate.vendor !== vendor || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function failed<R>(
  error: RecipientSelectorError,
  candidates: readonly R[],
  reason: string,
): RecipientResolution<R> {
  return { ok: false, error, candidates, reason };
}

function resolved<R extends RecipientCandidate>(
  recipient: R,
): RecipientResolution<R> {
  return { ok: true, recipient, address: recipient.address };
}

/** Global binding requires complete evidence from both native inventories. */
export function resolveGlobalRecipientSelector<R extends RecipientCandidate>(
  value: string,
  candidates: readonly R[],
  evidence: readonly RecipientInventoryEvidence[],
): RecipientResolution<R> {
  if (value.length === 0 || value.trim() !== value || value.includes(":"))
    return failed(
      "invalid",
      [],
      "Use [codex:|claude:]<UUID, UUID prefix or exact native name>.",
    );
  const unavailable = (["codex", "claude"] satisfies RecipientVendor[]).filter(
    (vendor) =>
      !evidence.some(
        (item) => item.vendor === vendor && item.available && item.complete,
      ),
  );
  if (unavailable.length > 0)
    return failed(
      "discovery-unavailable",
      [],
      `Cannot prove global uniqueness: ${unavailable
        .map(
          (vendor) =>
            `${vendor} discovery unavailable/incomplete (${evidence.find((item) => item.vendor === vendor)?.reason ?? "no complete inventory"})`,
        )
        .join("; ")}. Qualify with codex: or claude:.`,
    );

  const known = [
    ...uniqueByVendorId(candidates, "codex"),
    ...uniqueByVendorId(candidates, "claude"),
  ];
  const full = canonicalUuid(value);
  const ids =
    full === undefined
      ? []
      : known.filter((item) => canonicalUuid(item.id) === full);
  const names = known.filter((item) => item.name === value);
  const prefix = canonicalPrefix(value);
  let matches = ids;
  if (matches.length === 0) matches = names;
  if (matches.length === 0) {
    if (prefix === undefined && UUID_INPUT_CHARS.test(value))
      return failed(
        "invalid",
        [],
        "UUID selectors must be 4–32 hexadecimal prefix digits with canonical hyphens.",
      );
    matches =
      prefix === undefined
        ? []
        : known.filter(
            (item) =>
              canonicalUuid(item.id)?.replaceAll("-", "").startsWith(prefix) ===
              true,
          );
  }
  if (matches.length === 0)
    return failed(
      "not-found",
      [],
      `No recipient matches ${JSON.stringify(value)}; use an exact native name or UUID front prefix.`,
    );
  if (matches.length > 1)
    return failed(
      "ambiguous",
      matches,
      `${JSON.stringify(value)} matches ${matches.length} recipients; qualify with codex: or claude:, or extend the UUID prefix.`,
    );
  return resolved(matches[0]!);
}

/** Resolve only a vendor-qualified exact name, full UUID, or unique UUID front prefix. */
export function resolveRecipientSelector<R extends RecipientCandidate>(
  selector: string,
  candidates: readonly R[],
  evidence: RecipientInventoryEvidence,
): RecipientResolution<R> {
  const separator = selector.indexOf(":");
  const vendorText = separator < 0 ? undefined : selector.slice(0, separator);
  const value = separator < 0 ? "" : selector.slice(separator + 1);
  const vendor =
    vendorText === undefined
      ? undefined
      : new Map<string, RecipientVendor>([
          ["codex", "codex"],
          ["claude", "claude"],
        ]).get(vendorText);
  if (
    separator < 1 ||
    vendor === undefined ||
    value.length === 0 ||
    value.trim() !== value ||
    value.split("").some((character) => WILDCARD_OR_PATTERN.includes(character))
  )
    return failed(
      "invalid",
      [],
      "Use vendor:<exact name or UUID prefix>; wildcards and patterns are not supported.",
    );

  const known = uniqueByVendorId(candidates, vendor);
  const fullUuid = canonicalUuid(value);
  if (fullUuid !== undefined) {
    const exactIds = known.filter(
      (candidate) => canonicalUuid(candidate.id) === fullUuid,
    );
    if (exactIds.length === 1) return resolved(exactIds[0]!);
    if (exactIds.length > 1)
      return failed(
        "ambiguous",
        exactIds,
        `More than one ${vendor} record has UUID ${fullUuid}.`,
      );
  }

  const exactNames = known.filter((candidate) => candidate.name === value);
  if (exactNames.length > 0) {
    if (evidence.vendor !== vendor || !evidence.available || !evidence.complete)
      return failed(
        "discovery-unavailable",
        exactNames,
        "Cannot prove exact-name uniqueness without complete selected-vendor inventory.",
      );
    if (exactNames.length === 1) return resolved(exactNames[0]!);
    return failed(
      "ambiguous",
      exactNames,
      `The exact ${vendor} name ${JSON.stringify(value)} belongs to multiple recipients.`,
    );
  }

  const prefix = canonicalPrefix(value);
  const malformedUuid =
    UUID_INPUT_CHARS.test(value) &&
    ((value.includes("-") && prefix === undefined) ||
      value.replaceAll("-", "").length > 32);
  if (malformedUuid)
    return failed(
      "invalid",
      [],
      "UUID selectors must be 4–32 hexadecimal prefix digits with canonical hyphens.",
    );

  if (prefix === undefined) {
    if (UUID_INPUT_CHARS.test(value))
      return failed(
        "invalid",
        [],
        "UUID selectors must be 4–32 hexadecimal prefix digits with canonical hyphens.",
      );
    return failed(
      "not-found",
      [],
      `No exact ${vendor} recipient name matches ${JSON.stringify(value)}.`,
    );
  }

  const matches = known.filter((candidate) => {
    const id = canonicalUuid(candidate.id);
    return id !== undefined && id.replaceAll("-", "").startsWith(prefix);
  });
  if (evidence.vendor !== vendor || !evidence.available || !evidence.complete) {
    const detail =
      evidence.reason ??
      "the selected vendor inventory is unavailable or incomplete";
    return failed(
      "discovery-unavailable",
      matches,
      `Cannot prove ${vendor} UUID-prefix uniqueness because ${detail}. Use a full UUID or retry after complete discovery.`,
    );
  }
  if (matches.length === 0)
    return failed(
      "not-found",
      [],
      `No ${vendor} recipient UUID starts with ${prefix}.`,
    );
  if (matches.length > 1)
    return failed(
      "ambiguous",
      matches,
      `${prefix} matches ${matches.length} ${vendor} recipients; add UUID prefix digits.`,
    );
  return resolved(matches[0]!);
}

/** Return the shortest currently unique UUID prefix (at least 8 hex digits). */
export function shortRecipientAddress<R extends RecipientCandidate>(
  recipient: R,
  candidates: readonly R[],
  evidence: RecipientInventoryEvidence,
): string {
  const full = canonicalUuid(recipient.id);
  if (full === undefined) return recipient.address;
  if (
    evidence.vendor !== recipient.vendor ||
    !evidence.available ||
    !evidence.complete
  )
    return `${recipient.vendor}:${full}`;

  const sameVendor = uniqueByVendorId(candidates, recipient.vendor).flatMap(
    (candidate) => {
      const id = canonicalUuid(candidate.id);
      return id === undefined ? [] : [id];
    },
  );
  if (!sameVendor.includes(full)) return `${recipient.vendor}:${full}`;
  const compact = full.replaceAll("-", "");
  for (let length = 8; length <= compact.length; length++) {
    const prefix = compact.slice(0, length);
    if (
      sameVendor.filter((id) => id.replaceAll("-", "").startsWith(prefix))
        .length === 1 &&
      !candidates.some(
        (candidate) =>
          candidate.vendor === recipient.vendor &&
          candidate.name === prefix &&
          canonicalUuid(candidate.id) !== full,
      )
    )
      return `${recipient.vendor}:${prefix}`;
  }
  return `${recipient.vendor}:${full}`;
}
