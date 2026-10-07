import mongoose from "mongoose";

const cancellationSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true,
    index: true,
  },

  patientName: {
    type: String,
    required: true,
  },

  patientEmail: {
    type: String,
    required: true,
  },

  doctorName: {
    type: String,
    required: true,
  },

  treatment: {
    type: String,
    required: true,
  },

  date: {
    type: String,
    required: true,
  },

  time: {
    type: String,
    required: true,
  },

  reason: {
    type: String,
    required: true,
  },

  cancelledAt: {
    type: Date,
    default: Date.now,
  },
});

export const Cancellation = mongoose.model(
  "Cancellation",
  cancellationSchema
);