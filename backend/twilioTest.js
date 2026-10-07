import "dotenv/config";
import twilio from "twilio";

const to = process.argv[2];

if (!to) {
  console.log("Usage: node twilioTest.js +91XXXXXXXXXX");
  process.exit(1);
}

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

try {
  console.log("📱 Sending WhatsApp message...");
  console.log("To:", `whatsapp:${to}`);
  console.log("From:", process.env.TWILIO_WHATSAPP_FROM);

  const message = await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${to}`,

    // Twilio Sandbox pre-approved Appointment Reminder template
    contentSid: "HXb5b62575e6e4ff6129ad7c8efe1f983e",

    contentVariables: JSON.stringify({
      "1": "29 October 2026",
      "2": "3:00 PM",
    }),
  });

  console.log("\n✅ MESSAGE SENT");
  console.log("SID:", message.sid);
  console.log("STATUS:", message.status);
} catch (error) {
  console.log("\n❌ ERROR");
  console.log("CODE:", error.code);
  console.log("MESSAGE:", error.message);
  console.log("MORE INFO:", error.moreInfo);
}