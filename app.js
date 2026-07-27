// ---------- Step 1: narration ----------

const textInput = document.getElementById("text-input");
const charCount = document.getElementById("char-count");
const languageSelect = document.getElementById("language-select");
const voiceList = document.getElementById("voice-list");
const generateBtn = document.getElementById("generate-btn");
const generateStatus = document.getElementById("generate-status");
const resultEl = document.getElementById("result");
const audioPlayer = document.getElementById("audio-player");
const downloadLink = document.getElementById("download-link");
const timingInfo = document.getElementById("timing-info");
const progressContainer = document.getElementById("progress-container");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
let countdownInterval = null;

let selectedVoiceId = null;
let lastGeneratedFileName = null;
let currentAudioDuration = 0;

function updateGenerateState() {
  generateBtn.disabled = !(selectedVoiceId && textInput.value.trim().length > 0);
}

textInput.addEventListener("input", () => {
  charCount.textContent = textInput.value.length;
  updateGenerateState();
});

const samplePrompts = {
  en: "In the Theatre of Life, we are all actors sharing the same scene. Have you ever wondered what story we are truly writing?",
  hi: "जीवन के इस मंच पर, हम सभी एक ही कहानी के पात्र हैं। क्या आपने कभी सोचा है कि हम कौन सा अध्याय लिख रहे हैं?",
  es: "En el teatro de la vida, todos somos actores en la misma escena. ¿Alguna vez te has preguntado qué historia estamos escribiendo realmente?",
  fr: "Dans le théâtre de la vie, nous sommes tous des acteurs sur la même scène. Vous êtes-vous déjà demandé quelle histoire nous écrivons vraiment ?"
};

document.querySelectorAll(".sample-prompt-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const lang = btn.dataset.prompt;
    if (languageSelect) languageSelect.value = lang;
    if (samplePrompts[lang]) {
      textInput.value = samplePrompts[lang];
      charCount.textContent = textInput.value.length;
      updateGenerateState();
    }
  });
});

if (languageSelect) {
  languageSelect.addEventListener("change", () => {
    const lang = languageSelect.value;
    if (samplePrompts[lang] && (!textInput.value || textInput.value.trim() === "")) {
      textInput.value = samplePrompts[lang];
      charCount.textContent = textInput.value.length;
      updateGenerateState();
    }
  });
}

function showStatus(el, message, type) {
  el.textContent = message;
  el.className = `status ${type || ""}`;
  el.hidden = false;
}

function hideStatus(el) {
  el.hidden = true;
}

const samplePreviewAudio = new Audio();
let currentlyPlayingCard = null;

function stopSamplePreview() {
  samplePreviewAudio.pause();
  samplePreviewAudio.currentTime = 0;
  if (currentlyPlayingCard) {
    currentlyPlayingCard.classList.remove("is-playing");
    const playIcon = currentlyPlayingCard.querySelector(".play-icon");
    const pauseIcon = currentlyPlayingCard.querySelector(".pause-icon");
    const previewText = currentlyPlayingCard.querySelector(".preview-text");
    if (playIcon) playIcon.style.display = "inline-block";
    if (pauseIcon) pauseIcon.style.display = "none";
    if (previewText) previewText.textContent = "Preview";
    currentlyPlayingCard = null;
  }
}

samplePreviewAudio.addEventListener("ended", () => {
  stopSamplePreview();
});

samplePreviewAudio.addEventListener("pause", () => {
  if (samplePreviewAudio.currentTime === 0 || samplePreviewAudio.ended) {
    stopSamplePreview();
  }
});

