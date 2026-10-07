import "dotenv/config";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI } from "@google/genai";

import { connectDB } from "./src/database/connection.js";
import { agent } from "./src/agent/agent.js";
import { EMPTY_BOOKING } from "./src/agent/bookingState.js";
import { getDoctors } from "./src/domain/dental/lookup.js";

const PORT = 3002;
const DEBUG = process.env.DEBUG_VOICE === "1"; // DEBUG_VOICE=1 -> phase + raw Gemini event logs

const GEMINI_MODEL = "gemini-3.5-transcribe-live";
const GREETING =
  "नमस्ते, सिटी डेंटल क्लिनिक में आपका स्वागत है। मैं प्रिया बोल रही हूँ। मैं आपकी क्या मदद कर सकती हूँ? How can I help you?";
const FALLBACK = "Sorry, I didn't catch that. Could you please say it again?";

const AGENT_TIMEOUT_MS = 25_000;
const REOPEN_MIC_DELAY_MS = 300;  // let the speaker tail die out before the mic opens again
const QUIET_FINALIZE_MS = 700;    // no new words for this long -> the user finished
const AFTER_TURNCOMPLETE_MS = 200; // Gemini said turn complete; wait a moment for the last words
const FILLER_ONLY = /^(?:\W|uh+|um+|hmm+|mm+|ah+|oh+|er+)*$/i;

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const dbg = (...a) => DEBUG && console.log(...a);

const server = http.createServer((req, res) => { res.writeHead(404); res.end(); });
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  if (pathname !== "/api/gemini-live") return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

// gpt-oss sometimes returns the same sentence twice ("...?Sure, could you...?Sure, could you...?")
const dedupeReply = (text) => {
  const t = text.trim();
  const mid = Math.floor(t.length / 2);
  for (let i = mid - 3; i <= mid + 3; i++) {
    const a = t.slice(0, i).trim();
    if (a && a === t.slice(i).trim()) return a;
  }
  return t;
};

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`agent timeout ${ms}ms`)), ms))]);

