import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getDoctors, findDoctorsFor } from "../lookup.js";

export const searchDoctors = tool(
  async ({ expertise }) => {
    console.log("🔎 searchDoctors:", expertise);
    try {
      const doctors = findDoctorsFor(expertise, await getDoctors());
      console.log("👨‍⚕️ Doctors found:", doctors.length);
      if (!doctors.length) return JSON.stringify({ found: false, message: `No doctor found for ${expertise}.` });
      return JSON.stringify({
        found: true,
        doctors: doctors.map((d) => ({
          name: d.name, expertise: d.expertise, availableDays: d.availableDays, timings: d.timings,
        })),
      });
    } catch (error) {
      console.error("❌ searchDoctors error:", error);
      return JSON.stringify({ found: false, message: `Doctor search failed: ${error.message}` });
    }
  },
  {
    name: "searchDoctors",
    description:
      "Search dental doctors by treatment/expertise (natural phrases like 'root canal treatment' work). Only needed for ad-hoc questions; doctors for the caller's treatment are already in DATABASE FACTS.",
    schema: z.object({
      expertise: z.string().describe("The dental treatment or expertise the user needs"),
    }),
  }
);