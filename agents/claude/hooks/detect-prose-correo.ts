#!/usr/bin/env bun
// Stop hook — prose slop guard, wrapping the correo binary (Rust; bundles the three
// detectors that replaced detect-codemix.sh / detect-coinage.sh / coinage_flag.py).
//
// Division of labor: correo reads text and locates findings (advisory); the BLOCK
// policy lives HERE in the wrapper, and lib.ts owns the hook-protocol plumbing:
//   layer 1  calque  : english verb + する/される     -> correo exit 1  => block (exit 2)
//   layer 2  codemix : latin density per 100 chars    -> ⚑ lines        => block
//   layer 3  coinage : out-of-dictionary compounds    -> correo exit 1  => block
//
// correo's exit contract: 1 = hit / 0 = clean / 2 = error or skip (e.g. no Sudachi
// dictionary) — so ONLY exit 1 blocks; treating 2 as a hit would misfire on no-dict
// environments (FAIL-SAFE skip instead).
//
// Safety: FAIL OPEN (no correo / any error -> exit 0) / LOOP GUARD (stop_hook_active) /
// TURN-SCOPED / CODE+QUOTE-STRIPPED (correo also strips internally; doubled is harmless).

import { spawnSync } from "node:child_process";
import {
  findExe,
  readStdinJson,
  readTranscript,
  stripCode,
  turnText,
} from "./lib.ts";

// PATH insurance for narrow hook-execution contexts (mirrors the bash predecessor).
const CORREO_FALLBACK_DIRS = [
  "/home/linuxbrew/.linuxbrew/bin",
  `${process.env.HOME ?? ""}/.cargo/bin`,
  "/usr/local/bin",
];

function main(): number {
  const payload = readStdinJson();
  if (payload?.stop_hook_active) return 0;
  const transcript = payload?.transcript_path;
  if (typeof transcript !== "string" || transcript === "") return 0;

  const correo = findExe("correo", CORREO_FALLBACK_DIRS);
  if (correo === null) return 0; // opt-in: silent FAIL-SAFE when not installed

  const turn = turnText(readTranscript(transcript));
  if (turn === "") return 0;
  const stripped = stripCode(turn, { blockquotes: true });

  const run = (...args: string[]) => {
    const r = spawnSync(correo, args, { input: stripped, encoding: "utf8" });
    return { status: r.status, lines: (r.stdout ?? "").split("\n") };
  };

  // layer 1: verb calques (deterministic, always wrong) — exit 1 => block
  const calque = run("calque");
  if (calque.status === 1) {
    console.error(
      [
        'Code-switching: 英語動詞を する/される に接いだ（例 "commitする" / "flag された"）。',
        "カタカナ動詞（コミットする）か日本語動詞（引用する / 実行する）へ。register 非依存。",
        ...calque.lines.filter((l) => l.includes("[calque/")).slice(0, 5),
      ].join("\n"),
    );
    return 2;
  }

  // layer 2: loanword-noun density — codemix always exits 0, so count ⚑ lines
  const codemix = run("codemix", "--threshold", "8");
  const hot = codemix.lines.filter((l) => l.startsWith("⚑"));
  if (hot.length > 0) {
    console.error(
      [
        ...hot.slice(0, 8),
        "ルー語密度: この返答の段落が閾値 8 latin/100字 を超えた。",
        "英単語を対訳やカタカナの衣で残さず、概念を日本語の文で書き直すこと。",
      ].join("\n"),
    );
    return 2;
  }

  // layer 3: coinage (out-of-dictionary compounds) — exit 1 => block; exit 2 => skip
  const coinage = run("coinage", "--strict");
  if (coinage.status === 1) {
    console.error(
      [
        "COINAGE GUARD: 辞書外の比喩ラベル複合（造語）がある。標準語へ書き直すか correo.toml の allow に理由つきで登録:",
        ...coinage.lines
          .filter((l) => l.includes("not a dictionary headword"))
          .slice(0, 5),
      ].join("\n"),
    );
    return 2;
  }

  return 0;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0; // FAIL OPEN
}
process.exit(code);