wss.on("connection", (client) => {
  console.log("🎤 Browser connected");

  const convo = { messages: [], booking: { ...EMPTY_BOOKING } };
  let closed = false;

  const send = (obj) => client.readyState === WebSocket.OPEN && client.send(JSON.stringify(obj));
  const sendError = (error) => { console.error("❌", error); send({ type: "Error", error: String(error) }); };

  // ---------------------------------------------------------------
  // TURN MANAGER:  listening -> thinking -> speaking -> listening
  // Mic audio reaches Gemini ONLY while "listening". Transcripts that
  // arrive in any other phase are ignored, so Priya never hears herself
  // and one spoken sentence can never become two agent calls.
  // ---------------------------------------------------------------
  let phase = "listening";
  let speakSeq = 0;
  let speakingWatchdog = null;
  let reopenTimer = null;

  const setPhase = (next, why) => {
    if (phase === next) return;
    dbg(`🚦 ${phase} → ${next} (${why})`);
    phase = next;
    send({ type: "Phase", phase });
  };

  const startListening = (why) => {
    clearTimeout(speakingWatchdog);
    clearTimeout(reopenTimer);
    reopenTimer = setTimeout(() => {
      if (closed) return;
      resetTurn();               // forget anything Gemini sent while we were busy
      setPhase("listening", why);
    }, REOPEN_MIC_DELAY_MS);
  };

  const speak = (text) => {
    const id = ++speakSeq;
    setPhase("speaking", "agent reply");
    send({ type: "AgentResponse", response: text, id });
    clearTimeout(speakingWatchdog); // browser TTS can fail silently; never deadlock
    speakingWatchdog = setTimeout(() => {
      if (!closed) { console.warn("⚠️ browser never reported end of speech"); startListening("watchdog"); }
    }, Math.min(30_000, 3_000 + text.length * 85));
  };

  // ---------------------------------------------------------------
  // USER TURN COLLECTOR (Gemini transcript events -> ONE final sentence)
  // ---------------------------------------------------------------
  let finals = "";          // text from inputTranscription chunks
  let interim = "";         // latest interimInputTranscription
  let finalizeTimer = null;
  let lastTurn = { text: "", at: 0 };

  function resetTurn() {
    clearTimeout(finalizeTimer);
    finals = ""; interim = "";
  }

  const addFinal = (chunk) => {
    const s = String(chunk);
    if (!s.trim()) return;
    if (finals.trim() === s.trim() || finals.endsWith(s)) return;   // repeated chunk
    if (finals && s.trim().startsWith(finals.trim())) { finals = s; return; } // cumulative text
    finals += s;                                                    // delta text
  };

  const armFinalize = (ms) => {
    clearTimeout(finalizeTimer);
    finalizeTimer = setTimeout(finalizeTurn, ms);
  };

  function finalizeTurn() {
    if (closed || phase !== "listening") return;
    const text = (finals.trim() || interim.trim()).replace(/\s+/g, " ");
    resetTurn();
    if (!text || FILLER_ONLY.test(text)) return;
    if (text === lastTurn.text && Date.now() - lastTurn.at < 4000) return dbg("⚠️ duplicate turn ignored:", text);
    lastTurn = { text, at: Date.now() };
    try { session?.sendRealtimeInput({ audioStreamEnd: true }); } catch { /* session reconnecting */ }
    handleUserTurn(text);
  }

  // ---------------------------------------------------------------
  // ONE user turn -> ONE agent run (logic unchanged)
  // ---------------------------------------------------------------
  async function handleUserTurn(transcript) {
    setPhase("thinking", "user turn");
    send({ type: "UserTurn", transcript });
    console.log("\n🗣️ USER SAID:", transcript);

    const t0 = Date.now();
    try {
      const history = [...convo.messages, { role: "user", content: transcript }];
      const result = await withTimeout(
        agent.invoke({ messages: history, conversationState: convo.booking }),
        AGENT_TIMEOUT_MS
      );
      if (closed) return;

      const last = result.messages[result.messages.length - 1];
      const reply = dedupeReply(typeof last?.content === "string" ? last.content : "") || FALLBACK;

      convo.messages = [...history, { role: "assistant", content: reply }].slice(-20);
      convo.booking = result.conversationState;

      console.log("🤖 AGENT RESPONSE:", reply);
      dbg("📦 booking:", JSON.stringify(convo.booking), `| ${Date.now() - t0} ms`);
      speak(reply);
    } catch (error) {
      sendError(`Agent error: ${error?.message || error}`);
      if (!closed) speak(FALLBACK); // state not committed; caller simply repeats
    }
  }

  // ---------------------------------------------------------------
  // GEMINI LIVE (auto-reconnects: sessions end after a while)
  // ---------------------------------------------------------------
  let session = null;
  let sessionGen = 0;
  let reconnects = 0;

  async function buildVocabulary() {
    const base = ["City Dental Clinic", "appointment", "root canal", "braces", "doctor", "dentist"];
    try {
      const doctors = await getDoctors();
      // STT_VOCAB="Agam Tyagi,Tyagi,Agam" in .env -> extra words Gemini should spell correctly
      const extra = (process.env.STT_VOCAB || "").split(",").map((w) => w.trim()).filter(Boolean);
      return [...new Set([...base, ...extra, ...doctors.flatMap((d) => [d.name, ...d.expertise])])];
    } catch { return base; }
  }

  async function connectGemini() {
    const gen = ++sessionGen;
    try {
      const vocab = await buildVocabulary();
      const s = await gemini.live.connect({
        model: GEMINI_MODEL,
        config: {
          responseModalities: ["TEXT"], // transcription only; Priya's voice = browser TTS
          realtimeInputConfig: {
            automaticActivityDetection: { disabled: false, prefixPaddingMs: 100, silenceDurationMs: 700 },
          },
          inputAudioTranscription: { languageCodes: [], mode: "VERBATIM", customVocabulary: vocab },
        },
        callbacks: {
          onopen: () => { reconnects = 0; dbg("✅ Gemini Live connected"); },
          onmessage: (m) => {
            if (closed || gen !== sessionGen) return;
            const sc = m?.serverContent;
            if (!sc) return;
            dbg("📡 gemini:", JSON.stringify({
              interim: sc.interimInputTranscription?.text, final: sc.inputTranscription?.text, turnComplete: sc.turnComplete,
            }));
            if (phase !== "listening") return; // late chunks / echo while Priya is busy

            const i = sc.interimInputTranscription?.text;
            const f = sc.inputTranscription?.text;
            if (i) { interim = i; armFinalize(QUIET_FINALIZE_MS); }
            if (f) { addFinal(f); armFinalize(QUIET_FINALIZE_MS); }
            if (sc.turnComplete && (finals || interim)) armFinalize(AFTER_TURNCOMPLETE_MS);
          },
          onerror: (e) => sendError(`Gemini Live: ${e?.message || e}`),
          onclose: (e) => {
            if (gen !== sessionGen) return;
            session = null;
            if (closed) return;
            if (reconnects < 5) {
              reconnects++;
              dbg(`🔁 Gemini reconnect ${reconnects}/5`, e?.reason || "");
              setTimeout(connectGemini, 500);
            } else sendError("Gemini Live connection lost");
          },
        },
      });
      if (gen !== sessionGen || closed) return s.close();
      session = s;
    } catch (error) {
      sendError(`Gemini Live connect failed: ${error?.message || error}`);
    }
  }

  // ---------------------------------------------------------------
  // BROWSER -> SERVER
  // ---------------------------------------------------------------
  client.on("message", (data, isBinary) => {
    if (closed) return;
    if (!isBinary) {
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type === "AgentSpeechEnd") {
        if (msg.id !== undefined && msg.id !== speakSeq) return dbg("↩️ stale AgentSpeechEnd", msg.id);
        if (phase === "speaking") startListening("browser finished speaking");
      }
      return;
    }
    if (phase !== "listening" || !session) return;
    try {
      session.sendRealtimeInput({
        audio: { data: Buffer.from(data).toString("base64"), mimeType: "audio/pcm;rate=16000" },
      });
    } catch (error) { dbg("audio send failed:", error?.message); }
  });

  client.on("close", () => {
    console.log("🛑 Browser disconnected");
    closed = true;
    clearTimeout(speakingWatchdog); clearTimeout(reopenTimer); clearTimeout(finalizeTimer);
    try { session?.close(); } catch { /* already closed */ }
  });

  // ---------------------------------------------------------------
  // START
  // ---------------------------------------------------------------
  if (!process.env.GEMINI_API_KEY) { sendError("GEMINI_API_KEY is missing in .env"); return client.close(); }
  connectGemini();
  convo.messages.push({ role: "assistant", content: GREETING });
  speak(GREETING);
});

await connectDB();
server.listen(PORT, () => console.log(`🎤 Voice server running on http://localhost:${PORT}`));