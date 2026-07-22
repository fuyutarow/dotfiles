# optimizing-julia-gpu-kernels — fire / no-fire trigger set (F3 artifact)

Desk-check this table against the FULL skill collection (not just this description) after any
description edit. Forged v2607.1.0 (2026-07-22). The decisive sibling boundary is the
`writing-julia` DECISIVE cut: **does the code run on (or manage) the device?**

## FIRES

### Core (kernel writing / optimization)

| Ask | Why |
|---|---|
| 「CUDA.jl でカーネル書いて速くしたい」 | core territory — GK0 walk first, then writing-kernels.md |
| "my `@cuda` kernel is slower than the broadcast version" | GK2 measurement + GK0 re-check (broadcast may simply be right) |
| 「occupancy を上げたい / threads と blocks どう決める?」 | launch-config (occupancy API, not hand-picked numbers) |
| "shared memory でタイルすれば速くなる?" | memory-and-warps.md + GK0 (GEMM-shaped → cuBLAS, not hand tiling) |
| `InvalidIRError: unsupported dynamic function invocation` の意味 | §2 error classes / debugging.md bottom-up decode |
| "CuArray のコードが遅い"(手書きカーネル無し) | host-performance.md — the common case; skill fires WITHOUT any kernel in play |
| 「GPU で Float64 が異常に遅い」 | GK4 precision — consumer-card FP64 ratio + literal discipline |
| "warp shuffle で reduction 書きたい" | memory-and-warps.md warp section |
| 「`CUDA.@profile` の結果どう読む? nsys と ncu どっち?」 | measuring.md (GK2) |
| "KernelAbstractions と素の CUDA.jl、どっちで書く?" | portable-kernels.md decision rule |
| "Mamba / selective scan を Julia の GPU で実装したい" | the justified-kernel case — differentiating-kernels.md SSM verdict (description carries the literal tokens "Mamba selective scan") |
| 「`cumsum` より速い scan カーネル自作できる?」 | GK0 tension: cumsum IS a Blelloch kernel — deny-gate walk |
| 「`sm_90` 向けにコンパイルしたい / `cap=` が deprecated と言われた」 | api-changes.md (`arch=sm"90"`) |
| "CUDA Graph でキャッシュしてる評価パスが、2回目以降ずっと同じ値を返す" / "graph capture のキャッシュが古い結果を返す" | CAPTURE-PINS-ADDRESSES (SKILL.md §1) — cache key missed a closed-over device array; debugging.md §11 for the state-separation + permanent-assert fix |

### Co-fire (with ORDER)

| Ask | Order |
|---|---|
| 「この GPU カーネルのバグ直して」 | `implementing-and-debugging` FIRST (change-safety), this skill for device discipline |
| "GPU カーネルをリファクタしたい(挙動不変)" | `refactoring-code` governs; this supplies GK3 oracle + GK2 bracket |
| 「Julia で数値計算を GPU 化したい」(型設計から) | `writing-julia` co-fires — its JG2 is GK1's precondition |
| 「Zygote が `Mutating arrays is not supported` で死ぬ」(GPU コード) | `writing-julia` legitimately matches (Zygote is its keyword) — it diagnoses the error class; the moment CuArray/kernel context is confirmed, this skill's GK3-AD owns the rrule fix (differentiating-kernels.md) |
| "`accumulate` の gradient が ChainRules 未対応エラーで落ちる" | ask carries no GPU token — `writing-julia` (AD keywords) fires first; on a CuArray/GPU shape the mechanical hand-write trigger routes here (differentiating-kernels.md §5) |

## MUST NOT FIRE (true near-misses)

| Ask | Route |
|---|---|
| "CUDA C++ で `__shared__` メモリの使い方" (Julia 不在) | plain answer / web — CUDA.jl-specific skill |
| 「nvidia-smi が見つからない / WSL で GPU が見えない」 | environment plumbing (shell/dotfiles), not kernel craft |
| "PyTorch の学習が GPU で遅い" | not Julia — plain answer |
| 「Julia の型安定を直したい」(CPU のみ、GPU 不在) | `writing-julia` alone — device cut answers NO |
| "Flux でモデルに層を足したい"(stock layers のみ) | `writing-julia` packages.md — custom kernel が現れた瞬間にこちらへ |
| 「RTX 5090 と 4090 どっち買うべき?」 | hardware shopping — plain answer |
| "AMDGPU.jl の `@roc` カーネルを書きたい"(KA 不在) | out of scope (NVIDIA-first; SKILL.md scope line says so) — clean no-fire; the KA route (portable-kernels.md) fires only if KernelAbstractions enters the ask |
| "Reactant / XLA で Lux モデルをコンパイルしたい"(手書きカーネル不在) | `writing-julia` toolchain.md §2.9.5 — Reactant-vs-CUDA.jl framing is ITS home; this skill enters only when a hand kernel or CuArray perf appears |
| 「`rm` で消したファイル復元したい」(GPU 文脈ゼロ) | unrelated — sanity row |

## Desk-check log

- 2026-07-22 v2607.1.0: initial set; verification-fleet desk-check applied. Checked against
  writing-julia's frontmatter `description:` (which carries Zygote/Enzyme/AD keywords but NO
  kernel/CuArray/CUDA tokens) and its SKILL.md body (reference-index "GPU/NN" toolchain row,
  changelog's "direct GPU-array entries (CUDA/Metal)" deferral — body text, not trigger
  surface). Fleet findings folded in: two AD-error asks moved from FIRES to co-fire-with-order
  (no GPU token in the ask → writing-julia legitimately fires first); "Mamba / selective scan"
  added to this description as literal tokens; Reactant no-fire row added. Reciprocal edits
  landed in writing-julia (routing row, description cut, trigger rows) same commit.
- 2026-07-23 v2607.2.0: added a FIRES row for the CAPTURE-PINS-ADDRESSES class ("graph
  capture のキャッシュが古い結果を返す") — distilled from the firedancer fd_evaluate
  graph-cache postmortem (検収4). The ask already carries "CUDA Graph"/"CUDA"/"GPU" tokens
  matched by the existing description surface (`CUDA.jl`, `GPU カーネル`) — no description
  edit needed; description-token consistency re-checked against the new row per the
  precedent in finding #16.
