---
name: lualatex-compile
description: LuaLaTeX（およびpdfLaTeX/XeLaTeX）でTeX原稿をコンパイルしてPDFを生成し、成果物の品質を検証するスキル。ユーザーが .tex ファイルをアップロードしてコンパイルを依頼したとき、LaTeX のビルドエラーを調査・修正したいとき、BibTeX参考文献を含む原稿を仕上げたいとき、revtex4-2・IEEEtrans・elsarticle など学術誌向けクラスファイルを扱うときに必ず使うこと。コンパイル後は相互参照の健全性監査（孤児ラベル・型違い参照の検出）とナビゲーション品質検証（hyperref のリンク・目次・しおりが実在し可視か）まで行う。「コンパイルして」「PDFにして」「ビルドして」「LaTeXエラーを直して」「目次がリンクにならない」「参照が壊れている」などのキーワードで積極的にトリガーすること。tar.gz / zip でまとめてアップロードされた場合も対応する。
---

# LuaLaTeX コンパイル スキル

TeX原稿をコンパイルしてPDFを生成する。**foundation (apt, 冪等) → scan (tlmgr-first, non-relocatable は除外) → inject (ltjsarticle なら Noto CJK 強制) → compile → verify** の順で処理する。

`verify` は三層で行う: (1) ログのエラー/警告 (§3, §4)、(2) 相互参照の健全性 — 孤児ラベル・型違い参照の機械監査 (§4-X)、(3) ナビゲーション品質 — リンク・目次・しおりが実在し可視か (§4.5)。**「コンパイルが通った」は完成ではない。ログに出ない欠陥（リンク不可視・しおり欠落・和文不可視）まで潰してから納品する。**

---

## 0-A. 設計原則: tlmgr-first の正しい意味

「tlmgr で全部やる」ではない。**apt で固定すべき foundation は最初に固定し、その上で個別パッケージは tlmgr** という方針。以下の 3 パッケージは tlmgr usermode では物理的に入らない (`not relocatable`) ので、dep scan から**構造的に除外**する:

| パッケージ | 役割 | 扱い |
|---|---|---|
| `texlive-luatex` (`luaotfload` 含む) | LuaTeX エンジン本体。これが無いと `charrange nil error` が出て和文が死ぬ | §0-B で apt 固定 |
| `haranoaji` | luatexja のデフォルト和文フォント。ltjsarticle が参照 | **入れない**。§3 で Noto CJK に強制切替 |
| `fonts-noto-cjk` | haranoaji の代替 | §0-B で apt 固定 |

> **なぜ haranoaji を捨てるか**: tlmgr で入らないものを入れようとするループが unexpected error の温床だから。Noto CJK は Ubuntu 標準で入っているため、「haranoaji が入ったら使う / 入らなかったら Noto」という条件分岐を廃止し、**ltjsarticle 系は問答無用で Noto CJK を注入**する (§3 参照)。

### 0-B. Foundation bootstrap (apt, 冪等, 毎回先頭で実行)

```bash
# luaotfload を含むエンジン本体 (non-relocatable につき tlmgr 不可)
dpkg -l texlive-luatex 2>/dev/null | grep -q '^ii' || apt-get install -y texlive-luatex

# Noto CJK (Ubuntu では通常プリインストール、念のため)
fc-list | grep -q "Noto Sans CJK JP" || apt-get install -y fonts-noto-cjk
```

両者とも冪等なので既にインストール済みなら数百 ms で抜ける。**これを飛ばして tlmgr に入ると `charrange nil error` を 100 回出して fatal で終了する** (実測済み)。

---

## 0. 作業準備

```bash
cd /home/claude

# アーカイブ展開（tar.gz / zip）
for f in /mnt/user-data/uploads/*.tar.gz /mnt/user-data/uploads/*.tgz; do
  [ -f "$f" ] && tar xzf "$f" -C /home/claude/ 2>/dev/null
done
for f in /mnt/user-data/uploads/*.zip; do
  [ -f "$f" ] && unzip -o "$f" -d /home/claude/ 2>/dev/null
done

# 残りの個別ファイルをコピー
for ext in tex bib bbl sty cls bst pdf png jpg eps svg; do
  cp /mnt/user-data/uploads/*.$ext /home/claude/ 2>/dev/null || true
done

ls /home/claude/*.tex
```

> **重要**: tar.gz / zip にはサブディレクトリが含まれる場合がある。展開後に `.tex` ファイルの場所を確認し、`cd` で移動するか、必要ファイルを `/home/claude/` にコピーすること。

---

## 1. 依存スキャン → パッケージインストール

**原則**: .tex ファイルを先にスキャンし、必要なパッケージを全て特定してから一括導入する。逐次的にコンパイル→失敗→インストールを繰り返さない。

### 1-0. ネットワーク確認（最初に必ず実行）

```bash
if curl -s --max-time 5 -o /dev/null -w "%{http_code}" https://mirror.ctan.org/ 2>/dev/null | grep -qE '^[23]'; then
  echo "NETWORK: available"
  NETWORK=1
else
  echo "NETWORK: unavailable"
  NETWORK=0
fi
```

> ネットワーク不可の場合、パッケージインストールは全手段で失敗する。この場合は §1-4 に進み、同梱 .bbl の活用・不要パッケージの除外等で対処可能かを判断する。不可能なら「ネットワーク設定の変更が必要」とユーザーに伝える。

### 1-1. tlmgr ブートストラップ（初回のみ）

tlmgr（TeX Live Manager）は **apt-get より桁違いに高速**（例: luatexja は tlmgr で 189KB、apt の texlive-lang-japanese は 80MB）。個別パッケージの導入に使う。