async function loadVoices() {
  try {
    const res = await fetch("/api/voices");
    const data = await res.json();

    if (!data.voices || data.voices.length === 0) {
      voiceList.innerHTML = `<p class="voice-loading">No audio voices found in Samples/ folder — add .mp3 or .wav files to Samples/ and refresh.</p>`;
      return;
    }

    voiceList.innerHTML = "";
    data.voices.forEach((voice) => {
      const card = document.createElement("div");
      card.className = "voice-card";
      card.tabIndex = 0;
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", "false");
      card.innerHTML = `
        <div class="voice-main">
          <span class="voice-dot"></span>
          <span class="voice-name">${voice.label}</span>
        </div>
        <button type="button" class="preview-btn" title="Listen voice preview" aria-label="Listen preview for ${voice.label}">
          <svg class="preview-icon play-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <svg class="preview-icon pause-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="display:none;">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
          <span class="preview-text">Preview</span>
        </button>
      `;

      const previewBtn = card.querySelector(".preview-btn");
      const playIcon = card.querySelector(".play-icon");
      const pauseIcon = card.querySelector(".pause-icon");
      const previewText = card.querySelector(".preview-text");

      const togglePreview = () => {
        if (currentlyPlayingCard === card && !samplePreviewAudio.paused) {
          stopSamplePreview();
          return;
        }

        stopSamplePreview();
        if (voice.sampleUrl) {
          samplePreviewAudio.src = voice.sampleUrl;
          samplePreviewAudio.play().then(() => {
            currentlyPlayingCard = card;
            card.classList.add("is-playing");
            if (playIcon) playIcon.style.display = "none";
            if (pauseIcon) pauseIcon.style.display = "inline-block";
            if (previewText) previewText.textContent = "Playing";
          }).catch((err) => {
            console.warn("Could not play voice preview:", err);
          });
        }
      };

      const select = (playAudio = true) => {
        selectedVoiceId = voice.id;
        document.querySelectorAll(".voice-card").forEach((c) => {
          c.classList.remove("selected");
          c.setAttribute("aria-checked", "false");
        });
        card.classList.add("selected");
        card.setAttribute("aria-checked", "true");
        updateGenerateState();

        if (playAudio) {
          togglePreview();
        }
      };

      card.addEventListener("click", (e) => {
        if (e.target.closest(".preview-btn")) {
          select(false);
          togglePreview();
        } else {
          select(true);
        }
      });

      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select(true);
        }
      });

      voiceList.appendChild(card);
    });
  } catch (err) {
    voiceList.innerHTML = `<p class="voice-loading">Couldn't load voices — is the server running?</p>`;
  }
}

function estimateChunks(text) {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  let chunks = [];
  let current = "";
  const maxLen = 250;
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxLen) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks.length;
}

const activeProgressUpdateFns = new Set();

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    activeProgressUpdateFns.forEach((fn) => {
      try { fn(); } catch (e) {}
    });
  }
});

function startProgressTimer(text) {
  if (countdownInterval) clearInterval(countdownInterval);
  
  const speedPerChunk = parseFloat(localStorage.getItem("antigravity_seconds_per_chunk")) || 440;
  const numChunks = estimateChunks(text);
  const totalSeconds = numChunks * speedPerChunk;
  
  progressBar.style.width = "0%";
  progressBar.style.transition = "none";
  setTimeout(() => {
    progressBar.style.transition = "width 1s linear";
  }, 50);
  
  progressContainer.hidden = false;
  
  const startTime = Date.now();
  function updateProgress() {
    const elapsed = (Date.now() - startTime) / 1000;
    const remaining = Math.max(0, totalSeconds - elapsed);
    
    let percentage;
    if (elapsed < totalSeconds) {
      percentage = (elapsed / totalSeconds) * 95;
    } else {
      const excess = elapsed - totalSeconds;
      percentage = 95 + (4 * (1 - Math.exp(-excess / 120)));
    }
    progressBar.style.width = `${percentage}%`;
    
    if (elapsed < totalSeconds) {
      const remMin = Math.floor(remaining / 60);
      const remSec = Math.floor(remaining % 60);
      const remStr = remMin > 0 ? `${remMin}m ${remSec}s` : `${remSec}s`;
      progressText.innerHTML = `<span>Processing Chunks: ${numChunks}</span> <span>Est. Remaining: ~${remStr}</span>`;
    } else {
      progressText.innerHTML = `<span>Processing Chunks: ${numChunks}</span> <span style="color: var(--amber);">Running (taking longer than expected on CPU)...</span>`;
    }
  }
  
  updateProgress();
  activeProgressUpdateFns.add(updateProgress);
  countdownInterval = setInterval(updateProgress, 1000);
}

