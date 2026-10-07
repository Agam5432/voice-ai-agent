import React, { useRef, useState } from "react";
import { createGeminiLiveConnection } from "./geminiLive";

const PHASE_STATUS = {
  listening: "🎤 Listening...",
  thinking: "🧠 Thinking...",
  speaking: "🔊 Agent speaking...",
};

const GREETING_SPOKEN =
  "Namaste, City Dental Clinic mein aapka swagat hai. Main Priya bol rahi hoon. Main aapki kya madad kar sakti hoon? How can I help you?";

function App() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [userTranscript, setUserTranscript] = useState("");
  const [agentResponse, setAgentResponse] = useState("");

  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const geminiRef = useRef(null);

  const speechIdRef = useRef(0);   // identifies the CURRENT utterance
  const finishRef = useRef(null);  // ends the current utterance (reports it to the server once)
  const pollRef = useRef(null);
  const watchdogRef = useRef(null);
  const voiceRef = useRef(null);   // the one voice used for the whole call

  // ------------------------------------------------------------
  // TTS (browser). The browser only reports when speech ENDED;
  // the server already stops listening the moment it replies.
  // ------------------------------------------------------------
  // One FEMALE voice for the whole call, chosen once (the greeting used to play before the
  // voice list had loaded, so it got a different voice than the rest).
  // Optional: VITE_TTS_VOICE="Zira" (any part of a voice name) forces a specific voice.
  const pickVoice = async () => {
    if (voiceRef.current) return voiceRef.current;
    const synth = window.speechSynthesis;
    const voices = await new Promise((resolve) => {
      const have = synth.getVoices();
      if (have.length) return resolve(have);
      const done = () => resolve(synth.getVoices());
      synth.addEventListener("voiceschanged", done, { once: true });
      setTimeout(done, 1500);
    });
    const forced = import.meta.env.VITE_TTS_VOICE?.toLowerCase();
    const female = /female|zira|heera|kalpana|swara|neerja|aria|jenny|samantha|veena|lekha|google (हिन्दी|hindi)/i;
    const indian = (v) => v.lang === "en-IN" || v.lang.startsWith("hi") || /india|हिन्दी|hindi/i.test(v.name);
    // Indian FEMALE voice first (Neerja/Swara natural, Heera, Kalpana, Google हिन्दी, Veena, Lekha),
    // then any other female voice, then anything English.
    const score = (v) =>
      (forced && v.name.toLowerCase().includes(forced) ? 10000 : 0) +
      (indian(v) ? 1000 : 0) + (female.test(v.name) ? 500 : 0) +
      (/natural|neural|neerja|swara/i.test(v.name) ? 60 : 0) + (v.localService ? 20 : 0) +
      (v.lang === "en-IN" ? 15 : v.lang.startsWith("hi") ? 10 : v.lang.startsWith("en") ? 5 : -100000);
    const best = [...voices].sort((x, y) => score(y) - score(x))[0];
    voiceRef.current = best && score(best) > 0 ? best : null;
    console.log("🔊 Voice:", voiceRef.current ? `${voiceRef.current.name} (${voiceRef.current.lang})` : "browser default");
    if (!voiceRef.current || !indian(voiceRef.current)) {
      console.warn("⚠️ No Indian voice in this browser. Available:", voices.map((v) => `${v.name} (${v.lang})`).join(" | "));
    }
    return voiceRef.current;
  };

  const speak = async (text, serverId) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const id = ++speechIdRef.current;
    let ended = false;

    const finish = () => {
      if (ended || id !== speechIdRef.current) return;
      ended = true;
      clearInterval(pollRef.current);
      clearTimeout(watchdogRef.current);
      geminiRef.current?.sendJSON({ type: "AgentSpeechEnd", id: serverId });
    };
    finishRef.current = finish;

    const voice = await pickVoice();
    if (id !== speechIdRef.current) return; // a newer reply replaced this one while the voices loaded

    // Hindi voices can read Devanagari; English-only voices get a romanized copy of the greeting
    const canHindi = voice?.lang?.startsWith("hi");
    const spoken = /[\u0900-\u097F]/.test(text) && !canHindi ? GREETING_SPOKEN : text;

    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = voice?.lang || "en-US";
    if (voice) utterance.voice = voice;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = finish;
    utterance.onerror = finish;

    // Chrome TTS sometimes stays paused or never fires onend
    const startedAt = Date.now();
    clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (synth.paused) synth.resume();
      if (Date.now() - startedAt > 800 && !synth.speaking && !synth.pending) finish();
    }, 250);
    clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => { synth.cancel(); finish(); }, Math.max(4000, spoken.length * 90));

    synth.speak(utterance);
  };

  // ------------------------------------------------------------
  // Microphone -> 16 kHz PCM16 -> server (server decides when it listens)
  // ------------------------------------------------------------
  const startRecording = async () => {
    try {
      geminiRef.current = createGeminiLiveConnection({
        onUserTurn: (text) => setUserTranscript(text),
        onAgentResponse: (text, id) => { setAgentResponse(text); speak(text, id); },
        onPhase: (phase) => setStatus(PHASE_STATUS[phase] || phase),
        onError: (message) => setStatus(`❌ ${message}`),
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      await audioContext.resume();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      sourceRef.current = source;
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const pcm = toPCM16At16k(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
        geminiRef.current?.send(pcm.buffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setRecording(true);
      setStatus("🎤 Listening...");
    } catch (error) {
      console.error("❌ Microphone error:", error);
      setStatus("Microphone error");
    }
  };

  const stopRecording = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;

    window.speechSynthesis.cancel();
    clearInterval(pollRef.current);
    clearTimeout(watchdogRef.current);

    geminiRef.current?.close();
    geminiRef.current = null;

    setRecording(false);
    setStatus("Stopped");
  };

  // ------------------------------------------------------------
  return (
    <div style={{ minHeight: "100vh", padding: "40px", fontFamily: "Arial, sans-serif", background: "#f5f5f5" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", background: "#fff", padding: "30px", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
        <h1>🦷 City Dental Clinic</h1>
        <h2>Priya AI Voice Agent</h2>

        <div style={{ marginBottom: "20px", padding: "15px", borderRadius: "10px", background: "#f0f0f0", fontWeight: "bold" }}>
          Status: {status}
        </div>

        <button
          onClick={recording ? stopRecording : startRecording}
          style={{ width: "100%", padding: "15px", fontSize: "18px", border: "none", borderRadius: "10px", cursor: "pointer" }}
        >
          {recording ? "🛑 Stop Call" : "🎤 Start Conversation"}
        </button>

        <div style={{ marginTop: "30px" }}>
          <h3>🗣️ User said</h3>
          <div style={{ minHeight: "60px", padding: "15px", background: "#f7f7f7", borderRadius: "10px", whiteSpace: "pre-wrap" }}>
            {userTranscript || "Waiting for user..."}
          </div>
        </div>

        <div style={{ marginTop: "20px" }}>
          <h3>🤖 Priya</h3>
          <div style={{ minHeight: "60px", padding: "15px", background: "#f7f7f7", borderRadius: "10px", whiteSpace: "pre-wrap" }}>
            {agentResponse || "Waiting for agent..."}
          </div>
        </div>
      </div>
    </div>
  );
}

// Float32 (any sample rate) -> PCM16 @ 16 kHz, averaging samples to downsample
function toPCM16At16k(float32, inputRate) {
  const ratio = inputRate / 16000;
  const out = new Int16Array(Math.floor(float32.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), float32.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += float32[j];
    const s = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export default App;