```bash
# tlmgr user mode 初期化（冪等——既に初期化済みでも安全）
if [ ! -d /root/texmf/tlpkg ]; then
  tlmgr init-usertree 2>/dev/null
fi

# TeX Live バージョンに合ったリポジトリを設定
# 注: `tlmgr --version` の出力は "TeX Live (https://tug.org/texlive) version 2023"
# `TeX Live \K\d{4}` は URL 側にマッチしないので `version \K\d{4}` を使う
TL_YEAR=$(tlmgr --version 2>&1 | grep -oP 'version \K\d{4}')
if [ "$TL_YEAR" = "2023" ]; then
  REPO="https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/$TL_YEAR/tlnet-final"
elif [ -n "$TL_YEAR" ]; then
  REPO="https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/$TL_YEAR/tlnet-final"
else
  REPO="https://mirror.ctan.org/systems/texlive/tlnet"
fi
tlmgr --usermode option repository "$REPO" 2>/dev/null
echo "tlmgr ready (TeX Live $TL_YEAR, repo: $REPO)"
```

### 1-2. .tex ファイルからの依存判定

```bash
cd /home/claude
TEX_FILE="main.tex"  # 対象ファイル名に置き換え

MISSING_TLMGR=""   # tlmgr パッケージ名のリスト
MISSING_APT=""     # apt パッケージ名のリスト（tlmgr 不可時の fallback）

# ---------- クラスファイル判定 ----------
CLASS=$(grep -oP '\\\\(documentclass|LoadClass)\[.*?\]\{.*?\}' "$TEX_FILE" | grep -oP '\{[^}]+\}' | head -1 | tr -d '{}')
if [ -n "$CLASS" ]; then
  if ! kpsewhich "$CLASS.cls" >/dev/null 2>&1; then
    case "$CLASS" in
      revtex4-2|revtex4|revtex)  MISSING_TLMGR="$MISSING_TLMGR revtex";      MISSING_APT="$MISSING_APT texlive-publishers" ;;
      IEEEtran)                  MISSING_TLMGR="$MISSING_TLMGR ieeetran";     MISSING_APT="$MISSING_APT texlive-publishers" ;;
      elsarticle)                MISSING_TLMGR="$MISSING_TLMGR elsarticle";   MISSING_APT="$MISSING_APT texlive-publishers" ;;
      svjour3|llncs)             MISSING_TLMGR="$MISSING_TLMGR $CLASS";       MISSING_APT="$MISSING_APT texlive-publishers" ;;
      beamer)                    MISSING_TLMGR="$MISSING_TLMGR beamer";       MISSING_APT="$MISSING_APT texlive-latex-recommended" ;;
      ltjsarticle|ltjsbook|ltjsreport|ltjspf|ltjskiyou)
                                 MISSING_TLMGR="$MISSING_TLMGR luatexja luatexbase ctablestack";     MISSING_APT="" ;;  # haranoaji は入れない (§0-A)。Noto CJK は §0-B で apt 固定済み
      *)
        echo "WARN: Unknown class '$CLASS' — will attempt compile and handle errors" ;;
    esac
  fi
fi

# ---------- 日本語（luatexja / luatexja-fontspec）----------
grep -qE '(usepackage|RequirePackage).*(luatexja|ltjtexja)' "$TEX_FILE" && {
  kpsewhich luatexja.sty >/dev/null 2>&1 || {
    MISSING_TLMGR="$MISSING_TLMGR luatexja luatexbase ctablestack"  # haranoaji は入れない (§0-A)
  }
}

# ---------- 除外リスト (tlmgr usermode で not relocatable) ----------
NON_RELOCATABLE="haranoaji luaotfload cm-super"

# ---------- LuaTeX エンジン本体 ----------
kpsewhich luatexbase.sty >/dev/null 2>&1 || {
  MISSING_TLMGR="$MISSING_TLMGR luatexbase"
  MISSING_APT="$MISSING_APT texlive-luatex"
}

# ---------- パッケージ網羅スキャン ----------
# 各パッケージの sty名 → tlmgr名 のマッピング
# 大半は sty名 = tlmgr名 だが例外あり

# texlive-latex-extra に相当するパッケージ群（個別に確認）
for sty in tcolorbox cleveref booktabs enumitem caption natbib mathtools \
           hyperref xcolor etoolbox adjustbox pdfpages mdframed minted \
           fancyhdr titlesec longtable array; do
  if grep -qE "(usepackage|RequirePackage).*\\b${sty}\\b" "$TEX_FILE" 2>/dev/null; then
    kpsewhich "$sty.sty" >/dev/null 2>&1 || {
      MISSING_TLMGR="$MISSING_TLMGR $sty"
      MISSING_APT="$MISSING_APT texlive-latex-extra"
    }
  fi
done

# texlive-science に相当するパッケージ群
for sty in siunitx physics braket tensor; do
  if grep -qE "(usepackage|RequirePackage).*\\b${sty}\\b" "$TEX_FILE" 2>/dev/null; then
    kpsewhich "$sty.sty" >/dev/null 2>&1 || {
      MISSING_TLMGR="$MISSING_TLMGR $sty"
      MISSING_APT="$MISSING_APT texlive-science"
    }
  fi
done

# texlive-pictures（tikz/pgf）
grep -qE '(usepackage|RequirePackage).*(tikz|pgfplots|pgf)' "$TEX_FILE" && {
  kpsewhich tikz.sty >/dev/null 2>&1 || {
    MISSING_TLMGR="$MISSING_TLMGR pgf"
    MISSING_APT="$MISSING_APT texlive-pictures"
  }
}

# texlive-fonts-extra
grep -qE '(usepackage|RequirePackage).*(newpxtext|libertine|newtxtext|newtxmath|stix|fontawesome)' "$TEX_FILE" && {
  kpsewhich newpxtext.sty >/dev/null 2>&1 || {
    MISSING_TLMGR="$MISSING_TLMGR newpx"
    MISSING_APT="$MISSING_APT texlive-fonts-extra"
  }
}

# 重複除去 + non-relocatable 除外
MISSING_TLMGR=$(echo "$MISSING_TLMGR" | tr ' ' '\n' | sort -u | grep -vxF -f <(echo "$NON_RELOCATABLE" | tr ' ' '\n') | tr '\n' ' ' | xargs)
MISSING_APT=$(echo "$MISSING_APT" | tr ' ' '\n' | sort -u | tr '\n' ' ' | xargs)

echo "Missing (tlmgr names): ${MISSING_TLMGR:-none}"
echo "Missing (apt names):   ${MISSING_APT:-none}"
```

