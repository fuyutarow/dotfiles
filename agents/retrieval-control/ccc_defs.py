"""Extract every DEFINITION (function, method, type) in a ccc project, one JSON line each.

Run by definitions.ts under ccc's OWN interpreter (like ccc_scope.py), so the set of files is ccc's
own scope (include/exclude globs, nested .gitignore) and the parse is ccc's own tree-sitter
(cocoindex.ops.code) — never a reimplementation that could drift from what `concept` indexes.

argv[1]: project root. stdout: JSONL records
  {"name","kind","lang","file","start","end","signature","doc","body"}
`start`/`end` are 1-based lines of the definition itself; `doc` is the docstring or the comment
block attached to it (Julia/Python string, `#`/`//`/`///`/`/** */` comments directly above).

Patterns are by-example (cocoindex code_match). A language with no pattern is skipped, not
guessed: an unlisted language yields no records rather than wrong ones.
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from cocoindex.ops.code import CodePattern, CodeSource
from cocoindex.ops.text import detect_code_language
from cocoindex_code.file_walk import build_matcher, iter_included_files
from cocoindex_code.settings import load_project_settings

PATTERNS: dict[str, list[str]] = {
    "julia": [
        r"function \NAME(\(A*\)) \(B*\) end",
        r"function \NAME(\(A*\)) where \(W*\) \(B*\) end",
        r"function \NAME(\(A*\))::\R \(B*\) end",
        r"function \NAME(\(A*\))::\R where \(W*\) \(B*\) end",
        r"\NAME(\(A*\)) = \BODY",
        r"\NAME(\(A*\)) where \(W*\) = \BODY",
        r"macro \NAME(\(A*\)) \(B*\) end",
        r"struct \NAME \(B*\) end",
        r"mutable struct \NAME \(B*\) end",
        r"abstract type \NAME end",
    ],
    "python": [
        r"def \NAME(\(A*\)): \(B*\)",
        r"def \NAME(\(A*\)) -> \R: \(B*\)",
        r"async def \NAME(\(A*\)): \(B*\)",
        r"class \NAME: \(B*\)",
        r"class \NAME(\(A*\)): \(B*\)",
    ],
    "typescript": [
        r"function \NAME(\(A*\)) { \(B*\) }",
        r"function \NAME(\(A*\)): \R { \(B*\) }",
        r"async function \NAME(\(A*\)) { \(B*\) }",
        r"async function \NAME(\(A*\)): \R { \(B*\) }",
        r"const \NAME = (\(A*\)) => \BODY",
        r"const \NAME = async (\(A*\)) => \BODY",
        r"class \NAME { \(B*\) }",
        r"interface \NAME { \(B*\) }",
        r"type \NAME = \T",
    ],
    "rust": [
        r"fn \NAME(\(A*\)) { \(B*\) }",
        r"fn \NAME(\(A*\)) -> \R { \(B*\) }",
        r"struct \NAME { \(B*\) }",
        r"enum \NAME { \(B*\) }",
        r"trait \NAME { \(B*\) }",
    ],
}
PATTERNS["javascript"] = PATTERNS["typescript"]
PATTERNS["tsx"] = PATTERNS["typescript"]

MAX_FILE_BYTES = 2_000_000
BODY_LINES = 24
_compiled: dict[str, list[CodePattern]] = {}


def compiled(lang: str) -> list[CodePattern]:
    if lang not in _compiled:
        out = []
        for p in PATTERNS.get(lang, []):
            try:
                out.append(CodePattern(p, language=lang))
            except Exception:  # a pattern this grammar cannot compile: skip that pattern only
                pass
        _compiled[lang] = out
    return _compiled[lang]


def attached_doc(lines: list[str], start: int, lang: str) -> str:
    """Docstring or comment block directly above line `start` (1-based)."""
    i = start - 2
    while i >= 0 and lines[i].strip() == "":
        i -= 1
    if i < 0:
        return ""
    s = lines[i].strip()
    if lang == "julia" and s.endswith('"""'):
        if s.count('"""') >= 2:
            return s.strip('"').strip()
        j = i - 1
        while j >= 0 and '"""' not in lines[j]:
            j -= 1
        return "\n".join(l.rstrip() for l in lines[max(j, 0) : i + 1]).replace('"""', "").strip()
    if lang == "julia" and s.endswith('"') and s.startswith('"'):
        return s.strip('"')
    prefixes = ("#",) if lang in ("julia", "python") else ("//", "*", "/*", "*/")
    block = []
    while i >= 0 and lines[i].strip().startswith(prefixes):
        block.append(lines[i].strip().lstrip("#/*! ").rstrip("*/ ").strip())
        i -= 1
    return "\n".join(reversed([b for b in block if b]))


def python_docstring(body: list[str]) -> str:
    for k, line in enumerate(body[1:6], start=1):
        t = line.strip()
        for q in ('"""', "'''"):
            if t.startswith(q):
                if t.count(q) >= 2 and len(t) > 3:
                    return t.strip(q).strip()
                rest = [t[3:]]
                for more in body[k + 1 :]:
                    if q in more:
                        rest.append(more.split(q)[0])
                        return "\n".join(x.strip() for x in rest).strip()
                    rest.append(more)
        if t:
            return ""
    return ""


def signature(text: str, lang: str) -> str:
    head = text.split("\n")
    sig = []
    for line in head:
        sig.append(line.rstrip())
        joined = " ".join(sig)
        if lang in ("julia",) and (joined.count("(") <= joined.count(")")):
            break
        if lang in ("python",) and line.rstrip().endswith(":"):
            break
        if lang not in ("julia", "python") and ("{" in line or "=>" in line or line.rstrip().endswith(";")):
            break
        if len(sig) >= 8:
            break
    s = " ".join(x.strip() for x in sig)
    return s.split(" = ")[0] if lang == "julia" and "=" in s and not s.startswith("function") else s


def extract(root: Path, rel: str) -> list[dict]:
    path = root / rel
    try:
        if path.stat().st_size > MAX_FILE_BYTES:
            return []
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []
    lang = detect_code_language(filename=rel)
    pats = compiled(lang) if lang else []
    if not pats:
        return []
    src = CodeSource(text, language=lang)
    lines = text.split("\n")
    seen: dict[tuple[int, str], dict] = {}
    for cp in pats:
        try:
            matches = cp.match_source(src)
        except Exception:
            continue
        for m in matches:
            names = m.captures.get("NAME") or []
            if not names or not m.chunks:
                continue
            name = names[0].text
            chunk = m.chunks[0]
            start, end = chunk.start.line, chunk.end.line
            key = (start, name)
            if key in seen:
                continue
            body = lines[start - 1 : end]
            doc = attached_doc(lines, start, lang)
            if lang == "python" and not doc:
                doc = python_docstring(body)
            seen[key] = {
                "name": name,
                "kind": m.kind,
                "lang": lang,
                "file": rel,
                "start": start,
                "end": end,
                "signature": signature(chunk.text, lang),
                "doc": doc[:1500],
                "body": "\n".join(body[:BODY_LINES]),
            }
    return list(seen.values())


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    settings = load_project_settings(root)
    matcher = build_matcher(root, settings.include_patterns, settings.exclude_patterns)
    files = [str(rel) for _abs, rel in iter_included_files(root, root, matcher)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        for records in pool.map(lambda f: extract(root, f), files):
            for r in records:
                sys.stdout.write(json.dumps(r, ensure_ascii=False) + "\n")


main()
