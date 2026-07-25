"""
Voice Narrator — free, self-hosted version.

Step 1: Chatterbox (MIT-licensed, open-source, zero-shot voice cloning) turns
pasted text into narrated audio using one of your cloned voice samples.

Step 2: faster-whisper (open-source, free, local) transcribes any audio with
timestamps. Gemini (your existing API key) turns each transcript line into a
short image-generation prompt, so you can build an image-per-line storyboard.

No paid APIs. First run downloads model weights (Chatterbox + Whisper) from
the internet once, then everything runs offline except the Gemini calls.
"""

import json
import os
import re
import uuid
from pathlib import Path

import torch
import torchaudio
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file, send_from_directory

from chatterbox.tts import ChatterboxTTS

load_dotenv()

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "voices.json"
TMP_DIR = BASE_DIR / "tmp"
TMP_DIR.mkdir(exist_ok=True)

MAX_CHUNK_CHARS = 250  # keep TTS chunks short — long single generations degrade in quality

app = Flask(__name__, static_folder=".", static_url_path="")

device = "cuda" if torch.cuda.is_available() else "cpu"

print(f"Loading Chatterbox on {device} (first run downloads model weights)...")
tts_model = ChatterboxTTS.from_pretrained(device=device)
print("Chatterbox ready.")

import sys
from unittest.mock import MagicMock

# Bypass PyAV DLL AppControl policy block on Windows
sys.modules['av'] = MagicMock()
sys.modules['av.audio'] = MagicMock()
sys.modules['av.audio.codeccontext'] = MagicMock()

whisper_model = None  # loaded lazily on first transcription request


def load_audio_for_whisper(audio_path, target_sr=16000):
    waveform, sr = torchaudio.load(str(audio_path))
    if sr != target_sr:
        resampler = torchaudio.transforms.Resample(sr, target_sr)
        waveform = resampler(waveform)
    if waveform.shape[0] > 1:
        waveform = torch.mean(waveform, dim=0, keepdim=True)
    return waveform.squeeze(0).numpy()


def get_whisper_model():
    global whisper_model
    if whisper_model is None:
        from faster_whisper import WhisperModel
        size = os.environ.get("WHISPER_MODEL", "small")
        target_device = device
        compute_type = "float16" if target_device == "cuda" else "int8"

        try:
            print(f"Loading faster-whisper ({size}, device={target_device}, compute_type={compute_type})...")
            whisper_model = WhisperModel(size, device=target_device, compute_type=compute_type)
        except Exception as err:
            print(f"CUDA/DLL error loading Whisper on {target_device}: {err}. Falling back to CPU...")
            whisper_model = WhisperModel(size, device="cpu", compute_type="int8")

        print("faster-whisper ready.")
    return whisper_model


SAMPLES_DIR = BASE_DIR / "Samples"
SAMPLES_FALLBACK = BASE_DIR / "samples"
SUPPORTED_AUDIO_EXTS = {".wav", ".mp3", ".flac", ".m4a", ".aac", ".ogg"}

def get_samples_dir():
    if SAMPLES_DIR.exists():
        return SAMPLES_DIR
    if SAMPLES_FALLBACK.exists():
        return SAMPLES_FALLBACK
    SAMPLES_DIR.mkdir(exist_ok=True)
    return SAMPLES_DIR

def format_voice_label(stem):
    name = stem
    name = re.sub(r"^voice[_-]preview[_-]", "", name, flags=re.IGNORECASE)
    name = re.sub(r"^voice[_-]", "", name, flags=re.IGNORECASE)
    parts = re.split(r"\s*[-_—]\s*", name, maxsplit=1)
    if len(parts) == 2:
        speaker = parts[0].strip().title()
        desc = parts[1].strip().capitalize()
        return f"{speaker} — {desc}"
    else:
        return name.replace("_", " ").replace("-", " ").strip().title()