### 1-3. インストール（tlmgr 優先、apt fallback）

**重要**: `tlmgr --usermode` は transitive な依存関係を自動解決**しない**。例えば `luatexja` → `luatexbase` → `ctablestack` のような連鎖が存在する。ただし各 install は数秒で完了するため、以下の iterative loop が実用的：

```bash
if [ -n "$MISSING_TLMGR" ] && [ "$NETWORK" = "1" ]; then
  echo "=== Installing via tlmgr (fast, targeted) ==="
  for pkg in $MISSING_TLMGR; do
    echo "  Installing: $pkg"
    tlmgr --usermode install "$pkg" 2>&1 | tail -2
  done

  # Transitive dependency resolution loop (tlmgr 固有)
  # tlmgr の install は数秒なので iterative で問題ない
  for attempt in $(seq 1 10); do
    timeout 120 lualatex -interaction=nonstopmode "$TEX_FILE" 2>&1 | tail -2
    # PDF が生成されたら成功
    if [ -f "${TEX_FILE%.tex}.pdf" ] && ! grep -q "no output PDF file produced" "${TEX_FILE%.tex}.log" 2>/dev/null; then
      break
    fi
    # 不足ファイルを抽出
    DEP=$(grep "^! LaTeX Error: File" "${TEX_FILE%.tex}.log" | head -1 | grep -oP "'\K[^']+")
    if [ -z "$DEP" ]; then
      # File not found 以外の致命的エラー（エンコーディング不明・フォント不在等）
      if grep -qE "Encoding scheme.*unknown|Font .* not found|luaotfload.*cannot|KANJI" "${TEX_FILE%.tex}.log" 2>/dev/null; then
        echo "  Non-file-not-found error (encoding/font). Falling back to apt."
        apt-get update -qq && apt-get install -y $MISSING_APT
        break
      fi
      break
    fi
    PKG=$(tlmgr --usermode search --global --file "$DEP" 2>/dev/null | grep -E "^[a-zA-Z]" | grep -v "^TeX Live\|^and will\|^For general\|^texlive-scripts\|^tlmgr:\|^release " | head -1 | sed 's/://')
    if [ -n "$PKG" ]; then
      echo "  Transitive dep: $DEP -> $PKG"
      tlmgr --usermode install "$PKG" 2>&1 | tail -2
    else
      echo "  Cannot resolve $DEP via tlmgr, falling back to apt"
      apt-get update -qq && apt-get install -y $MISSING_APT
      break
    fi
  done
fi
```

### 1-4. ネットワーク不可時の対処

パッケージインストールが不可能な場合、以下の順で検討する：

1. **.bbl 同梱**: `\bibliography{...}` の代わりに `.bbl` を `\input` すれば bibtex は不要
2. **不要パッケージの除外**: 装飾用パッケージ（tcolorbox, fancyhdr 等）を除去して最小構成でコンパイル
3. **クラス変更**: `ltjsarticle` → `article`（日本語を失うが英語部分は出力可能）
4. **断念**: ユーザーにネットワーク設定の変更を依頼

---

## 1.5. ltjsarticle 系への Noto CJK 強制注入（コンパイル前の必須処理）

`ltjsarticle` / `ltjsbook` / `ltjsreport` / `ltjspf` / `ltjskiyou` を使う原稿は、haranoaji を入れない方針 (§0-A) なので、**コンパイル前に必ず Noto CJK 再定義を注入する**。これを飛ばすと PDF は生成されるが **和文が完全に不可視** になり、エラーは一切出ない (silent failure)。

```bash
if grep -qE '\\documentclass(\[[^]]*\])?\{ltjs' "$TEX_FILE"; then
  if ! grep -q 'ltj@stdmcfont' "$TEX_FILE"; then
    # \documentclass の直前に makeatletter ブロックを挿入
    sed -i '0,/\\documentclass/{s|\\documentclass|\\makeatletter\n\\def\\ltj@stdmcfont{file:NotoSerifCJK-Regular.ttc:0}\n\\def\\ltj@stdgtfont{file:NotoSansCJK-Regular.ttc:0}\n\\makeatother\n\\documentclass|}' "$TEX_FILE"
    echo "Injected Noto CJK font redefinition for ltjs* class"
  fi
fi
```

> **重要**: `\documentclass` の **後** では効果がない。必ず前に挿入すること。既に注入済み (`ltj@stdmcfont` が原稿内に存在) の場合はスキップ (冪等)。

### 検証 (compile 後)

