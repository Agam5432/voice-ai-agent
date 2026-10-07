// NEW FILE — single source of truth for dates (IST), slots and availability.
// Used by checkAvailability, createBooking and the agent's DB prefetch.
import { Appointment } from "./models/Appointment.js";

const TZ = "Asia/Kolkata";
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const SLOT_MINUTES = 30;

// ---------- dates (always India time, never UTC) ----------
export const todayIST = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); // YYYY-MM-DD

export const nowTimeIST = () =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date()); // HH:MM

export const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const weekdayOf = (dateStr) =>
  DAY_NAMES[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];

export const isValidDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};

// "Wednesday, 7 October" — what the LLM should say out loud
export const speakDate = (dateStr, today = todayIST()) => {
  if (!dateStr) return "";
  if (dateStr === today) return "today";
  if (dateStr === addDays(today, 1)) return "tomorrow";
  const d = new Date(`${dateStr}T00:00:00Z`);
  const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${weekdayOf(dateStr)}, ${d.getUTCDate()} ${month}`;
};

// ---------- times ----------
export const normalizeTime = (value) => {
  if (!value) return "";
  const m = String(value).trim().toLowerCase()
    .match(/^(\d{1,2})(?::?(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!m) return "";
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.[0];
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

export const speakTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${ap}` : `${h12} ${ap}`;
};

const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

export const daySlots = (doctor) => {
  const out = [];
  for (let m = toMin(doctor.timings.start); m + SLOT_MINUTES <= toMin(doctor.timings.end); m += SLOT_MINUTES) {
    out.push(fromMin(m));
  }
  return out;
};

// ---------- booked slots (DB is the authority) ----------
const bookedByDate = async (doctorName, dates) => {
  const rows = await Appointment.find({
    doctorName, date: { $in: dates }, status: "booked",
  }).select("date time").lean();
  const map = new Map(dates.map((d) => [d, new Set()]));
  rows.forEach((r) => map.get(r.date)?.add(r.time));
  return map;
};

// Next working days with genuinely free slots (used when a request fails)
const upcomingFree = async (doctor, fromDate, limitDays = 2) => {
  const dates = Array.from({ length: 14 }, (_, i) => addDays(fromDate, i + 1))
    .filter((d) => doctor.availableDays.includes(weekdayOf(d)));
  const booked = await bookedByDate(doctor.name, dates);
  const out = [];
  for (const d of dates) {
    const free = daySlots(doctor).filter((s) => !booked.get(d).has(s));
    if (free.length) out.push({ date: d, slots: free.slice(0, 4) });
    if (out.length === limitDays) break;
  }
  return out;
};

/**
 * Authoritative availability check.
 * time omitted  -> returns the free slots for that day.
 * Always returns { available, problem?, reason?, freeSlots, suggestions? }
 * problem is "date" or "time" = which field the caller must change.
 */
export async function getAvailability(doctor, date, time = "") {
  const today = todayIST();
  if (!isValidDate(date)) return { available: false, problem: "date", reason: "That date is not valid.", freeSlots: [] };
  if (date < today) return { available: false, problem: "date", reason: "That date has already passed.", freeSlots: [] };

  const day = weekdayOf(date);
  if (!doctor.availableDays.includes(day)) {
    return {
      available: false, problem: "date", freeSlots: [],
      reason: `${doctor.name} does not work on ${day}s. Working days: ${doctor.availableDays.join(", ")}.`,
      suggestions: await upcomingFree(doctor, date),
    };
  }

  const booked = (await bookedByDate(doctor.name, [date])).get(date);
  const now = nowTimeIST();
  const slots = daySlots(doctor);
  const freeSlots = slots.filter((s) => !booked.has(s) && (date !== today || s > now));

  if (!freeSlots.length) {
    return {
      available: false, problem: "date", freeSlots: [],
      reason: `${doctor.name} has no free slots on ${day}.`,
      suggestions: await upcomingFree(doctor, date),
    };
  }
  if (!time) return { available: true, freeSlots };

  const t = normalizeTime(time);
  if (!slots.includes(t)) {
    return {
      available: false, problem: "time", freeSlots,
      reason: `Appointments are every ${SLOT_MINUTES} minutes between ${doctor.timings.start} and ${doctor.timings.end}.`,
    };
  }
  if (date === today && t <= now) {
    return { available: false, problem: "time", freeSlots, reason: "That time has already passed today." };
  }
  if (booked.has(t)) {
    return { available: false, problem: "time", freeSlots, reason: "That slot is already booked." };
  }
  return { available: true, freeSlots, date, time: t };
}