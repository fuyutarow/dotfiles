"""Extract every DEFINITION (function, method, type) in a ccc project, one JSON line each.

Run by definitions.ts under ccc's OWN interpreter (like ccc_scope.py), so the set of files is ccc's
own scope (include/exclude globs, nested .gitignore) and the parse is ccc's own tree-sitter
(cocoindex.ops.code) — never a reimplementation that could drift from what `concept` indexes.

argv[1]: project root. argv[2] (optional): previous cache JSON; argv[3]: where to write the new one;
argv[4:6] (optional): `--only <paths.json>` re-checks just those paths (git named every path that
may differ) and skips the full tree walk.
Without argv[2]/[3], prints JSONL records to stdout (one-shot use).
Cache: {"version", "files": {rel: {"mtime_ns", "size", "records", "publics"}}} — a file whose
mtime and size are unchanged reuses its records, so a re-run after a few edits re-parses only those
files (firedancer: 491 .jl files, 15 s full, well under 1 s for a typical commit).
Record: {"name","kind","lang","file","start","end","signature","doc","body","public"}
`start`/`end` are 1-based lines of the definition itself; `doc` is the docstring or the comment
block attached to it (Julia/Python string, `#`/`//`/`///`/`/** */` comments directly above).

Patterns are by-example (cocoindex code_match). A language with no pattern is skipped, not
guessed: an unlisted language yields no records rather than wrong ones.
"""

import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path, PurePath

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

CACHE_VERSION = 2  # bump whenever extraction output changes for an unchanged file
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


PUBLIC_STMT = re.compile(r"^\s*(?:public|export)\s+([^#\n]+(?:,\s*\n[^#\n]+)*)", re.M)


def julia_publics(text: str) -> list[str]:
    """Names listed in `public` / `export` statements. Julia declares visibility apart from the
    definition (often in the package's main file), so the set is resolved repo-wide later."""
    out = []
    for m in PUBLIC_STMT.finditer(text):
        out += [n.strip() for n in re.split(r"[,\s]+", m.group(1)) if n.strip()]
    return out


def declared_public(lines: list[str], start: int, lang: str, name: str) -> bool:
    line = lines[start - 1].lstrip() if 0 < start <= len(lines) else ""
    if lang in ("typescript", "javascript", "tsx"):
        return line.startswith("export ")
    if lang == "rust":
        return line.startswith("pub ")
    if lang == "python":
        return not name.startswith("_")
    return False  # julia: decided by julia_publics across the repo


def extract(root: Path, rel: str) -> tuple[list[dict], list[str]]:
    path = root / rel
    try:
        if path.stat().st_size > MAX_FILE_BYTES:
            return [], []
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return [], []
    lang = detect_code_language(filename=rel)
    pats = compiled(lang) if lang else []
    if not pats:
        return [], []
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
            name = re.split(r"[{\s<(]", names[0].text, maxsplit=1)[0]  # `Foo{T <: X}` -> `Foo`
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
                "public": declared_public(lines, start, lang, name),
            }
    return list(seen.values()), (julia_publics(text) if lang == "julia" else [])


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    old = {}
    if len(sys.argv) >= 3 and os.path.exists(sys.argv[2]):
        try:
            cached = json.load(open(sys.argv[2]))
            # A cache written by another extractor version may hold records this version would
            # parse differently (e.g. `Foo{T}` names before the 2026-10-01 fix): start over.
            old = cached.get("files", {}) if cached.get("version") == CACHE_VERSION else {}
        except (OSError, ValueError):  # an unreadable cache is a full rebuild, not a failure
            old = {}
    settings = load_project_settings(root)
    matcher = build_matcher(root, settings.include_patterns, settings.exclude_patterns)
    files: dict[str, dict] = {}
    todo: list[tuple[str, int, int]] = []
    only = None
    if len(sys.argv) >= 6 and sys.argv[4] == "--only" and old:
        only = json.load(open(sys.argv[5]))

    def in_scope(rel: str) -> bool:
        pure = PurePath(rel)
        for depth in range(1, len(pure.parts)):
            if not matcher.is_dir_included(PurePath(*pure.parts[:depth])):
                return False
        return matcher.is_file_included(pure)

    def consider(r: str, abs_path: Path) -> None:
        st = abs_path.stat()
        prev = old.get(r)
        if prev and prev["mtime_ns"] == st.st_mtime_ns and prev["size"] == st.st_size:
            files[r] = prev
        else:
            todo.append((r, st.st_mtime_ns, st.st_size))

    if only is not None:
        # The caller (git) named every path that may differ; everything else is the cache as is.
        # Skips the full tree walk — the expensive part (~2.5 s of 3.4 s on firedancer).
        files.update(old)
        for r in only:
            files.pop(r, None)
            p = root / r
            if p.is_file() and detect_code_language(filename=r) in PATTERNS and in_scope(r):
                consider(r, p)
    else:
        for _abs, rel in iter_included_files(root, root, matcher):
            r = str(rel)
            if detect_code_language(filename=r) in PATTERNS:
                consider(r, _abs)
    with ThreadPoolExecutor(max_workers=8) as pool:
        for (r, mt, sz), (records, publics) in zip(todo, pool.map(lambda t: extract(root, t[0]), todo)):
            files[r] = {"mtime_ns": mt, "size": sz, "records": records, "publics": publics}
    if len(sys.argv) >= 4:
        tmp = sys.argv[3] + ".tmp"
        with open(tmp, "w") as f:
            json.dump({"version": CACHE_VERSION, "files": files}, f, ensure_ascii=False)
        os.replace(tmp, sys.argv[3])
        sys.stderr.write(f"ccc_defs: {len(files)} files, {len(todo)} re-parsed\n")
        return
    publics = {n for v in files.values() for n in v["publics"]}
    for v in files.values():
        for rec in v["records"]:
            rec["public"] = rec["public"] or rec["name"] in publics
            sys.stdout.write(json.dumps(rec, ensure_ascii=False) + "\n")


main()
