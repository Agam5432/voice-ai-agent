import "dotenv/config";

import { agent } from "./src/agent/agent.js";
import { connectDB } from "./src/database/connection.js";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createDeepgramConnection } from "./src/stt/deepgram.js";

await connectDB();

// -----------------------------
// Deepgram STT connection test
// -----------------------------

const deepgram = createDeepgramConnection();

console.log("🎤 Starting Deepgram STT test...");