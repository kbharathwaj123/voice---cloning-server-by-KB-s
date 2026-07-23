# Voice Narrator — Zero-Shot Voice Cloning & Transcription

A free, self-hosted web application for long-form voice narration and timestamped audio transcription.

Paste text, select any voice sample clip, and generate high-quality narrated audio — with **no API cost**. This application runs [Chatterbox](https://github.com/resemble-ai/chatterbox) (open-source, zero-shot voice cloning) and [faster-whisper](https://github.com/SYSTRAN/faster-whisper) locally on your own machine.

---

## ✨ Features

- **Dynamic Voice Discovery**: Place any audio files (`.wav`, `.mp3`, `.m4a`, `.flac`, `.ogg`, `.aac`) in the `Samples/` folder. They are automatically discovered and displayed as selectable voice cards on the Web UI.
- **Interactive Audio Preview**: Click any voice card to listen to its audio sample preview before generating narration.
- **Volume Normalization**: Peak-normalizes each generated audio chunk to prevent sudden volume or loudness jumps during long-form narration.
- **Timestamped Transcription**: Transcribe any uploaded or generated audio into clean, timestamped text lines.
- **Offline & Zero Paid API Costs**: Download weights once on first launch, then run fully locally.

---

## 🚀 Quickstart Guide

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/voice-narrator.git
cd voice-narrator
```

### 2. Set Up Virtual Environment & Dependencies

#### On Windows (Command Prompt / PowerShell):
```cmd
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

#### On macOS / Linux:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

> **GPU Acceleration (Optional but Recommended)**:
> If you have an NVIDIA GPU, install the CUDA build of PyTorch first from [pytorch.org](https://pytorch.org/get-started/locally/) for significantly faster TTS and STT generation speeds.

---

### 3. Add Voice Samples

Add your reference voice clips into the `Samples/` directory:

1. Record or collect clean, single-speaker audio clips (5–20 seconds long).
2. Save them inside the `Samples/` folder (e.g. `Samples/my_voice.mp3` or `Samples/adam_deep.wav`).
3. Refresh the web page or start the server — your voices will automatically appear as selectable options!

---

### 4. Run the Server

```bash
python server.py
```

* Open your browser at: **`http://localhost:3000`**
* Select a voice to listen to its preview.
* Paste text, click **Generate narration**, and listen or download the result!

---

## 🛠️ Project Structure

```
├── Samples/           # Put reference audio clips (.wav, .mp3, etc.) here
├── tmp/               # Temporary generated audio outputs
├── app.js             # Web UI interactive audio preview & API client
├── index.html         # Web UI layout
├── server.py          # Flask backend server (Chatterbox TTS + faster-whisper STT)
├── style.css          # CSS theme & UI styling
├── voices.json        # Optional metadata overrides for voice labels
├── requirements.txt   # Python dependency list
├── .env.example       # Environment configuration template
└── README.md          # Project documentation
```

---

## 💡 Notes & Troubleshooting

- **First Run Download**: On the very first run, model weights for Chatterbox and Whisper will download automatically.
- **CPU vs GPU**: CPU generation takes roughly ~1 second per step. GPU generation is 5x–10x faster.
- **License & Rights**: Only use voice sample clips that you have explicit rights or consent to use.

