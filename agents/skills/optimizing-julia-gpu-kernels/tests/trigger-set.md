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
| 「CPU RAM が払底してGPUが空いている。CuArrayのKrylov基底へ移すべきか、VRAM上限込みで測って」 | GPU placement/performance fires here; `orchestrating-agents` P7 must admit RAM/VRAM before warmup, then GK0/GK2 decide the implementation |

### Reduced precision / microscaling

| Ask | Why |
|---|---|
| 「Julia/CUDA.jl で RTX 3060 に packed MXFP4 weight を置き、decode して FP16 GEMM へ渡せる？」 | GK4 separates opaque storage, typed decode, native input, and measured full-path cost |
| "Microfloats `Float4_E2M1FN` is 4 bit, so will a `CuArray` use half a byte per value?" | GK4 nominal-vs-physical storage and Microfloats component role |
| 「Julia の cuTile で FP4 reinterpret API があるなら sm_86 でも動く？」 | GK4 frontend-emission versus target-support boundary |
| "On Blackwell, should this Julia path use MXFP4 or NVFP4?" | GK4 freezes format, policy, bit budget, target, accumulator, and quality comparison |
| 「重みは MXFP4、activation は MXFP6 にする adaptive microscaling を CUDA.jl で検証したい」 | GK4 `PRECISION CONTRACT`, then GK2/GK3 and a wider fallback arm |

### Co-fire (with ORDER)

| Ask | Order |
|---|---|
| 「この GPU カーネルのバグ直して」 | `implementing-and-debugging` FIRST (change-safety), this skill for device discipline |
| "GPU カーネルをリファクタしたい(挙動不変)" | `refactoring-code` governs; this supplies GK3 oracle + GK2 bracket |
| 「Julia で数値計算を GPU 化したい」(型設計から) | `writing-julia` co-fires — JG0 method discipline remains active and JG2 precedes GK1 |
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
| 「BF16・FP8・FP4 をまとめて何と呼ぶ？」 | plain answer — terminology alone needs no device procedure |
| "Survey the literature on adaptive microscaling and NVFP4" | `systematizing-knowledge`; no Julia/device implementation is requested |
| 「Microfloats.jl で CPU 上の丸めだけ試したい」 | `writing-julia` — host-only scalar/type work |
| "How do I quantize a PyTorch model to NVFP4?" | no Julia path — framework/domain guidance, not this skill |
| 「MXFP4 対応 GPU を買うならどれ？」 | hardware shopping — plain answer |

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
- 2026-08-03 v2608.1.0: added the CPU-RAM/GPU-idle placement row. Existing description tokens
  (`CuArray`, GPU profiling/optimization) still fire; P7 is a co-fire owner, not a competing
  kernel-craft skill. No description edit was needed.
- 2026-09-12 v2609.1.0: added five reduced-precision fire rows and five true near misses.
  Device tokens distinguish this skill from terminology, surveys, PyTorch, hardware shopping,
  and host-only Microfloats work. Source: `urn:uuid:01a0946e-e4ee-71da-a275-8438973dfb4b`.
