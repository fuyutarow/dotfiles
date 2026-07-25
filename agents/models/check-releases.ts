#!/usr/bin/env bun
// Floor for the model-release SSOT (`releases.toml`).
//
// The SSOT solves "dates live in four inventories and nobody can sort across them".
// It does NOT solve "the one file rots" — that is what this floor is for. Three checks,
// each grounded in a failure actually observed on 2026-07-25:
//
//   F1 STALE-SSOT   — the sweep date aged past meta.max_age_days. The agy catalog was
//                     two days old when it produced two bad panel arms; a file nobody
//                     re-confirms is the same failure with a nicer filename.
//   F2 RETIRING     — a model retires within meta.retirement_warning_days (or already
//                     has, while still marked otherwise). claude-opus-4-1 retires
//                     2026-08-05: a dated landmine nothing else in the repo would catch.
//   F3 DEAD-REFS    — a skill body names a slug this file marks retired/deprecated/
//                     preview/legacy. Catalogs list what a CLI can reach; this catches
//                     the moment that listing becomes a recommendation.
//
// Bun-native TOML import — zero dependencies, per the house script floor.
// Usage:  bun agents/models/check-releases.ts [--today YYYY-MM-DD] [--quiet]
// Exit:   0 = clean, 1 = at least one FAIL.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import releases from "./releases.toml";

type Model = {
  slug: string;
  vendor: string;
  released: string;
  status: string;
  role?: string;
  source: string;
  verified: string;
  retires?: string;
};
type Meta = {
  last_full_sweep: string;
  max_age_days: number;
  retirement_warning_days: number;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(HERE, "..", "skills");

// Statuses a skill body should not be steering work toward.
const DISCOURAGED = new Set(["retired", "deprecated", "preview", "legacy"]);

// Files whose job IS to record history/provenance, so a stale slug in them is data,
// not a recommendation.
const HISTORY_FILE = /(forge-verification-ledger|survey-sok|releases\.toml)/;

let failures = 0;
let warnings = 0;
const quiet = Bun.argv.includes("--quiet");

function fail(msg: string): void {
  failures++;
  console.log(`FAIL ${msg}`);
}
function warn(msg: string): void {
  warnings++;
  if (!quiet) console.log(`WARN ${msg}`);
}

function parseDay(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

function todayStamp(): string {
  const i = Bun.argv.indexOf("--today");
  if (i !== -1 && Bun.argv[i + 1]) return Bun.argv[i + 1];
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.round((toMs - fromMs) / 86_400_000);
}

// Walk the skills tree once, returning [path, text] for every markdown body a reader
// would treat as guidance (SKILL.md + references/), excluding history files.
function guidanceFiles(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const p = join(dir, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === "tests" || name === "node_modules") continue;
        walk(p);
      } else if (name.endsWith(".md") && !HISTORY_FILE.test(p)) {
        try {
          out.push([p, readFileSync(p, "utf8")]);
        } catch {
          /* unreadable file is not a finding */
        }
      }
    }
  };
  walk(SKILLS_DIR);
  return out;
}

function main(): void {
  const meta = (releases as { meta: Meta }).meta;
  const models = (releases as { model: Model[] }).model ?? [];
  const today = todayStamp();
  const todayMs = parseDay(today);

  if (todayMs === null) {
    fail(`--today '${today}' is not YYYY-MM-DD`);
    return;
  }
  if (models.length === 0) {
    fail("releases.toml lists no models — the SSOT is empty");
    return;
  }

  // F1 — the sweep itself must be fresh.
  const sweepMs = parseDay(meta.last_full_sweep);
  if (sweepMs === null) {
    fail(`meta.last_full_sweep '${meta.last_full_sweep}' is not YYYY-MM-DD`);
  } else {
    const age = daysBetween(sweepMs, todayMs);
    if (age > meta.max_age_days) {
      fail(
        `releases.toml is ${age} days old (max ${meta.max_age_days}) — re-confirm the rows ` +
          `against their sources and bump meta.last_full_sweep. A stale SSOT is the same ` +
          `defect as a stale catalog, in one file instead of four.`,
      );
    } else if (age > meta.max_age_days - 7) {
      warn(
        `releases.toml is ${age} days old — sweep due in ${meta.max_age_days - age} days`,
      );
    }
  }

  // Guidance corpus, read once: F2 escalates on it and F3 scans it.
  const guidance = guidanceFiles();
  const namedIn = (slug: string): string[] => {
    const re = new RegExp(
      `(^|[^a-zA-Z0-9.\\-])${slug.replace(/[.]/g, "\\.")}(?![a-zA-Z0-9])`,
    );
    return guidance
      .filter(([, text]) => re.test(text))
      .map(([p]) =>
        p.includes("agents/") ? p.slice(p.indexOf("agents/")) : p,
      );
  };

  // Row hygiene + F2 — retirements.
  const bySlug = new Map<string, Model>();
  for (const m of models) {
    if (bySlug.has(m.slug))
      fail(`duplicate slug '${m.slug}' — the SSOT must have one row per slug`);
    bySlug.set(m.slug, m);

    if (m.released !== "unknown" && parseDay(m.released) === null)
      fail(
        `${m.slug}: released '${m.released}' is neither YYYY-MM-DD nor "unknown"`,
      );
    if (!m.source || !m.verified)
      fail(`${m.slug}: every row needs a source and a verified date`);

    if (m.retires) {
      const r = parseDay(m.retires);
      if (r === null) {
        fail(`${m.slug}: retires '${m.retires}' is not YYYY-MM-DD`);
        continue;
      }
      const left = daysBetween(todayMs, r);
      if (left < 0 && m.status !== "retired") {
        fail(
          `${m.slug} passed its retirement date ${m.retires} (${-left} days ago) but is still ` +
            `marked '${m.status}' — fix the status or the date`,
        );
      } else if (left >= 0 && left <= meta.retirement_warning_days) {
        // Escalate only when something in the repo actually points at it. A deadline
        // nothing references is a note; a floor that is permanently red gets ignored,
        // which costs more than the alarm buys.
        const refs = namedIn(m.slug);
        const when = `retires in ${left} days (${m.retires})`;
        if (refs.length > 0)
          fail(
            `${m.slug} ${when} and is still referenced by: ${refs.join(", ")} — migrate them`,
          );
        else warn(`${m.slug} ${when}; nothing in agents/skills references it`);
      }
    }
  }

  // F3 — guidance prose steering toward a discouraged slug.
  for (const m of [...bySlug.values()].filter((x) =>
    DISCOURAGED.has(x.status),
  )) {
    for (const rel of namedIn(m.slug)) {
      warn(
        `${rel} names '${m.slug}' (${m.status}, released ${m.released}) — confirm the mention is ` +
          `a do-not-use marker, not a recommendation`,
      );
    }
  }

  if (!quiet) {
    console.log(
      `checked ${models.length} models across ` +
        `${new Set(models.map((m) => m.vendor)).size} vendors; ` +
        `${failures} FAIL, ${warnings} WARN`,
    );
  }
}

try {
  main();
} catch (e) {
  fail(`check-releases crashed: ${e instanceof Error ? e.message : String(e)}`);
}
process.exit(failures === 0 ? 0 : 1);
