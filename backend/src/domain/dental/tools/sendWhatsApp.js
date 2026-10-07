import { tool } from "@langchain/core/tools";
import { z } from "zod";
import twilio from "twilio";

import { Appointment } from "../models/Appointment.js";

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const sendWhatsApp = tool(
  async ({ bookingId }) => {
    console.log("");
    console.log("========================================");
    console.log("📱 sendWhatsApp TOOL EXECUTED");
    console.log("📱 Booking ID:", bookingId);
    console.log("========================================");

    try {
      const appointment = await Appointment.findOne({
        _id: bookingId,
        status: "booked",
      });

      if (!appointment) {
        console.log(
          "❌ WhatsApp blocked: valid booked appointment not found"
        );

        return JSON.stringify({
          success: false,
          message:
            "WhatsApp confirmation was not sent because the booking was not found or is not currently booked.",
        });
      }

      console.log("✅ Confirmed booking found");
      console.log("👤 Patient:", appointment.patientName);
      console.log("👨‍⚕️ Doctor:", appointment.doctorName);
      console.log("🦷 Treatment:", appointment.treatment);
      console.log("📅 Date:", appointment.date);
      console.log("⏰ Time:", appointment.time);
      console.log("📱 WhatsApp:", appointment.whatsappNumber);

      const to = `whatsapp:${appointment.whatsappNumber}`;
      const from = process.env.TWILIO_WHATSAPP_FROM;
      let message;
      try {
        // free-form text: works in the sandbox only if the patient messaged the sandbox in the last 24h
        message = await twilioClient.messages.create({
          from, to,
          body:
            `Hi ${appointment.patientName}, your dental appointment has been confirmed.\n\n` +
            `Doctor: ${appointment.doctorName}\n` +
            `Treatment: ${appointment.treatment}\n` +
            `Date: ${appointment.date}\n` +
            `Time: ${appointment.time}\n` +
            `Booking ID: ${appointment._id}\n\n` +
            `Thank you for choosing our dental clinic.`,
        });
      } catch (error) {
        // 21654 "ContentSid Required" / 63016 = outside the 24h window -> must use a approved template
        if (![21654, 63016].includes(error.code)) throw error;
        console.log("↩️ Free-form blocked, retrying with content template");
        message = await twilioClient.messages.create({
          from, to,
          // default = Twilio sandbox sample "Your appointment is coming up on {{1}} at {{2}}"
          contentSid: process.env.TWILIO_WHATSAPP_CONTENT_SID || "HXb5b62575e6e4ff6129ad7c8efe1f983e",
          contentVariables: JSON.stringify({ 1: appointment.date, 2: appointment.time }),
        });
      }

      console.log("✅ WhatsApp sent successfully");
      console.log("📱 Message SID:", message.sid);

      return JSON.stringify({
        success: true,
        messageSid: message.sid,
        bookingId: appointment._id.toString(),
        message: "WhatsApp confirmation sent successfully.",
      });
    } catch (error) {
      console.error("❌ WhatsApp error:", error);

      return JSON.stringify({
        success: false,
        bookingId,
        message: `WhatsApp notification failed: ${error.message}`,
      });
    }
  },
  {
    name: "sendWhatsApp",

    description: `
Send a WhatsApp confirmation for an existing dental appointment.

IMPORTANT:
- Use this tool only after createBooking has successfully created an appointment.
- bookingId must come from a successful createBooking result.
- Verify the booking in the database before sending the message.
- Never invent patient, doctor, treatment, date, time, or WhatsApp number.
- Get all booking information from the database using bookingId.
- Never send a booking confirmation for a cancelled or nonexistent appointment.
`,

    schema: z.object({
      bookingId: z
        .string()
        .describe(
          "The booking ID returned by a successful createBooking tool call"
        ),
    }),
  }
);