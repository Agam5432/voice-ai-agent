import "dotenv/config";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export const textToSpeech = async (text) => {
  console.log("🔊 ElevenLabs TTS started");
  console.log("📝 Text:", text);

  const audio = await elevenlabs.textToSpeech.convert(
    "cgSgspJ2msm6clMCkdW9",
    {
      text,
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128",
    }
  );

  console.log("✅ ElevenLabs TTS completed");

  return audio;
};