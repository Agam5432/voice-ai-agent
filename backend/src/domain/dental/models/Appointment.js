import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema({
    bookingId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },

  patientName: {
    type: String,
    required: true,
  },

  patientEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
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

  whatsappNumber: {
    type: String,
    required: false,
  },

  status: {
    type: String,
    enum: ["booked", "cancelled", "completed"],
    default: "booked",
  },
});

appointmentSchema.index(
  { doctorName: 1, date: 1, time: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "booked",
    },
  }
);

export const Appointment = mongoose.model(
  "Appointment",
  appointmentSchema
);