def load_voices():
    config_overrides = {}
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                override_list = json.load(f)
                for item in override_list:
                    if isinstance(item, dict):
                        if "samplePath" in item:
                            sample_name = Path(item["samplePath"]).name
                            config_overrides[sample_name] = item
                        if "id" in item:
                            config_overrides[item["id"]] = item
        except Exception as err:
            print("Error reading voices.json:", err)

    samples_folder = get_samples_dir()
    audio_files = [
        f for f in samples_folder.iterdir()
        if f.is_file() and f.suffix.lower() in SUPPORTED_AUDIO_EXTS
    ]
    audio_files.sort(key=lambda x: x.name.lower())

    voices = []
    for audio_file in audio_files:
        sample_name = audio_file.name
        voice_id = f"voice-{audio_file.stem}"
        
        override = config_overrides.get(sample_name) or config_overrides.get(voice_id) or {}
        label = override.get("label") or format_voice_label(audio_file.stem)
        exaggeration = override.get("exaggeration", 0.5)

        voices.append({
            "id": voice_id,
            "label": label,
            "filename": sample_name,
            "samplePath": str(audio_file.relative_to(BASE_DIR)),
            "sampleUrl": f"/api/sample/{sample_name}",
            "exaggeration": exaggeration
        })

    return voices


# ---------- Step 1: text -> narrated audio ----------

def chunk_text_for_tts(text, max_len=MAX_CHUNK_CHARS):
    sentences = re.findall(r"[^.!?]+[.!?]*\s*", text) or [text]
    chunks, current = [], ""
    for sentence in sentences:
        if current and len(current) + len(sentence) > max_len:
            chunks.append(current.strip())
            current = sentence
        else:
            current += sentence
    if current.strip():
        chunks.append(current.strip())
    return chunks


def get_chunk_inflection_and_pause(chunk, base_exaggeration=0.5, sr=24000):
    text = chunk.strip()
    pause_sec = 0.25
    exaggeration = base_exaggeration

    if text.endswith("?"):
        # Question: higher pitch inflection + distinct 0.40s stop
        exaggeration = min(1.0, base_exaggeration + 0.25)
        pause_sec = 0.40
    elif text.endswith("!"):
        # Exclamation: energetic inflection + 0.30s stop
        exaggeration = min(1.0, base_exaggeration + 0.30)
        pause_sec = 0.30
    elif text.endswith("..."):
        # Ellipsis: thoughtful trailing pause
        exaggeration = max(0.2, base_exaggeration - 0.10)
        pause_sec = 0.50
    elif text.endswith(","):
        # Comma: short clause break
        exaggeration = base_exaggeration
        pause_sec = 0.18
    else:
        exaggeration = base_exaggeration

    pause_samples = int(sr * pause_sec)
    silence = torch.zeros((1, pause_samples), dtype=torch.float32)
    return exaggeration, silence


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.get("/api/voices")
def get_voices():
    voices = load_voices()
    return jsonify({
        "voices": [
            {
                "id": v["id"],
                "label": v["label"],
                "filename": v["filename"],
                "sampleUrl": v["sampleUrl"]
            }
            for v in voices
        ]
    })


@app.get("/api/sample/<path:filename>")
def get_sample_audio(filename):
    samples_folder = get_samples_dir()
    file_path = samples_folder / os.path.basename(filename)
    if not file_path.exists():
        return jsonify({"error": "Voice sample audio not found."}), 404
    return send_file(file_path)


@app.post("/api/generate")
def generate():
    data = request.get_json(force=True) or {}
    voice_id = data.get("voiceId")
    text = (data.get("text") or "").strip()

    if not voice_id or not text:
        return jsonify({"error": "Select a voice and paste some text first."}), 400

    voice = next((v for v in load_voices() if v["id"] == voice_id), None)
    if not voice:
        return jsonify({"error": "That voice isn't configured on the server."}), 400

    sample_path = BASE_DIR / voice["samplePath"]
    if not sample_path.exists():
        return jsonify(
            {"error": f'Reference sample for "{voice["label"]}" is missing at {voice["samplePath"]}.'}
        ), 400

    import time
    start_time = time.time()
    try:
        chunks = chunk_text_for_tts(text)
        wav_parts = []
        base_exag = voice.get("exaggeration", 0.5)

        for idx, chunk in enumerate(chunks):
            chunk_exag, silence_tensor = get_chunk_inflection_and_pause(
                chunk, base_exaggeration=base_exag, sr=tts_model.sr
            )
            wav = tts_model.generate(
                text=chunk,
                audio_prompt_path=str(sample_path),
                exaggeration=chunk_exag,
            )
            # Peak normalize the chunk to keep volume consistent across sentence splits
            max_val = torch.max(torch.abs(wav))
            if max_val > 0:
                wav = wav * (0.9 / max_val)

            wav_parts.append(wav)
            if idx < len(chunks) - 1:
                wav_parts.append(silence_tensor)

        full_wav = torch.cat(wav_parts, dim=-1) if len(wav_parts) > 1 else wav_parts[0]

        file_name = f"{uuid.uuid4()}.wav"
        out_path = TMP_DIR / file_name
        torchaudio.save(str(out_path), full_wav, tts_model.sr)

        time_taken = time.time() - start_time
        audio_duration = full_wav.shape[-1] / tts_model.sr

        return jsonify({
            "audioUrl": f"/api/audio/{file_name}", 
            "fileName": file_name,
            "timeTaken": time_taken,
            "audioDuration": audio_duration
        })
    except Exception as exc:  # noqa: BLE001
        print("Generation error:", exc)
        return jsonify({"error": "Generation failed — check the server logs."}), 500