```bash
grep -c 'HaranoAji\|metric data not found' "$STEM.log"  # → 0 が期待値
pdffonts "$STEM.pdf" | grep -i noto                      # → NotoSerifCJKjp / NotoSansCJKjp が出れば OK
pdftotext "$STEM.pdf" - | head                           # → 日本語が文字化けせず読めるか目視
```

---

## 2. コンパイル手順

### 参考文献の有無を確認

```bash
HAS_BIB=0
HAS_BBL=0
ls /home/claude/*.bib >/dev/null 2>&1 && HAS_BIB=1
ls /home/claude/*.bbl >/dev/null 2>&1 && HAS_BBL=1
grep -lE '\\bibliography|\\addbibresource' /home/claude/*.tex >/dev/null 2>&1 && HAS_BIB=1
```

### .bbl 同梱の場合（bibtex スキップ）

```bash
STEM="${TEX_FILE%.tex}"
lualatex -interaction=nonstopmode "$TEX_FILE"
lualatex -interaction=nonstopmode "$TEX_FILE"   # 参照解決のため2回
```

> `.bbl` が同梱されている場合、`bibtex` の実行は不要（`.bib` を変更した場合のみ必要）。

### BibTeX あり（.bbl なし or .bib 変更あり）

```bash
STEM="${TEX_FILE%.tex}"
lualatex -interaction=nonstopmode "$TEX_FILE"
bibtex "$STEM"
lualatex -interaction=nonstopmode "$TEX_FILE"
lualatex -interaction=nonstopmode "$TEX_FILE"
```

### Biber/biblatex あり

```bash
STEM="${TEX_FILE%.tex}"
lualatex -interaction=nonstopmode "$TEX_FILE"
biber "$STEM"
lualatex -interaction=nonstopmode "$TEX_FILE"
lualatex -interaction=nonstopmode "$TEX_FILE"
```

---

## 3. エラー確認と対処

### 致命的エラーのみ抽出

```bash
grep "^!" "${TEX_FILE%.tex}.log" | head -20
```

### 主なエラーと対処

| エラーメッセージ | 原因 | 対処 |
|---|---|---|
| `File 'xxx.cls' not found` | クラスファイル未インストール | `tlmgr --usermode install <pkg>` → apt fallback |
| `File 'xxx.sty' not found` | パッケージ未インストール | 同上。`tlmgr --usermode search --global --file xxx.sty` で探索 |
| `File 'luatexja.sty' not found` | 日本語パッケージ不足 | `tlmgr --usermode install luatexja luatexbase ctablestack haranoaji haranoaji-extra` |
| `KANJI Encoding scheme 'JY3' unknown` | luatexja の transitive deps 不足（フォント・エンコーディング定義） | `haranoaji haranoaji-extra` を追加インストール。または `apt install texlive-lang-japanese` |
| `[\directlua]:1: attempt to index a nil value (global 'fonts')` | **luaotfload が実行時 load に失敗**。luatexja 関連 lua モジュール（`fonts`, `jfont`, `ltjj`, `stack` 等）が初期化されない。エラーメッセージは misleading で luaotfload を直接指さないことが多い | §3-X の sanity check で確認 → §8 luaotfload 救済手順 |
| `[\directlua]:1: attempt to index a nil value (field 'charrange')` | luatexja と luatexbase のバージョン不整合、**または** luaotfload が壊れている | 第一段: `/root/texmf/tex/luatex/{luatexja,luatexbase,ctablestack}` を削除 → `tlmgr --usermode remove --force` → 再 install。それで治らなければ §8 |
| `Error in luaotfload: reverting to OT1` | フォントローダー警告（**無害**） | 無視可 |
| `Font shape ... undefined` | OT1フォールバック警告（**無害**） | 無視可 |
| `manuscript is obsolete` | revtex4-2 クラス警告 | 無視可 |

> 警告（Warning）はエラーではない。`^!` で始まる行のみが致命的エラー。
> **重要:** `attempt to index a nil value` 系エラーが出たら、必ず §3-X の sanity check を先に実行する。原因はほぼ常に luaotfload の load 失敗だが、エラー文面ではそれが分からない。

### 3-X. luaotfload sanity check（nil error 系の必須前処理）

`attempt to index a nil value` 系エラーまたは日本語が pdf に現れない症状が出たら、本格的な再ビルドの前に luaotfload が単独で動作するかを 5 秒で確認する。

```bash
cat > /tmp/luaotfload_check.tex <<'EOF'
\documentclass{article}
\directlua{
  if luaotfload then
    texio.write_nl("LUAOTFLOAD_OK: " .. (luaotfload.version or "?"))
  else
    texio.write_nl("LUAOTFLOAD_MISSING")
  end
}
\begin{document}
test
\end{document}
EOF
cd /tmp && lualatex -interaction=nonstopmode luaotfload_check.tex 2>&1 | grep -E "LUAOTFLOAD|^!" | head -5
```

> **重要:** `tex.print` を `\directlua` プリアンブル内で使うと `Missing \begin{document}` で詰まる。プリアンブルでの診断出力は必ず `texio.write_nl` を使う（log と stderr に直接書く、本文には影響しない）。

判定:
- `LUAOTFLOAD_OK: <version>` が出れば luaotfload 自体は健全 → 問題は luatexja 側のバージョン不整合 → §3 charrange 修復
- `LUAOTFLOAD_MISSING` または `module 'luaotfload-main' not found` または lua スタックトレース → luaotfload が壊れている → **§8 luaotfload 救済手順**へ

### 未知パッケージの解決

