import "dotenv/config";
import { WebSocket } from "ws";

export function createDeepgramConnection({
  onTranscript,
} = {}) {
  const deepgram = new WebSocket(
    "wss://api.deepgram.com/v2/listen?model=flux-general-en&encoding=linear16&sample_rate=16000",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgram.on("open", () => {
    console.log("✅ Connected to Deepgram");
  });

  deepgram.on("message", (data) => {
    const message = JSON.parse(data.toString());

    console.log("🎤 Deepgram:", message);

    if (
      message.type === "TurnInfo" &&
      message.event === "EndOfTurn" &&
      message.transcript
    ) {
      const transcript = message.transcript.trim();

      console.log(
        "🎤 USER SAID:",
        transcript
      );

      if (onTranscript) {
        onTranscript(transcript);
      }
    }
  });

  deepgram.on("error", (error) => {
    console.error(
      "❌ Deepgram error:",
      error.message
    );
  });

  deepgram.on("close", () => {
    console.log(
      "🛑 Deepgram connection closed"
    );
  });

  return {
    send(audio) {
      if (
        deepgram.readyState ===
        WebSocket.OPEN
      ) {
        deepgram.send(audio);
      }
    },

    close() {
      if (
        deepgram.readyState ===
        WebSocket.OPEN
      ) {
        deepgram.close();
      }
    },
  };
}