function stopProgressTimer(success, text, timeTaken) {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  activeProgressUpdateFns.clear();
  
  if (success && timeTaken && text) {
    progressBar.style.width = "100%";
    const numChunks = estimateChunks(text);
    if (numChunks > 0) {
      const speed = timeTaken / numChunks;
      localStorage.setItem("antigravity_seconds_per_chunk", speed);
    }
    progressText.innerHTML = `<span>Generation complete!</span>`;
  } else {
    progressText.innerHTML = `<span>Generation failed.</span>`;
  }
  
  setTimeout(() => {
    progressContainer.hidden = true;
  }, 1500);
}

generateBtn.addEventListener("click", async () => {
  const textVal = textInput.value;
  hideStatus(generateStatus);
  resultEl.hidden = true;
  generateBtn.disabled = true;
  showStatus(generateStatus, "Generating narration… this can take a while for long text.", "loading");
  startProgressTimer(textVal);

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voiceId: selectedVoiceId,
        text: textVal,
        language: languageSelect ? languageSelect.value : "auto"
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      stopProgressTimer(false);
      showStatus(generateStatus, data.error || "Something went wrong generating the audio.", "error");
      return;
    }

    stopProgressTimer(true, textVal, data.timeTaken);
    hideStatus(generateStatus);
    audioPlayer.src = data.audioUrl;
    downloadLink.href = data.audioUrl;
    
    if (data.timeTaken && data.audioDuration) {
      const ttf = data.timeTaken.toFixed(1);
      const dur = data.audioDuration.toFixed(1);
      const rtf = (data.timeTaken / data.audioDuration).toFixed(2);
      timingInfo.innerHTML = `<span><strong>Audio Length:</strong> ${dur}s</span> <span><strong>Generated in:</strong> ${ttf}s (${rtf}x real-time)</span>`;
      timingInfo.style.display = "flex";
    } else {
      timingInfo.style.display = "none";
    }
    
    resultEl.hidden = false;

    lastGeneratedFileName = data.fileName;
    currentAudioDuration = data.audioDuration || 0;
    narrationTranscriptContainer.hidden = true;
  } catch (err) {
    stopProgressTimer(false);
    showStatus(generateStatus, "Couldn't reach the server. Check your connection and try again.", "error");
  } finally {
    updateGenerateState();
  }
});

loadVoices();

// ---------- Step 1: Narration Transcription ----------
const transcribeNarrationBtn = document.getElementById("transcribe-narration-btn");
const narrationTranscriptContainer = document.getElementById("narration-transcript-container");
const narrationTranscribeStatus = document.getElementById("narration-transcribe-status");
const narrationTranscribeProgressContainer = document.getElementById("narration-transcribe-progress-container");
const narrationTranscribeProgressBar = document.getElementById("narration-transcribe-progress-bar");
const narrationTranscribeProgressText = document.getElementById("narration-transcribe-progress-text");
const narrationTranscriptResult = document.getElementById("narration-transcript-result");
const narrationTranscriptText = document.getElementById("narration-transcript-text");
const copyNarrationTranscriptBtn = document.getElementById("copy-narration-transcript-btn");
const downloadNarrationTranscriptBtn = document.getElementById("download-narration-transcript-btn");

let narrationTranscribeCountdownInterval = null;
let narrationTranscriptTextStr = "";

// ---------- Step 2: Custom Transcript ----------
const dropzone = document.getElementById("dropzone");
const dropzoneLabel = document.getElementById("dropzone-label");
const fileInput = document.getElementById("file-input");
const transcribeCustomBtn = document.getElementById("transcribe-custom-btn");
const transcribeCustomStatus = document.getElementById("transcribe-custom-status");
const transcribeCustomProgressContainer = document.getElementById("transcribe-custom-progress-container");
const transcribeCustomProgressBar = document.getElementById("transcribe-custom-progress-bar");
const transcribeCustomProgressText = document.getElementById("transcribe-custom-progress-text");
const customTranscriptResult = document.getElementById("custom-transcript-result");
const customTranscriptText = document.getElementById("custom-transcript-text");
const copyCustomTranscriptBtn = document.getElementById("copy-custom-transcript-btn");
const downloadCustomTranscriptBtn = document.getElementById("download-custom-transcript-btn");