```bash
# sty/cls 名から tlmgr パッケージ名を逆引き
tlmgr --usermode search --global --file "missing_name.sty" 2>/dev/null | grep -E "^[a-zA-Z]"
# → パッケージ名が得られたら install
tlmgr --usermode install <package_name>
```

### フォント関連（HaranoAji / Noto CJK）

```bash
# HaranoAji フォント（luatexja のデフォルト）
fc-list | grep -i haranoaji
# なければ tlmgr で導入（軽量）
tlmgr --usermode install haranoaji haranoaji-extra 2>/dev/null

# Noto CJK（多くの環境にプリインストール）がある場合はそちらでも可
fc-list | grep -i "noto.*cjk"
```

---

## 4. コンパイル後の品質チェック

コンパイルが成功（`^!` エラーなし）した後、以下を確認する：

```bash
STEM="${TEX_FILE%.tex}"

# 未定義参照
echo "Undefined refs: $(grep -c 'Warning.*undefined' "$STEM.log" 2>/dev/null || echo 0)"

# 未解決引用
echo "Undefined citations: $(grep -c 'Citation.*undefined' "$STEM.log" 2>/dev/null || echo 0)"

# 重複ラベル
echo "Multiply defined: $(grep -c 'multiply defined' "$STEM.log" 2>/dev/null || echo 0)"

# Overfull hbox（深刻なもの: 20pt 超過）
echo "Overfull hbox >20pt:"
grep "Overfull.*hbox" "$STEM.log" | awk -F'[()]' '{if($2+0>20) print}' | head -10

# 出力に ?? が残っていないか（未解決の \ref/\cite が ?? として印字される）
echo "Unresolved ?? in PDF: $(pdftotext "$STEM.pdf" - 2>/dev/null | grep -c '??')"
```

> 未定義参照・引用が残っていれば bibtex/lualatex の追加パスが必要。Overfull hbox は 20pt 以下なら通常問題ない。`??` が 1 つでも残っていれば参照が未解決。

### 4-X. 相互参照の健全性監査（ログだけでは不十分）

`grep undefined` で 0 でも、**孤児ラベル**（`\label` したが誰も `\ref` しない）や**型違い参照**（節を `\eqref` する等）は検出できない。`\label` と参照を突き合わせる機械監査を行う。これは「未定義ゼロ」より強い検査である。

```bash
cd /home/claude
python3 - "$TEX_FILE" <<'PYEOF'
import re, sys, glob
# 全 .tex を結合（\input/\include 対応）
texts = "".join(open(f, encoding="utf-8", errors="ignore").read()
                 for f in glob.glob("*.tex"))
labels = set(re.findall(r'\\label\{([^}]+)\}', texts))
refs = []
for m in re.finditer(r'\\[cC]ref\{([^}]+)\}', texts):
    refs += [('cref', r.strip()) for r in m.group(1).split(',')]
for m in re.finditer(r'\\eqref\{([^}]+)\}', texts):
    refs.append(('eqref', m.group(1).strip()))
for m in re.finditer(r'(?<![cC])\\ref\{([^}]+)\}', texts):
    refs.append(('ref', m.group(1).strip()))
ref_names = set(r for _, r in refs)

undef = sorted(r for _, r in refs if r not in labels)
orphan = sorted(l for l in labels if l not in ref_names)
eqref_bad = sorted(r for k, r in refs if k == 'eqref' and not r.startswith('eq:'))

print(f"labels={len(labels)}  refs={len(refs)}")
print(f"[1] undefined refs : {len(undef)}  {undef if undef else ''}")
print(f"[2] orphan labels  : {len(orphan)}  {orphan if orphan else ''}")
print(f"[3] eqref→non-eq   : {len(eqref_bad)}  {eqref_bad if eqref_bad else ''}")
PYEOF
```

> 判定: [1] は 0 必須。[2] の孤児のうち `sec:`/`chap:` の見出しラベルは hyperref の目次アンカーとして機能するため**残置が正当**。式・命題・図表ラベルの孤児は「貼ったが指していない」死にラベルなので、本文から参照を通すか削除する。[3] は型不整合（節や図を `\eqref` している）で 0 にする。

### 4.5. リンクとナビゲーション品質（成果物が「読み物」として機能するか）

コンパイルが通ることと、出来た PDF が**目次から飛べる・リンクが見える**ことは別の品質である。`\tableofcontents` と `hyperref` があっても、(a) リンクが生成されていない、(b) 生成されているが色設定で**不可視**、のいずれかで「リンクになっていない」と受け取られる。ログには一切出ないので、PDF を直接検査する。

**機械検査（pikepdf で Link 注釈・しおりの実在を数える）:**

```bash
cd /home/claude
pip install pikepdf --break-system-packages -q 2>/dev/null
python3 - "${TEX_FILE%.tex}.pdf" <<'PYEOF'
import sys, pikepdf
pdf = pikepdf.open(sys.argv[1])
nlink = 0
for page in pdf.pages:
    if "/Annots" in page:
        nlink += sum(1 for a in page.Annots
                     if str(a.get("/Subtype")) == "/Link")
nout = 0
if "/Outlines" in pdf.Root and "/First" in pdf.Root.Outlines:
    c = pdf.Root.Outlines.First
    while True:
        nout += 1
        if "/Next" in c: c = c.Next
        else: break
print(f"Link annotations : {nlink}")
print(f"PDF bookmarks(L1): {nout}")
print("→ tableofcontents があるのに Link=0 なら hyperref 未読込/順序ミス")
print("→ bookmarks=0 なら しおり未生成（hyperref が無効）")
PYEOF
```

