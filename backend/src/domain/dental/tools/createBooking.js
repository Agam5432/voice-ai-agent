import { tool } from "@langchain/core/tools";
import { z } from "zod";
import crypto from "crypto"
import { Doctor } from "../models/Doctor.js";
import { sendBookingEmail } from "../../../utils/sendBookingEmail.js";
import { Appointment } from "../models/Appointment.js";
import { normalizePhoneNumber } from "../../../utils/phone.js";
import { getAvailability, normalizeTime,} from "../scheduling.js";


const generateBookingId = () => {
  const number = crypto.randomInt(100000, 1000000);
  return `CD-${number}`;
};
const fail = (message, problem) =>
  JSON.stringify({
    success: false,
    message,
    problem,
  });

const esc = (s) =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ------------------------------------------------------------
// EMAIL NORMALIZATION
// ------------------------------------------------------------

const normalizeEmail = (email) => {
  if (!email) return email;

  return String(email)
    .trim()
    .replace(/[.,;:!?]+$/, "")
    .toLowerCase();
};

export const createBooking = tool(
  async ({
    patientName,
    doctorName,
    date,
    time,
    treatment,
    whatsappNumber,
    patientEmail,
  }) => {
    // ------------------------------------------------------------
    // BASIC VALIDATION
    // ------------------------------------------------------------

    if (!patientName?.trim()) {
      return fail(
        "Patient name is required.",
        "patientName"
      );
    }

    if (!treatment?.trim()) {
      return fail(
        "Treatment is required.",
        "treatment"
      );
    }

    if (!patientEmail?.trim()) {
      return fail(
        "Patient email is required for confirmation.",
        "patientEmail"
      );
    }

    // ------------------------------------------------------------
    // NORMALIZE EMAIL
    // ------------------------------------------------------------

    const email = normalizeEmail(patientEmail);

    console.log("📧 Raw email:", patientEmail);
    console.log("📧 Normalized email:", email);

    if (!z.string().email().safeParse(email).success) {
      return fail(
        "The email address is invalid. Please provide a valid email address.",
        "patientEmail"
      );
    }

    const t = normalizeTime(time);

    if (!t) {
      return fail(
        "A valid appointment time is required.",
        "time"
      );
    }

    // ------------------------------------------------------------
    // FIND DOCTOR
    // ------------------------------------------------------------

    const doctor =
      await Doctor.findOne({
        name: {
          $regex: new RegExp(
            `^${esc(doctorName)}$`,
            "i"
          ),
        },
      }).lean();

    if (!doctor) {
      return fail(
        `Doctor ${doctorName} was not found.`,
        "doctorName"
      );
    }

    // ------------------------------------------------------------
    // OPTIONAL WHATSAPP NUMBER
    // ------------------------------------------------------------

    const phone = whatsappNumber
      ? normalizePhoneNumber(
          whatsappNumber
        )
      : null;

    if (
      whatsappNumber &&
      !phone
    ) {
      return fail(
        "Invalid WhatsApp number.",
        "whatsappNumber"
      );
    }

    // ------------------------------------------------------------
    // FINAL AUTHORITATIVE AVAILABILITY CHECK
    // ------------------------------------------------------------

    const availability =
      await getAvailability(
        doctor,
        date,
        t
      );

    if (!availability.available) {
      return JSON.stringify({
        success: false,
        message:
          availability.reason,
        problem:
          availability.problem,
        freeSlots:
          availability.freeSlots,
      });
    }

    // ------------------------------------------------------------
    // CREATE APPOINTMENT
    // ------------------------------------------------------------

    try {
      const bookingId = generateBookingId();
      const appointment =
        await Appointment.create({
          bookingId,
          patientName:
            patientName.trim(),

          doctorName:
            doctor.name,

          treatment:
            treatment.trim(),

          patientEmail:
            email,

          date,

          time: t,

          // Optional only.
          // Agent does NOT ask caller for this.
          whatsappNumber: phone,

          status: "booked",
        });

      console.log(
        "✅ Appointment created:",
        appointment.bookingId
      );

      // ----------------------------------------------------------
      // SEND CONFIRMATION EMAIL
      // ----------------------------------------------------------

      const emailResult =
        await sendBookingEmail({
          bookingId:
          appointment.bookingId,
          patientEmail:
            appointment.patientEmail,

          patientName:
            appointment.patientName,

          doctorName:
            appointment.doctorName,

          treatment:
            appointment.treatment,

          date:
            appointment.date,

          time:
            appointment.time,

          whatsappNumber:
            appointment.whatsappNumber,
        });

      if (!emailResult.success) {
        console.log(
          "⚠️ Booking created, but email failed:",
          emailResult.message
        );
      } else {
        console.log(
          "📧 Appointment confirmation email sent."
        );
      }

      // ----------------------------------------------------------
      // SUCCESS RESPONSE
      // ----------------------------------------------------------

      return JSON.stringify({
        success: true,

        bookingId:
        appointment.bookingId,

        patientName:
          appointment.patientName,

        doctorName:
          appointment.doctorName,

        treatment:
          appointment.treatment,

        patientEmail:
          appointment.patientEmail,

        date:
          appointment.date,

        time:
          appointment.time,

        // Kept in response for backward compatibility.
        // Agent does not ask for it.
        whatsappNumber:
          appointment.whatsappNumber,

        status:
          appointment.status,

        emailSent:
          !!emailResult.success,

        message:
          emailResult.success
            ? "Appointment booked successfully and confirmation email sent."
            : "Appointment booked successfully, but confirmation email could not be sent.",
      });
    } catch (error) {
      // ----------------------------------------------------------
      // DUPLICATE BOOKING RACE CONDITION
      // ----------------------------------------------------------

      if (error?.code === 11000) {
        return fail(
          "This appointment slot is already booked.",
          "time"
        );
      }

      console.error(
        "❌ createBooking error:",
        error
      );

      throw error;
    }
  },
  {
    name: "createBooking",

    description:
      "Create a dental appointment. Called by the system only after the caller confirmed. Validates the doctor, working day, working hours, past time and already-booked slots. Patient email is required for confirmation. WhatsApp number is optional and is never requested by the agent.",

    schema: z.object({
      patientName: z
        .string()
        .describe(
          "Patient's full name"
        ),

      doctorName: z
        .string()
        .describe(
          "Doctor's name"
        ),

      treatment: z
        .string()
        .describe(
          "Dental treatment"
        ),

      date: z
        .string()
        .describe(
          "Appointment date in YYYY-MM-DD format"
        ),

      time: z
        .string()
        .describe(
          "Appointment time in HH:MM 24-hour format"
        ),

      // ----------------------------------------------------------
      // EMAIL
      // ----------------------------------------------------------
      // Remove accidental sentence punctuation before
      // validating the email.
      //
      // Example:
      // "agamtyagi2001@gmail.com."
      // becomes:
      // "agamtyagi2001@gmail.com"
      //
      patientEmail: z.preprocess(
        (value) => {
          if (typeof value !== "string") {
            return value;
          }

          return normalizeEmail(value);
        },
        z
          .string()
          .email()
          .describe(
            "Patient's email address for appointment confirmation"
          )
      ),

      // Optional. Agent does not ask caller for it.
      whatsappNumber: z
        .string()
        .optional()
        .describe(
          "Optional WhatsApp number if already available"
        ),
    }),
  }
);