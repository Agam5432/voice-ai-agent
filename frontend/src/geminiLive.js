// Connection to the voice server. The server is the turn manager and sends only:
//   UserTurn      -> the FINAL sentence the user said (what the agent received)
//   AgentResponse -> Priya's reply (+ id, echoed back when speech ends)
//   Phase         -> listening | thinking | speaking
//   Error         -> anything that went wrong
export function createGeminiLiveConnection({ onUserTurn, onAgentResponse, onPhase, onError } = {}) {
  const API_URL = import.meta.env.VITE_API_URL || "";
  let wsUrl = "ws://localhost:3002/api/gemini-live";
  if (API_URL) {
    const url = new URL(API_URL);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/api/gemini-live";
    url.search = "";
    wsUrl = url.toString();
  }

  const socket = new WebSocket(wsUrl);
  socket.binaryType = "arraybuffer";

  socket.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); }
    catch (e) { return console.error("❌ Invalid server message:", e); }

    if (msg.type === "UserTurn") {
      console.log("🗣️ USER SAID:", msg.transcript);
      onUserTurn?.(msg.transcript);
    } else if (msg.type === "AgentResponse") {
      console.log("🤖 AGENT RESPONSE:", msg.response);
      onAgentResponse?.(msg.response, msg.id);
    } else if (msg.type === "Phase") {
      onPhase?.(msg.phase);
    } else if (msg.type === "Error") {
      console.error("❌", msg.error);
      onError?.(msg.error);
    }
  };

  socket.onerror = () => { console.error("❌ Cannot reach voice server"); onError?.("Cannot reach voice server"); };
  socket.onclose = () => console.log("🛑 Voice server connection closed");

  return {
    send(audio) { if (socket.readyState === WebSocket.OPEN) socket.send(audio); },
    sendJSON(obj) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj)); },
    close() {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    },
  };
}