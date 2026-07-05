---
name: transcribing-media
description: Transcribe speech from any audio or video file (or URL) to text / subtitles using Whisper, run through uv — no global installs. On Apple Silicon use mlx-whisper (fastest); portable fallback is faster-whisper (whisper-ctranslate2), reference fallback is openai-whisper. Pipeline is always video/audio → ffmpeg-decoded audio → Whisper STT → txt/srt/vtt/json. Trigger whenever the user wants to transcribe, caption, or subtitle a `.mp4`/`.mov`/`.m4a`/`.wav`/`.mp3` (or YouTube/URL), asks for 文字起こし / 字幕 / キャプション, or mentions whisper/STT/speech-to-text/transcription.
---

# Media transcription via Whisper (uv)

**Goal: turn an audio/video file (or URL) into text or subtitles, locally, with zero global installs.** Every Python tool runs through `uv` — this skill is a specialization of the `running-python-tools` skill. Read that skill's rule (never `pip install`) first; it applies here.

```
video/audio ──ffmpeg──▶ audio (wav/m4a) ──Whisper──▶ txt · srt · vtt · json
   (.mp4/.mov)                                          (timestamps optional)
```

## Prerequisite: ffmpeg

Whisper (every backend) shells out to **ffmpeg** to decode audio. It is the one non-uv dependency.

```bash
command -v ffmpeg || brew install ffmpeg   # macOS; ffprobe ships with it
```

Once present, all Whisper backends accept a **video file directly** (they invoke ffmpeg internally) — a separate extraction step is only needed to cache/reuse the audio (see Recipes).

## Choose a backend (decision table)

| Situation | Use | Command name | Notes |
|---|---|---|---|
| **Apple Silicon (M-series)** — default here | **mlx-whisper** | `mlx_whisper` | Metal/MLX-accelerated, fastest on Mac. Models pulled from `mlx-community/*`. |
| Need portable + fast (CUDA/CPU, CTranslate2) | **faster-whisper** | `whisper-ctranslate2` | 4–5× faster than openai-whisper on CPU, low memory. |
| Reference / maximum compatibility | **openai-whisper** | `whisper` | The original; slowest on CPU but the canonical behavior. |

## Choose a model (accuracy ↔ speed)

| Model | When | mlx repo id |
|---|---|---|
| `large-v3-turbo` | **default** — near-large accuracy, ~4× faster | `mlx-community/whisper-large-v3-turbo` |
| `large-v3` | maximum accuracy, hard audio / accents | `mlx-community/whisper-large-v3-mlx` |
| `medium` / `small` | quick draft, long files, low RAM | `mlx-community/whisper-medium-mlx` |

Language is **auto-detected**; pass `--language ja` (or `Japanese` for openai-whisper) to skip detection and avoid mis-detection on short/mixed clips. Use `--task translate` to transcribe-and-translate into English in one pass.

## Recipes

```bash
# ── Apple Silicon (preferred): mp4 → SRT + TXT, large-v3-turbo, Japanese ──
uvx --from mlx-whisper mlx_whisper "input.mp4" \
  --model mlx-community/whisper-large-v3-turbo \
  --language ja --output-format all --output-dir ./out

# auto-detect language, just plain text
uvx --from mlx-whisper mlx_whisper "input.mp4" --model mlx-community/whisper-large-v3-turbo \
  --output-format txt --output-dir ./out

# ── Portable fast fallback: faster-whisper ──
uvx whisper-ctranslate2 "input.mp4" \
  --model large-v3 --language ja \
  --output_format srt --output_dir ./out

# ── Reference fallback: openai-whisper ──
uvx --from openai-whisper whisper "input.mp4" \
  --model large-v3 --language Japanese \
  --output_format srt --output_dir ./out

# ── Optional: pre-extract audio (reuse / huge files / send elsewhere) ──
ffmpeg -i "input.mp4" -vn -ac 1 -ar 16000 -c:a pcm_s16le "audio.wav"   # 16kHz mono, Whisper-native
# then transcribe audio.wav with any backend above

# ── Inspect a file first (duration / streams) ──
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "input.mp4"

# ── URL (YouTube etc.): download audio via yt-dlp, then transcribe ──
uvx yt-dlp -x --audio-format m4a -o "dl.%(ext)s" "<URL>"
uvx --from mlx-whisper mlx_whisper "dl.m4a" --model mlx-community/whisper-large-v3-turbo --output-format all --output-dir ./out
```

## Output formats

| `--output-format` | File | Use |
|---|---|---|
| `txt` | `input.txt` | plain transcript, no timestamps |
| `srt` | `input.srt` | subtitles (video editors, YouTube) |
| `vtt` | `input.vtt` | web `<track>` captions |
| `json` | `input.json` | segments + word-level timing (programmatic) |
| `all` | all of the above | when unsure — cheap to emit everything |

(openai-whisper / faster-whisper use the underscore flag spelling `--output_format` / `--output_dir`; mlx-whisper uses hyphens `--output-format` / `--output-dir`. Match the backend.)

## Workflow checklist

1. `command -v ffmpeg || brew install ffmpeg`.
2. `ffprobe` the input to know duration (sets expectations for runtime / model choice).
3. Pick backend (Apple Silicon → mlx-whisper) and model (default `large-v3-turbo`).
4. First model run **downloads weights** (~0.8–1.6 GB) — expect a one-time delay; cached after.
5. Run with `--output-format all` to a dedicated `./out` dir; verify the `.txt` reads sanely.
6. If language was mis-detected or output is garbled, re-run with explicit `--language`.

## Notes / gotchas

- **Invocation gotcha (command name ≠ package name — the `running-python-tools` case):** the package is `mlx-whisper` but the executable is `mlx_whisper` (underscore) → always `uvx --from mlx-whisper mlx_whisper …`, never `uvx mlx-whisper`. Likewise faster-whisper ships the CLI `whisper-ctranslate2`, and openai-whisper ships `whisper` (use `uvx --from openai-whisper whisper`).
- **Quote paths with spaces** (`"Coral demo.mp4"`) — common with `~/Downloads` files.
- **CPU-only host?** Skip openai-whisper `large` (very slow); use `whisper-ctranslate2` with `--compute_type int8`.
- **Long files (>30 min):** transcribe in the backend directly (Whisper chunks internally) rather than loading the whole thing yourself; consider `medium` for first-pass drafts.
- **Diarization** (who-spoke-when) is out of scope for plain Whisper — needs `whisperx` or `pyannote`; add only if asked.
- This skill never installs Python packages globally — see `running-python-tools`. ffmpeg is the sole system dependency.