let customAudioFile = null;
let customAudioDuration = 0;
let customTranscriptTextStr = "";
let customTranscribeCountdownInterval = null;

async function getAudioDuration(file) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    audio.src = URL.createObjectURL(file);
    audio.addEventListener("loadedmetadata", () => {
      if (isFinite(audio.duration)) {
        resolve(audio.duration);
      } else {
        resolve(0);
      }
    });
    audio.addEventListener("error", () => {
      resolve(0);
    });
  });
}

function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function getTranscribeSpeedFactor() {
  let factor = parseFloat(localStorage.getItem("antigravity_transcribe_speed_factor"));
  if (isNaN(factor) || factor <= 0 || factor > 0.8) {
    factor = 0.25;
    localStorage.setItem("antigravity_transcribe_speed_factor", "0.25");
  }
  return factor;
}

// --- Narration Transcription Actions ---
function startNarrationTranscribeProgressTimer(duration) {
  if (narrationTranscribeCountdownInterval) clearInterval(narrationTranscribeCountdownInterval);
  
  const speedFactor = getTranscribeSpeedFactor();
  const totalSeconds = duration > 0 ? duration * speedFactor : 10;
  
  narrationTranscribeProgressBar.style.width = "0%";
  narrationTranscribeProgressBar.style.background = "var(--amber)";
  narrationTranscribeProgressBar.style.transition = "none";
  setTimeout(() => {
    narrationTranscribeProgressBar.style.transition = "width 1s linear";
  }, 50);
  
  narrationTranscribeProgressContainer.hidden = false;
  
  const startTime = Date.now();
  function updateProgress() {
    const elapsed = (Date.now() - startTime) / 1000;
    const remaining = Math.max(0, totalSeconds - elapsed);
    
    let percentage;
    if (elapsed < totalSeconds) {
      percentage = (elapsed / totalSeconds) * 95;
    } else {
      const excess = elapsed - totalSeconds;
      percentage = 95 + (4 * (1 - Math.exp(-excess / 30)));
    }
    narrationTranscribeProgressBar.style.width = `${percentage}%`;
    
    if (elapsed < totalSeconds) {
      const remMin = Math.floor(remaining / 60);
      const remSec = Math.floor(remaining % 60);
      const remStr = remMin > 0 ? `${remMin}m ${remSec}s` : `${remSec}s`;
      narrationTranscribeProgressText.innerHTML = `<span>Audio Length: ${duration.toFixed(1)}s</span> <span>Est. Remaining: ~${remStr}</span>`;
    } else {
      narrationTranscribeProgressText.innerHTML = `<span>Audio Length: ${duration.toFixed(1)}s</span> <span style="color: var(--amber);">Transcribing (taking longer than expected on CPU)...</span>`;
    }
  }
  
  updateProgress();
  activeProgressUpdateFns.add(updateProgress);
  narrationTranscribeCountdownInterval = setInterval(updateProgress, 1000);
}

function stopNarrationTranscribeProgressTimer(success, duration, timeTaken) {
  if (narrationTranscribeCountdownInterval) {
    clearInterval(narrationTranscribeCountdownInterval);
    narrationTranscribeCountdownInterval = null;
  }
  activeProgressUpdateFns.clear();
  
  narrationTranscribeProgressBar.style.transition = "none";
  if (success) {
    narrationTranscribeProgressBar.style.transition = "width 0.5s ease-out";
    narrationTranscribeProgressBar.style.width = "100%";
    narrationTranscribeProgressBar.style.background = "var(--teal)";
    if (timeTaken && duration > 0) {
      const speed = Math.max(0.05, Math.min(0.8, timeTaken / duration));
      localStorage.setItem("antigravity_transcribe_speed_factor", speed.toString());
    }
    narrationTranscribeProgressText.innerHTML = `<span>Transcription complete!</span>`;
  } else {
    narrationTranscribeProgressBar.style.width = "0%";
    narrationTranscribeProgressBar.style.background = "#a9503f";
    narrationTranscribeProgressText.innerHTML = `<span style="color: #e8a99c;">Transcription failed. Check error details.</span>`;
  }
  
  setTimeout(() => {
    narrationTranscribeProgressContainer.hidden = true;
    narrationTranscribeProgressBar.style.background = "var(--amber)";
  }, 4000);
}

