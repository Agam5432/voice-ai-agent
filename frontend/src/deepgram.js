// Voice-server connection. The server is the turn manager: it decides which user
// turns are accepted (UserTurn), when the agent speaks (AgentResponse) and when we
// are listening again (Phase). The ElevenLabs "AgentAudio" branch was removed because
// the server no longer sends it — restore it from the previous file if you re-enable it.
export function createDeepgramConnection({ onUserTurn, onAgentResponse, onPhase } = {}) {
  const socket = new WebSocket("ws://localhost:3002/api/deepgram-stream");
  socket.binaryType = "arraybuffer";

  socket.onopen = () => console.log("✅ Connected to Voice Server");

  socket.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); }
    catch (e) { return console.error("❌ Bad Voice Server message:", e); }

    if (msg.type === "Connected") console.log("🎤 Deepgram connected");
    if (msg.type === "TurnInfo" && msg.event === "StartOfTurn") console.log("🟢 User started speaking");
    if (msg.type === "UserTurn") { console.log("🗣️ USER SAID:", msg.transcript); onUserTurn?.(msg.transcript); }
    if (msg.type === "AgentResponse") { console.log("🤖 AGENT RESPONSE:", msg.response); onAgentResponse?.(msg.response); }
    if (msg.type === "Phase") { console.log("🚦 Phase:", msg.phase); onPhase?.(msg.phase); }
  };

  socket.onerror = (e) => console.error("❌ WebSocket error:", e);
  socket.onclose = () => console.log("🛑 Voice Server connection closed");

  return {
    send(audio) { if (socket.readyState === WebSocket.OPEN) socket.send(audio); },
    sendJSON(obj) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj)); },
    close() { if (socket.readyState === WebSocket.OPEN) socket.close(); },
  };
}