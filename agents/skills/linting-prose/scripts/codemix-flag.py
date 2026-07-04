#!/usr/bin/env python3
"""Code-mixing (ルー語) ratio flagger — MIX tier. Zero dependencies.

WHY (2026-07-04, QOED R2607_021): a generated JA document reached 15 latin tokens per 100
Japanese chars in prose ("cite する", "deliverable である", "moat を主張しない") and the floor was
GREEN — no code-mixing signal existed. This script flags paragraphs whose latin-token density
exceeds a threshold, AFTER stripping code spans/fences, URLs, §refs, and ledger IDs.

TIER = MIX by construction: density cannot tell a legitimate domain term (fidelity, CNOT) or a
pinned house token from a gratuitous calque (deliverable→成果物). The script NARROWS to hot
paragraphs and lists their latin vocabulary; the model classifies each token 3-way:
  (1) standard domain term — keep;  (2) pinned house token — keep, identifier register;
  (3) exact-JP-equivalent noun / verb calque — VIOLATION in ANY register (not just external).
Never auto-fix (the 非飽和iciency rule). Verb calques ([a-zA-Z]+する) are HARD via prh role 3.

Usage:
    python3 codemix-flag.py [--threshold 8] file.md ...      # or stdin
"""
import re
import sys

THRESHOLD = 8.0  # latin tokens per 100 JA chars; R2607_021 incident measured 15

_STRIP = re.compile(r"```.*?```|`[^`]*`|https?://\S+|§\S+|R\d{4}_\d+|IF-\d", re.S)
_LATIN = re.compile(r"[a-zA-Z][a-zA-Z_-]+")
_JA = re.compile(r"[ぁ-んァ-ヶ一-鿿]")


def flag(text: str, threshold: float, label: str = "") -> None:
    for i, para in enumerate(re.split(r"\n\s*\n", text)):
        clean = _STRIP.sub("", para)
        ja = len(_JA.findall(clean))
        if ja < 40:  # too short / not JA prose — density is meaningless
            continue
        latin = _LATIN.findall(clean)
        density = len(latin) * 100.0 / ja
        if density >= threshold:
            vocab = sorted(set(w.lower() for w in latin))
            print(f"⚑ {label}¶{i + 1}: {density:.0f} latin/100字 (JA {ja} chars)")
            print(f"   classify 3-way (domain/pinned/gratuitous): {' '.join(vocab)}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    th = THRESHOLD
    for a in sys.argv[1:]:
        if a.startswith("--threshold"):
            th = float(a.split("=", 1)[1]) if "=" in a else th
    if args:
        for f in args:
            flag(open(f).read(), th, label=f"{f} ")
    else:
        flag(sys.stdin.read(), th)