transcribeNarrationBtn.addEventListener("click", async () => {
  if (!lastGeneratedFileName) return;

  hideStatus(narrationTranscribeStatus);
  narrationTranscriptResult.hidden = true;
  narrationTranscriptContainer.hidden = false;
  transcribeNarrationBtn.disabled = true;
  showStatus(narrationTranscribeStatus, "Transcribing generated narration…", "loading");
  
  const transStartTime = Date.now();
  startNarrationTranscribeProgressTimer(currentAudioDuration);

  try {
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceFile: lastGeneratedFileName }),
    });

    const data = await res.json();

    if (!res.ok) {
      stopNarrationTranscribeProgressTimer(false);
      showStatus(narrationTranscribeStatus, data.error || "Transcription failed.", "error");
      return;
    }

    const timeTaken = (Date.now() - transStartTime) / 1000;
    stopNarrationTranscribeProgressTimer(true, currentAudioDuration, timeTaken);
    hideStatus(narrationTranscribeStatus);
    
    narrationTranscriptTextStr = data.lines.map((l) => `[${formatTimestamp(l.start)}] ${l.text}`).join("\n");
    narrationTranscriptText.textContent = narrationTranscriptTextStr;
    narrationTranscriptResult.hidden = false;
  } catch (err) {
    stopNarrationTranscribeProgressTimer(false);
    showStatus(narrationTranscribeStatus, "Couldn't reach the server. Check your connection.", "error");
  } finally {
    transcribeNarrationBtn.disabled = false;
  }
});

copyNarrationTranscriptBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(narrationTranscriptTextStr);
    copyNarrationTranscriptBtn.textContent = "Copied!";
    setTimeout(() => (copyNarrationTranscriptBtn.textContent = "Copy transcript"), 1500);
  } catch (err) {
    showStatus(narrationTranscribeStatus, "Couldn't copy to clipboard.", "error");
  }
});

downloadNarrationTranscriptBtn.addEventListener("click", () => {
  const blob = new Blob([narrationTranscriptTextStr], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "narration_transcript.txt";
  a.click();
  URL.revokeObjectURL(url);
});


// --- Custom Transcription Actions ---
function startCustomTranscribeProgressTimer(duration) {
  if (customTranscribeCountdownInterval) clearInterval(customTranscribeCountdownInterval);
  
  const speedFactor = getTranscribeSpeedFactor();
  const totalSeconds = duration > 0 ? duration * speedFactor : 10;
  
  transcribeCustomProgressBar.style.width = "0%";
  transcribeCustomProgressBar.style.background = "var(--amber)";
  transcribeCustomProgressBar.style.transition = "none";
  setTimeout(() => {
    transcribeCustomProgressBar.style.transition = "width 1s linear";
  }, 50);
  
  transcribeCustomProgressContainer.hidden = false;
  
  const startTime = Date.now();
  function updateProgress() {
    const elapsed = (Date.now() - startTime) / 1000;
    const remaining = Math.max(0, totalSeconds - elapsed);
    
    let percentage;
    if (elapsed < totalSeconds) {
      percentage = (elapsed / totalSeconds) * 95;
    } else {
      const excess = elapsed - totalSeconds;
      percentage = 95 + (4 * (1 - Math.exp(-excess / 30)));
    }
    transcribeCustomProgressBar.style.width = `${percentage}%`;
    
    if (elapsed < totalSeconds) {
      const remMin = Math.floor(remaining / 60);
      const remSec = Math.floor(remaining % 60);
      const remStr = remMin > 0 ? `${remMin}m ${remSec}s` : `${remSec}s`;
      transcribeCustomProgressText.innerHTML = `<span>Audio Length: ${duration.toFixed(1)}s</span> <span>Est. Remaining: ~${remStr}</span>`;
    } else {
      transcribeCustomProgressText.innerHTML = `<span>Audio Length: ${duration.toFixed(1)}s</span> <span style="color: var(--amber);">Transcribing (taking longer than expected on CPU)...</span>`;
    }
  }
  
  updateProgress();
  activeProgressUpdateFns.add(updateProgress);
  customTranscribeCountdownInterval = setInterval(updateProgress, 1000);
}

function stopCustomTranscribeProgressTimer(success, duration, timeTaken) {
  if (customTranscribeCountdownInterval) {
    clearInterval(customTranscribeCountdownInterval);
    customTranscribeCountdownInterval = null;
  }
  activeProgressUpdateFns.clear();
  
  transcribeCustomProgressBar.style.transition = "none";
  if (success) {
    transcribeCustomProgressBar.style.transition = "width 0.5s ease-out";
    transcribeCustomProgressBar.style.width = "100%";
    transcribeCustomProgressBar.style.background = "var(--teal)";
    if (timeTaken && duration > 0) {
      const speed = Math.max(0.05, Math.min(0.8, timeTaken / duration));
      localStorage.setItem("antigravity_transcribe_speed_factor", speed.toString());
    }
    transcribeCustomProgressText.innerHTML = `<span>Transcription complete!</span>`;
  } else {
    transcribeCustomProgressBar.style.width = "0%";
    transcribeCustomProgressBar.style.background = "#a9503f";
    transcribeCustomProgressText.innerHTML = `<span style="color: #e8a99c;">Transcription failed. Check error details.</span>`;
  }
  
  setTimeout(() => {
    transcribeCustomProgressContainer.hidden = true;
    transcribeCustomProgressBar.style.background = "var(--amber)";
  }, 4000);
}

// Drag & drop
dropzone.addEventListener("click", () => fileInput.click());

["dragover", "dragleave", "drop"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => e.preventDefault());
});

