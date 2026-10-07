import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { sendCancellationEmail } from "../../../utils/cancelBookingEmail.js";
import { Appointment } from "../models/Appointment.js";
import { Cancellation } from "../models/Cancellation.js";

export const cancelBooking = tool(
  async ({
    bookingId,
    reason,
  }) => {
    // ------------------------------------------------------------
    // FIND APPOINTMENT BY BOOKING ID
    // ------------------------------------------------------------

    const appointment =
      await Appointment.findOne({
        bookingId: bookingId.trim().toUpperCase(),
        status: "booked",
      });

    if (!appointment) {
      return JSON.stringify({
        success: false,
        message:
          "No active booked appointment was found with this booking ID.",
      });
    }

    // ------------------------------------------------------------
    // SAVE CANCELLATION RECORD
    // ------------------------------------------------------------

    const cancellation =
      await Cancellation.create({
        bookingId:
          appointment.bookingId,

        patientName:
          appointment.patientName,

        patientEmail:
          appointment.patientEmail,

        doctorName:
          appointment.doctorName,

        treatment:
          appointment.treatment,

        date:
          appointment.date,

        time:
          appointment.time,

        reason:
          reason.trim(),
      });

    // ------------------------------------------------------------
    // CANCEL APPOINTMENT
    // ------------------------------------------------------------

    appointment.status = "cancelled";

    await appointment.save();

    // ------------------------------------------------------------
    // SEND CANCELLATION EMAIL
    // ------------------------------------------------------------

    const emailResult =
      await sendCancellationEmail({
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

        reason:
          reason.trim(),
      });

    // ------------------------------------------------------------
    // SUCCESS RESPONSE
    // ------------------------------------------------------------

    return JSON.stringify({
      success: true,

      message:
        "Appointment cancelled successfully.",

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

      reason:
        reason.trim(),

      status:
        appointment.status,

      cancellationId:
        cancellation._id.toString(),

      emailSent:
        emailResult.success,

      emailMessage:
        emailResult.message || null,
    });
  },

  {
    name: "cancelBooking",

    description:
      "Cancel an existing booked dental appointment using its unique booking ID. Call this tool ONLY after the patient has confirmed the appointment details and has given the cancellation reason and final confirmation to cancel. Find the appointment by booking ID, save a separate cancellation record with the reason, mark the appointment as cancelled, and send a cancellation email.",

    schema: z.object({
      bookingId: z
        .string()
        .describe(
          "The unique booking ID provided to the patient, for example CD-482731"
        ),

      reason: z
        .string()
        .describe(
          "The patient's reason for cancelling the appointment"
        ),
    }),
  }
);