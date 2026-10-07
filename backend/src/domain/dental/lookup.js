// NEW FILE — doctor/treatment matching. DB is the authority; this only matches words.
import { Doctor } from "./models/Doctor.js";

let cache = { at: 0, doctors: [] };
export async function getDoctors() {
  if (Date.now() - cache.at > 60_000) {
    cache = { at: Date.now(), doctors: await Doctor.find().lean() };
  }
  return cache.doctors;
}

const NOISE = new Set([
  "treatment", "treatments", "procedure", "therapy", "specialist", "expert", "doctor", "dentist",
  "problem", "issue", "the", "a", "an", "for", "my", "i", "want", "need", "book", "appointment",
  "with", "of", "to", "please", "and", "in", "on", "is", "have", "get", "like", "would", "do",
]);
// spoken phrase -> words used in DB expertise (extend freely)
const SYNONYMS = [
  [/\brct\b/g, "root canal"],
  [/\b(check ?-?up|consultation|cleaning|scaling|filling|cavity|toothache|tooth pain)\b/g, "general dentistry"],
  [/\b(aligners?|clear aligners?)\b/g, "orthodontics"],
];
const stem = (w) => w.replace(/(ics|ic|s)$/, "");

export const tokens = (text) => {
  let t = String(text || "").toLowerCase().replace(/[^a-z\s]/g, " ");
  SYNONYMS.forEach(([re, to]) => { t = t.replace(re, to); });
  return t.split(/\s+/).filter((w) => w && !NOISE.has(w)).map(stem);
};

// does a free-text phrase refer to this expertise ("root canal treatment" ~ "Root Canal")
const phraseMatches = (phrase, expertise) => {
  const q = tokens(phrase);
  const e = tokens(expertise);
  if (!q.length || !e.length) return false;
  return e.every((t) => q.includes(t)) || q.every((t) => e.includes(t));
};

export const findDoctorsFor = (treatment, doctors) =>
  doctors.filter((d) => d.expertise.some((e) => phraseMatches(treatment, e)));

// canonical expertise name found inside a spoken sentence, or ""
export const matchExpertise = (text, doctors) => {
  for (const d of doctors) {
    for (const e of d.expertise) {
      const et = tokens(e);
      const q = tokens(text);
      if (et.length && et.every((t) => q.includes(t))) return e;
    }
  }
  return "";
};

// "dr neha", "neha kapoor", "doctor arjun" -> doctor (only if unambiguous)
export const matchDoctorName = (text, doctors) => {
  const words = new Set(String(text).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/));
  const hits = doctors.filter((d) =>
    d.name.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
      .some((p) => p.length >= 3 && p !== "doctor" && words.has(p)));
  return hits.length === 1 ? hits[0] : null;
};