dropzone.addEventListener("dragover", () => dropzone.classList.add("dragging"));
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
dropzone.addEventListener("drop", (e) => {
  dropzone.classList.remove("dragging");
  const file = e.dataTransfer.files[0];
  if (file) setFileSource(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) setFileSource(fileInput.files[0]);
});

async function setFileSource(file) {
  customAudioFile = file;
  dropzoneLabel.textContent = `Selected: ${file.name}`;
  transcribeCustomBtn.disabled = false;
  customAudioDuration = await getAudioDuration(file);
}

transcribeCustomBtn.addEventListener("click", async () => {
  if (!customAudioFile) return;

  hideStatus(transcribeCustomStatus);
  customTranscriptResult.hidden = true;
  transcribeCustomBtn.disabled = true;
  showStatus(transcribeCustomStatus, "Transcribing custom audio file…", "loading");
  
  const transStartTime = Date.now();
  startCustomTranscribeProgressTimer(customAudioDuration);

  try {
    const form = new FormData();
    form.append("audio", customAudioFile);
    const res = await fetch("/api/transcribe", { method: "POST", body: form });

    const data = await res.json();

    if (!res.ok) {
      stopCustomTranscribeProgressTimer(false);
      showStatus(transcribeCustomStatus, data.error || "Transcription failed.", "error");
      return;
    }

    const timeTaken = (Date.now() - transStartTime) / 1000;
    stopCustomTranscribeProgressTimer(true, customAudioDuration, timeTaken);
    hideStatus(transcribeCustomStatus);
    
    customTranscriptTextStr = data.lines.map((l) => `[${formatTimestamp(l.start)}] ${l.text}`).join("\n");
    customTranscriptText.textContent = customTranscriptTextStr;
    customTranscriptResult.hidden = false;
  } catch (err) {
    stopCustomTranscribeProgressTimer(false);
    showStatus(transcribeCustomStatus, "Couldn't reach the server. Check your connection.", "error");
  } finally {
    transcribeCustomBtn.disabled = false;
  }
});

copyCustomTranscriptBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(customTranscriptTextStr);
    copyCustomTranscriptBtn.textContent = "Copied!";
    setTimeout(() => (copyCustomTranscriptBtn.textContent = "Copy transcript"), 1500);
  } catch (err) {
    showStatus(transcribeCustomStatus, "Couldn't copy to clipboard.", "error");
  }
});

downloadCustomTranscriptBtn.addEventListener("click", () => {
  const blob = new Blob([customTranscriptTextStr], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "custom_transcript.txt";
  a.click();
  URL.revokeObjectURL(url);
});
