import "dotenv/config";
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const sendWhatsApp = async ({
  to,
  patientName,
  doctorName,
  treatment,
  date,
  time,
}) => {
  console.log("");
  console.log("========================================");
  console.log("📱 WhatsApp notification started");
  console.log("📱 To:", to);
  console.log("========================================");

  const message = await client.messages.create({
    body:
      `Hi ${patientName}, your dental appointment has been confirmed.\n\n` +
      `Doctor: ${doctorName}\n` +
      `Treatment: ${treatment}\n` +
      `Date: ${date}\n` +
      `Time: ${time}\n\n` +
      `Thank you for choosing our dental clinic.`,
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${to}`,
  });

  console.log("✅ WhatsApp message sent");
  console.log("📱 Message SID:", message.sid);

  return {
    success: true,
    messageSid: message.sid,
  };
};