**可視性（色）の指針 — モダンな既定:**

`hyperref` の既定（`colorlinks=false`）は枠線ボックスで囲む古いスタイル。モダンには `colorlinks=true` で色を付ける。ただし**色名を必ず付ける**こと。`linkcolor=black` にすると、リンクは機能するが黒文字と区別できず「リンクではない」と誤認される（今回の典型的失敗）。

```latex
% モダンな既定（非 revtex クラス）。xcolor を先に読む
\usepackage{xcolor}
\definecolor{linknavy}{rgb}{0.10,0.30,0.65}
\definecolor{citegreen}{rgb}{0.00,0.40,0.00}
\usepackage[
  colorlinks=true,
  linkcolor=linknavy,   % 内部リンク（目次・節・式・定理）
  citecolor=citegreen,  % 引用
  urlcolor=blue,        % 外部 URL
  linktoc=all,          % 目次は「番号」と「題名」の両方をリンク領域にする
  bookmarksnumbered=true % しおりに節番号を入れる
]{hyperref}
```

| 設定 | 効果 | 外すと |
|---|---|---|
| `linkcolor=<色名>` | 内部リンクが視認できる | `black` だと不可視（リンクと気づけない） |
| `linktoc=all` | 目次の番号＋題名の全体がクリック領域 | 既定 `section` だと題名だけ等、クリック範囲が狭い |
| `bookmarksnumbered=true` | PDF しおりに節番号 | しおりが題名のみで階層が読みにくい |
| `xcolor` を hyperref より前に | 色名が解決される | `[rgb]{...}` 直書きはオプション解析を壊し `0.10.sty not found` 系の fatal を招く |

> **revtex4-2 は例外**: revtex が hyperref を内部管理するため、上記オプションは付けられない（§7-2）。revtex で色を変えたい場合は `\hypersetup{...}` を `\begin{document}` の後に置く。それ以外のクラス（article, ltjsarticle, ltjsbook 等）では上記テンプレートを既定とする。

**検証（色が付いたか）:**

```bash
# Link 注釈の色指定が入ったか、しおり階層が出たか
python3 - "${TEX_FILE%.tex}.pdf" <<'PYEOF'
import sys, pikepdf
pdf = pikepdf.open(sys.argv[1])
p_toc = next((p for p in pdf.pages
              if "/Annots" in p and any(str(a.get("/Subtype"))=="/Link"
                                        for a in p.Annots)), None)
if p_toc is not None:
    a = next(a for a in p_toc.Annots if str(a.get("/Subtype"))=="/Link")
    dest = a.get("/A") or a.get("/Dest")
    print("first link action:", str(dest)[:70])  # /GoTo ... なら内部遷移 OK
PYEOF
```

---

## 5. PDF出力と提供

```bash
ls -lh /home/claude/"${TEX_FILE%.tex}.pdf"
cp /home/claude/"${TEX_FILE%.tex}.pdf" /mnt/user-data/outputs/
```

`present_files` ツールでPDFを提示する。

---

## 6. 注意事項

- `/mnt/user-data/uploads` は**読み取り専用**。編集・コンパイルは必ず `/home/claude/` で行う。
- `.bib`, `.bbl`, `.cls`, `.sty`, `.bst`, 画像ファイル等もすべてコピーすること。
- `\input` / `\include` で参照されるサブファイルも同じディレクトリに必要。
- `texlive-full` は巨大で時間がかかるため**非推奨**。tlmgr で個別に対処する。

### tlmgr vs apt-get 選択指針

| 状況 | 推奨 | 理由 |
|---|---|---|
| 個別パッケージ 1〜5 個 | `tlmgr --usermode install` | 桁違いに高速（KB単位 vs MB単位） |
| 大量パッケージ（>10個） | `apt-get install texlive-xxx` | バンドルのほうが効率的 |
| tlmgr リポジトリエラー | `apt-get` fallback | TL バージョン不一致時のリカバリ |
| ネットワーク不可 | §1-4 参照 | 両者とも失敗するため代替策 |

### よくあるクラス別パッケージ組み合わせ（tlmgr 名）

| クラス | tlmgr パッケージ（transitive deps 込み） |
|---|---|
| ltjsarticle（日本語）| `luatexja luatexbase ctablestack haranoaji haranoaji-extra` |
| revtex4-2 + 日本語 + 数式 | `revtex luatexja luatexbase ctablestack haranoaji haranoaji-extra` |
| IEEEtran | `ieeetran` |
| beamer | `beamer` |
| elsarticle | `elsarticle` |

### 見出しの余白は自作しない（重要）

クラスファイル（ltjsarticle, article 等）の `\section` / `\subsection` が持つ余白設計は、長年の組版経験の蓄積である。以下のアンチパターンを踏まないこと：

| アンチパターン | 問題 | 正しい方法 |
|---|---|---|
| `\newcommand{\myhead}[1]{\vspace{...}\textbf{...}}` | クラスの余白設計と不揃いになる。`\section*` と混在すると破綻 | `\section*` を使う。右寄せ注釈は `\hfill` で付ける |
| `\bigskip` や `\vspace` で見出し上の余白を手動調整 | 前後の要素（表、図、テキスト）によって見た目が変わる | `titlesec` の `\titlespacing` で一括制御 |
| 見出し間で余白量がバラバラ（ある箇所に `\bigskip`、別の箇所にはなし） | ページ全体の統一感が崩れる | 全見出しの余白はクラスファイルまたは `\titlespacing` で統一 |

**原則:** 見出しには `\section*` / `\subsection*` を使い、カスタマイズが必要な場合は `\titleformat` / `\titlespacing` で制御する。`\newcommand` で見出し風コマンドを発明しない。

