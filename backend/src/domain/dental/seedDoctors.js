import "dotenv/config";
import { connectDB } from "../../database/connection.js";
import { Doctor } from "./models/Doctor.js";

await connectDB();

await Doctor.deleteMany({});

await Doctor.insertMany([
  {
    name: "Dr. Neha Kapoor",
    expertise: ["Root Canal", "General Dentistry"],
    availableDays: ["Monday", "Wednesday", "Friday"],
    timings: {
      start: "10:00",
      end: "18:00",
    },
  },
  {
    name: "Dr. Arjun Singh",
    expertise: ["Braces", "Orthodontics"],
    availableDays: ["Tuesday", "Thursday", "Saturday"],
    timings: {
      start: "10:00",
      end: "18:00",
    },
  },
]);

console.log("Doctors inserted successfully");

process.exit(0);