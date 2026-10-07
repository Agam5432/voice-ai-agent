import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Doctor } from "../models/Doctor.js";
import { getAvailability, normalizeTime } from "../scheduling.js";

export const checkAvailability = tool(
  async ({ doctorName, date, time }) => {
    const doctor = await Doctor.findOne({
      name: { $regex: new RegExp(`^${doctorName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    }).lean();
    if (!doctor) return JSON.stringify({ available: false, reason: `Doctor ${doctorName} was not found.` });

    const result = await getAvailability(doctor, date, normalizeTime(time));
    return JSON.stringify({ doctorName: doctor.name, date, time, ...result });
  },
  {
    name: "checkAvailability",
    description:
      "Check a doctor's availability on a date (and optionally a time). Returns real free slots. Only for ad-hoc questions; the current booking's availability is already in DATABASE FACTS.",
    schema: z.object({
      doctorName: z.string().describe("The full name of the doctor"),
      date: z.string().describe("The appointment date in YYYY-MM-DD format"),
      time: z.string().optional().describe("Optional time in HH:MM 24-hour format"),
    }),
  }
);