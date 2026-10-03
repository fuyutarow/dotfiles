---
name: transcribing-media
description: >-
  Transcribe user-owned or authorized audio/video into text or subtitles with local Whisper via
  uvx. Use mlx-whisper on Apple Silicon and whisper-ctranslate2 elsewhere. Trigger for 文字起こし,
  字幕, captions, Whisper/STT, or audio/video files and URLs. For third-party media, offer a
  concise summary instead of a full transcript.
---

# Transcribing media locally

Use this for media the user owns or is authorized to transcribe. For third-party public media,
do not provide a full verbatim transcript; offer a concise summary or ask for an authorized
source file. Do not bypass sign-in, access controls, or download restrictions.

All Python tools run through `uvx`; read `running-python-tools` before invoking them. Whisper
needs `ffmpeg` and `ffprobe`. If either is absent, report that and use the user's declared
package-management workflow rather than installing tools unexpectedly.

## YouTube or other media URLs

For authorized media, inspect subtitles first:

```sh
uvx yt-dlp --ignore-config --no-playlist --skip-download --list-subs "URL"
```

If usable captions exist, download them without downloading the video:

```sh
uvx yt-dlp --ignore-config --no-playlist --skip-download \
  --write-subs --write-auto-subs --sub-langs "ja.*,en.*" \
  --sub-format "srt/vtt/best" -o "./out/%(title)s.%(ext)s" "URL"
```

If captions are missing and transcription is authorized, extract audio only:

```sh
uvx yt-dlp --ignore-config --no-playlist -x --audio-format m4a \
  -o "./out/audio.%(ext)s" "URL"
```

Then transcribe the resulting audio file. Keep outputs in a dedicated directory and inspect the
transcript before reporting completion.

## Choose a backend

| Environment | Backend | Notes |
|---|---|---|
| Apple Silicon | `mlx-whisper` | MLX implementation; `mlx_whisper` is the command name |
| Other macOS/Linux hosts | `whisper-ctranslate2` | CTranslate2-based CLI, compatible with Whisper-style options |
| Compatibility fallback | `openai-whisper` | Use when the other backend is unsuitable |

For Japanese, specify `--language Japanese` (or `ja` where accepted) when the clip is short,
mixed-language, or auto-detection is wrong. `large-v3-turbo` is a practical accuracy/speed
choice; use `large-v3` for difficult audio when time and memory allow. Confirm model identifiers
and flags against the current CLI help if an invocation fails.

## Commands

Apple Silicon, transcript and subtitle files:

```sh
uvx --from mlx-whisper mlx_whisper "input.mp4" \
  --model mlx-community/whisper-large-v3-turbo \
  --language Japanese --output-format all --output-dir ./out
```

Portable CTranslate2 backend:

```sh
uvx --from whisper-ctranslate2 whisper-ctranslate2 "input.mp4" \
  --model large-v3 --language Japanese \
  --output_format all --output_dir ./out
```

OpenAI Whisper fallback:

```sh
uvx --from openai-whisper whisper "input.mp4" \
  --model turbo --language Japanese \
  --output_format all --output_dir ./out
```

Output formats commonly include plain text (`txt`), subtitles (`srt`, `vtt`), and structured
segments (`json`). MLX Whisper uses hyphenated option names; OpenAI Whisper and the CTranslate2
CLI use underscore spellings. Check `--help` for the installed version.

## Quality checks

1. Check the media duration and confirm the requested language and output format.
2. Run transcription into a dedicated output directory.
3. Review the result for missing passages, repeated hallucinations, names, and language switches.
4. If needed, retry with an explicit language or a more capable model.
5. Describe ASR output as a draft when names, figures, or overlapping speakers are uncertain.

Plain Whisper does not identify speakers. Add diarization only when requested, and use the chosen
backend's current supported workflow.
