import mongoose from "mongoose";

const doctorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },

  expertise: {
    type: [String],
    required: true,
  },

  availableDays: {
    type: [String],
    default: [],
  },

  timings: {
    start: String,
    end: String,
  },
});

export const Doctor = mongoose.model("Doctor", doctorSchema);