#!/usr/bin/env python3
"""Novel-coinage candidate flagger (MIX tier) — the layer that catches 機械床.

WHY THIS EXISTS (2026-07-04 survey): the machine floor's AI-slop preset
(@textlint-ja/preset-ai-writing) is a FIXED ~25-phrase hype list — zero generalization to
unseen coinage. And naive corpus frequency does NOT work: `wordfreq` re-tokenizes and estimates
a compound from its components, so 機械床 scored zipf 4.37 ("common"), same as 機械学習. The
signal that separates a coinage from a legit compound is DICTIONARY MEMBERSHIP OF THE WHOLE
COMPOUND: SudachiPy SplitMode.C returns the longest registered unit, so a noun run that the text
treats as one term but that splits into >1 unit is not a dictionary headword → candidate coinage.

TIER = MIX, by construction. Low dict-membership ≠ error: legit-but-unlisted terms (量子計算)
also split. The script NARROWS; a human/model CONFIRMS. It never auto-fixes and never fails a gate.

Prior art: Breen, "Identification of Neologisms in Japanese by Corpus Analysis" (2010).

Run (no install needed — uv fetches into an ephemeral env):
    uvx --with sudachipy --with sudachidict-core python coinage-flag.py < file.md
    uvx --with sudachipy --with sudachidict-core python coinage-flag.py --test
"""
import sys, re

from sudachipy import Dictionary, SplitMode

_tok = Dictionary(dict="core").create()
# content POS that can head/build a compound; particles/verbs/aux are boundaries
_CONTENT = ("名詞", "接頭辞", "接尾辞")
_KANJI_KATA = re.compile(r"[一-鿿゠-ヿ々]")


def candidates(text: str):
    """Yield (compound, components) for adjacent content-noun runs Sudachi C-mode did NOT
    lexicalize — i.e. the whole run is not a single dictionary headword."""
    seen = set()
    for line in text.splitlines():
        toks = _tok.tokenize(line, SplitMode.C)
        run = []
        for m in toks:
            pos0 = m.part_of_speech()[0]
            surf = m.surface()
            if pos0 in _CONTENT and _KANJI_KATA.search(surf):
                run.append(surf)
            else:
                _emit(run, seen)
                run = []
        _emit(run, seen)


def _emit(run, seen):
    # a run of >=2 adjacent content units = a compound Sudachi did not register as one headword
    if len(run) >= 2:
        compound = "".join(run)
        if compound not in seen:
            seen.add(compound)
            print(f"⚑ {compound}\tcomponents={run}\t(MIX: not a dict headword — confirm coinage vs legit-unlisted term)")


def _test():
    probe = "機械床 と 再フレーム は造語だが、機械学習 や 深層学習 や 計算機科学 は既存語。量子計算 は正当だが辞書未登録。"
    print("# self-test (expect 機械床/再フレーム flagged; 機械学習/深層学習/計算機科学 NOT; 量子計算 = known FP → MIX):")
    candidates(probe)


if __name__ == "__main__":
    if "--test" in sys.argv:
        _test()
    else:
        candidates(sys.stdin.read())