@app.get("/api/audio/<path:filename>")
def get_audio(filename):
    file_path = TMP_DIR / os.path.basename(filename)
    if not file_path.exists():
        return jsonify({"error": "Audio not found — it may have expired."}), 404
    return send_file(file_path, mimetype="audio/wav")


# ---------- Step 2: audio -> timestamped transcript ----------

def format_timestamp(seconds):
    total = max(0, int(seconds))
    m, s = divmod(total, 60)
    return f"{m}:{s:02d}"


def group_words_by_pauses(words, max_words=10, max_duration=4.0, max_gap=0.5):
    """Group words by natural pauses, punctuation, and time/length constraints."""
    lines = []
    current = []
    chunk_start = None

    for i, w in enumerate(words):
        if chunk_start is None:
            chunk_start = w.start
        current.append(w)
        
        ends_clause = w.word.strip().endswith((".", "!", "?", ",", ";", ":", "-"))
        duration = w.end - chunk_start
        
        # Check if there is a gap to the next word
        has_gap = False
        if i < len(words) - 1:
            next_w = words[i + 1]
            if next_w.start - w.end >= max_gap:
                has_gap = True
                
        if ends_clause or len(current) >= max_words or duration >= max_duration or has_gap:
            text = "".join(x.word for x in current).strip()
            lines.append({"start": chunk_start, "end": w.end, "text": text})
            current = []
            chunk_start = None

    if current:
        text = "".join(x.word for x in current).strip()
        lines.append({"start": chunk_start, "end": current[-1].end, "text": text})

    return lines


@app.post("/api/transcribe")
def transcribe():
    temp_upload = None

    if "audio" in request.files:
        f = request.files["audio"]
        suffix = Path(f.filename).suffix or ".wav"
        temp_upload = TMP_DIR / f"upload-{uuid.uuid4()}{suffix}"
        f.save(temp_upload)
        audio_path = temp_upload
    else:
        data = request.get_json(silent=True) or {}
        source_file = data.get("sourceFile")
        if not source_file:
            return jsonify({"error": "Upload an audio file or use the narration from Step 1."}), 400
        candidate = TMP_DIR / os.path.basename(source_file)
        if not candidate.exists():
            return jsonify({"error": "That generated audio can't be found anymore — generate it again."}), 400
        audio_path = candidate

    try:
        model_w = get_whisper_model()
        audio_np = load_audio_for_whisper(audio_path)
        segments, info = model_w.transcribe(audio_np, word_timestamps=True)
        segments = list(segments)

        words = []
        for seg in segments:
            if seg.words:
                words.extend(seg.words)

        if words:
            raw_lines = group_words_by_pauses(words)
        else:
            raw_lines = [{"start": s.start, "end": s.end, "text": s.text.strip()} for s in segments]

        lines = [
            {**line, "formatted": f"[{format_timestamp(line['start'])}] {line['text']}"}
            for line in raw_lines
            if line["text"]
        ]

        return jsonify({"lines": lines, "language": info.language})
    except Exception as exc:  # noqa: BLE001
        print("Transcription error:", exc)
        return jsonify({"error": f"Transcription failed: {str(exc)}"}), 500
    finally:
        if temp_upload and temp_upload.exists():
            temp_upload.unlink()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 3000)), debug=False)