---

## 7. revtex4-2 + lualatex 互換性ガイド（重要）

revtex4-2 と lualatex の組み合わせには固有の互換性問題がある。以下を厳守すること。

### 7-1. プリアンブルテンプレート（動作確認済み）

```latex
\documentclass[preprint,aps,prx,superscriptaddress,longbibliography]{revtex4-2}
\usepackage{luatexja}                          % [match] オプション不可
\usepackage{amsmath,amssymb,amsthm,mathtools}  % amsthm 必須（proof 環境）
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{hyperref}                          % オプション不可（revtex が管理）
\usepackage{cleveref}                          % hyperref の後に読み込む

\newtheorem{theorem}{Theorem}
\newtheorem{lemma}[theorem]{Lemma}
\newtheorem{corollary}[theorem]{Corollary}
\newtheorem{proposition}[theorem]{Proposition}
\theoremstyle{definition}
\newtheorem{definition}[theorem]{Definition}
\newtheorem{remark}[theorem]{Remark}           % \newtheorem* は revtex と競合

\DeclareMathOperator{\Tr}{Tr}                  % \newcommand ではなくモダンな方法
```

### 7-2. 禁止事項（コンパイルエラーの原因）

| 禁止 | 理由 | 正しい方法 |
|------|------|-----------|
| `\usepackage[match]{luatexja-fontspec}` | revtex4-2 と競合 | `\usepackage{luatexja}` のみ |
| `\usepackage[colorlinks=true,...]{hyperref}` | revtex4-2 が hyperref を内部管理 | `\usepackage{hyperref}`（オプションなし） |
| `\usepackage[margin=...]{geometry}` | revtex4-2 がページレイアウト管理 | geometry 不使用 |
| `\newtheorem*{remark}{Remark}` | `\*` が revtex と競合 | `\newtheorem{remark}[theorem]{Remark}` |
| `\newcommand{\Tr}{\mathrm{Tr}}` | 演算子前後の spacing が不正 | `\DeclareMathOperator{\Tr}{Tr}` |
| `\renewcommand{\thesection}{\Roman{section}}` | revtex がセクション番号を管理 | 不使用 |

### 7-3. フロントマター順序

revtex4-2 では `\title`, `\author`, `\affiliation`, `\begin{abstract}` が `\begin{document}` と `\maketitle` の間に来る：

```latex
\begin{document}

\title{...}
\author{...}
\affiliation{...}

\begin{abstract}
...
\end{abstract}

\maketitle
```

### 7-4. Acknowledgments

`\section*{Acknowledgments}` ではなく revtex4-2 の専用環境を使う：

```latex
\begin{acknowledgments}
...
\end{acknowledgments}
```

### 7-5. Bibliography

```latex
\bibliographystyle{apsrev4-2}   % APS 標準
\bibliography{refs}
```

---

## 8. luaotfload 救済手順（nil error / フォント不可視時）

`§3-X` の sanity check で luaotfload が壊れていると判定された場合、または `tlmgr --usermode install luaotfload` が `not relocatable` で拒否された場合の救済手順。3 段階で試す。

### 8-1. 第一段: CTAN から手動取得（usermode tree に配置）

```bash
cd /tmp
curl -sL "https://mirrors.ctan.org/macros/luatex/generic/luaotfload.zip" -o luaotfload.zip
unzip -q luaotfload.zip -d luaotfload_pkg
mkdir -p /root/texmf/tex/luatex/luaotfload
find luaotfload_pkg -name "*.lua" -exec cp {} /root/texmf/tex/luatex/luaotfload/ \;
find luaotfload_pkg -name "*.sty" -exec cp {} /root/texmf/tex/luatex/luaotfload/ \;
mktexlsr /root/texmf 2>/dev/null

# 依存 lua ライブラリも入れておく
tlmgr --usermode install lualibs 2>&1 | tail -1
```

検証:

```bash
cd /tmp && lualatex -interaction=nonstopmode luaotfload_check.tex 2>&1 | grep LUAOTFLOAD
# → LUAOTFLOAD_OK: <version> が出れば成功
```

成功したら §3 の charrange 修復を実行してから本番コンパイルへ戻る。

### 8-2. 第二段: apt fallback（システムレベルで luaotfload を入れ直す）

第一段が失敗した場合、システムレベルの TeX Live にある luaotfload 自体が壊れている可能性が高い。apt で再インストールする:

```bash
apt list --installed 2>/dev/null | grep -i texlive-luatex
# → texlive-luatex が入っていなければ:
apt-get install -y texlive-luatex 2>&1 | tail -3
# → 既に入っていて壊れているなら:
apt-get install --reinstall -y texlive-luatex 2>&1 | tail -3
```

> **apt と tlmgr の併用注意:** 通常は tlmgr 優先だが、luaotfload のように non-relocatable で usermode 不可のパッケージはシステムレベルで管理せざるを得ない。apt で texlive-luatex を入れたあと、tlmgr usermode 側の luatexja/luatexbase/ctablestack をクリーンアップして再インストールし、両者のバージョンが一致することを sanity check で確認する。

検証:

```bash
# まず luaotfload 単独
cd /tmp && lualatex -interaction=nonstopmode luaotfload_check.tex 2>&1 | grep LUAOTFLOAD
# 次に luatexja の clean reinstall
rm -rf /root/texmf/tex/luatex/{luatexja,luatexbase,ctablestack}
tlmgr --usermode remove --force luatexja luatexbase ctablestack 2>&1 | tail -2
for pkg in luatexja luatexbase ctablestack; do tlmgr --usermode install $pkg 2>&1 | tail -1; done
```

### 8-3. 第三段: 報告して停止

第一段・第二段とも失敗した場合は、これ以上の自動修復は危険（システム環境を破壊しうる）。**ユーザーに以下を報告して停止する**:

```
luaotfload が修復できませんでした。
試行:
  - 第一段: CTAN 手動取得 → <結果>
  - 第二段: apt --reinstall texlive-luatex → <結果>
症状: <luaotfload_check.tex の出力>
推奨: コンテナイメージの texlive を完全に入れ直すか、ローカル環境でコンパイルしてください。
```

### 8-4. HaranoAji 不可時の Noto CJK 切替（§1.5 で自動化済み・手動リカバリ用）

> **現行ワークフローでは §1.5 が ltjsarticle 系の原稿に対して自動で Noto CJK を注入するため、通常この節の手順を手動実行する必要はない**。以下は §1.5 が何らかの理由で動かなかった場合の手動リカバリ手順として残す。

luaotfload が動いていても、`haranoaji` フォントパッケージが non-relocatable で入らない場合、`ltjsarticle` のデフォルト和文フォント参照を Noto CJK に切り替える。これは luaotfload の問題ではなくフォント本体の問題。

```bash
# システムに Noto CJK があるか確認
fc-list | grep -iE "noto.*cjk" | head -3
```

`.tex` の最初の `\documentclass` の**前に**以下を追加（`\documentclass` の後では効果がない）:

```latex
\makeatletter
\def\ltj@stdmcfont{file:NotoSerifCJK-Regular.ttc:0}
\def\ltj@stdgtfont{file:NotoSansCJK-Regular.ttc:0}
\makeatother
\documentclass[a4paper,11pt]{ltjsarticle}
```

検証:

```bash
grep -c 'HaranoAji' main.log            # → 0 が望ましい
pdffonts main.pdf | grep -i "noto"       # → NotoSerifCJKjp-Regular が出ていれば OK
grep -c 'metric data not found' main.log # → 0
```

> **重要:** Noto CJK がシステムに入っていても luatexja は自動的にはこれを使用しない。明示的に `\ltj@stdmcfont` を再定義する必要がある。切り替えなければ日本語テキストが PDF 上で**完全に不可視**になり、エラーは出ない。

---

## 9. アンチパターン集（コンテナ環境固有）

| # | パターン | 何が起こるか | 対策 |
|---|---|---|---|
| AP-LL1 | nil error が出たら即 charrange 修復に飛ぶ | charrange 修復は luatexja バージョン不整合用。luaotfload 破損には効かない。同じ修復を 3 回繰り返して時間を浪費する | §3-X sanity check を**最初に**実行し、原因を切り分ける |
| AP-LL2 | `tlmgr --usermode install luaotfload` を試して `not relocatable` で諦める | non-relocatable は仕様。usermode では絶対に入らない | §8-1 (CTAN 手動) または §8-2 (apt) に進む |
| AP-LL3 | apt-get を絶対に使わない原則を luaotfload にも適用 | 救済手段が枯渇する。luaotfload はシステムレベルで管理されているため apt が現実的な唯一の修復経路の場合がある | §8-2 で apt fallback を許容 |
| AP-LL4 | 大量のテストをコンテナ環境で繰り返す | 環境が壊れたまま PDF 生成を続けてもページ数や日本語が壊れる | §8 第三段に達したらユーザーに引き渡しローカルでコンパイル |
| AP-LL5 | エラーログを最後の数行しか見ない | nil error は最初の数行に本当の原因が出ていることが多い | `grep -E "attempt to index|Error in lua|module .* not found" main.log` で全体スキャン |
| AP-LL6 | 素の TL2023 コンテナで `texlive-luatex` を入れずに lualatex を叩く | `luaotfload` が無く `charrange nil error` が 100 回出て fatal で終了 | §0-B の apt foundation bootstrap を**必ず**先頭で実行 |
| AP-LL7 | `haranoaji` を tlmgr usermode で入れようとする / 入らなかったら条件分岐で Noto に切り替える | `not relocatable` で必ず失敗。条件分岐ロジックが複雑化し、silent failure (和文不可視) を取り逃す | §0-A の除外リストに従い **最初から haranoaji を入れない**。ltjs* クラスは §1.5 で問答無用で Noto CJK を注入 |
| AP-LL8 | 「`undefined references: 0`」だけ見て参照健全とみなす | 孤児ラベル・型違い参照（節を `\eqref`）は未定義ゼロでも残る。ログには出ない | §4-X の `\label`↔参照 突き合わせ監査を回す |
| AP-LL9 | `\tableofcontents` と `hyperref` があるから ToC はリンクだと信じる | `linkcolor=black` だとリンクは在るが不可視。ユーザーには「リンクになっていない」と映る | §4.5 で pikepdf により Link 注釈を数え、`linkcolor=<色名>`＋`linktoc=all` を既定にする |
| AP-LL10 | hyperref オプションに `linkcolor=[rgb]{0.1,0.3,0.6}` と直書き | オプション解析が壊れ `0.10.sty not found` で fatal | `xcolor` で `\definecolor` してから**色名**を渡す。`xcolor` は hyperref より前に読む |
| AP-LL11 | 「コンパイル通過＝完成」として PDF を開かず納品 | リンク不可視・しおり欠落・和文不可視など、ログに出ない欠陥を取り逃す | §4〜4.5 を必ず実行。最終 PDF は「読み物として機能するか」まで検証してから present_files |
