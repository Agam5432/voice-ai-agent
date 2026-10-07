import {
  todayIST,
  addDays,
  weekdayOf,
  isValidDate,
  normalizeTime,
  getAvailability,
} from "../domain/dental/scheduling.js";
import { Appointment } from "../domain/dental/models/Appointment.js";

import {
  getDoctors,
  findDoctorsFor,
  matchExpertise,
  matchDoctorName,
} from "../domain/dental/lookup.js";

// ----------------------------------------------------------------
// EMPTY BOOKING
// ----------------------------------------------------------------

export const EMPTY_BOOKING = {
  patientName: "",
  treatment: "",
  doctorName: "",
  date: "",
  time: "",

  // Email verification flow
  patientEmail: "",
  emailSpelling: "",
  emailConfirmed: false,
  emailNeedsSpelling: false,
  emailNeedsConfirmation: false,
  emailRejected: false,

  // Optional / legacy
  // Agent does NOT ask caller for WhatsApp number.
  whatsappNumber: "",

  confirmed: false,
  bookingId: "",
  detailsConfirmationPending: false, 
  // Legacy phone state
  phonePartial: "",

  // Voice-script compatibility
  lastScript: "",
  repeatCount: 0,
  // --------------------------------------------------------------
// CANCELLATION FLOW
// --------------------------------------------------------------

cancellationMode: false,
cancellationBookingId: "",
cancellationAppointment: null,
cancellationDetailsConfirmed: false,
cancellationReason: "",
cancellationFinalConfirmationPending: false,
cancellationConfirmed: false,
};


// ----------------------------------------------------------------
// REQUIRED BOOKING ORDER
// ----------------------------------------------------------------

const ORDER = [
  "patientName",
  "treatment",
  "doctorName",
  "date",
  "time",
  "patientEmail",
];

// ----------------------------------------------------------------
// DATE
// ----------------------------------------------------------------

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MON_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";

export function extractDate(text, today = todayIST()) {
  const t = text.toLowerCase();

  if (/\b(?:to)?day after tomorrow\b/.test(t)) {
    return addDays(today, 2);
  }

  if (/\btomorrow\b/.test(t)) {
    return addDays(today, 1);
  }

  if (/\btoday\b/.test(t)) {
    return today;
  }

  const year = Number(today.slice(0, 4));

  const build = (mIdx, day) => {
    let d = `${year}-${String(mIdx + 1).padStart(2, "0")}-${String(
      day,
    ).padStart(2, "0")}`;

    if (isValidDate(d) && d < today) {
      d = `${year + 1}-${d.slice(5)}`;
    }

    return isValidDate(d) ? d : "";
  };

  let m = t.match(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON_RE}\\b`),
  );

  if (m) {
    return build(MONTHS.indexOf(m[2]), Number(m[1]));
  }

  m = t.match(new RegExp(`\\b${MON_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));

  if (m) {
    return build(MONTHS.indexOf(m[1]), Number(m[2]));
  }

  m = t.match(
    /\b(?:(next|this|coming)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  );

  if (m) {
    const target = WEEKDAYS.indexOf(m[2]);

    const todayDow = WEEKDAYS.indexOf(weekdayOf(today).toLowerCase());

    let diff = (target - todayDow + 7) % 7;

    if (diff === 0 && m[1] === "next") {
      diff = 7;
    }

    return addDays(today, diff);
  }

  m = t.match(/\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/);

  if (m) {
    const day = Number(m[1]);

    let mIdx = Number(today.slice(5, 7)) - 1;

    if (day < Number(today.slice(8, 10))) {
      mIdx += 1;
    }

    const y = mIdx > 11 ? year + 1 : year;

    const d = `${y}-${String((mIdx % 12) + 1).padStart(2, "0")}-${String(
      day,
    ).padStart(2, "0")}`;

    return isValidDate(d) ? d : "";
  }

  return "";
}

// ----------------------------------------------------------------
// TIME
// ----------------------------------------------------------------

const WORD_NUM = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const WORDS = Object.keys(WORD_NUM).join("|");

const MIN_WORDS = {
  thirty: 30,
  fifteen: 15,
  "forty five": 45,
  "forty-five": 45,
};

const guessMeridiem = (h) => (h >= 1 && h <= 6 ? h + 12 : h);

export function extractTime(text, awaitingTime) {
  const t = text
    .toLowerCase()
    .replace(/a\.m\.?/g, "am")
    .replace(/p\.m\.?/g, "pm");

  const hm = (h, m = 0) => normalizeTime(`${h}:${String(m).padStart(2, "0")}`);

  let m;

  if (/\bnoon\b/.test(t)) {
    return "12:00";
  }

  m = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/);

  if (m) {
    return normalizeTime(`${m[1]}:${m[2] || "00"} ${m[3]}`);
  }

  m = t.match(
    new RegExp(
      `\\b(${WORDS})(?:\\s+(thirty|fifteen|forty[ -]five))?\\s*(am|pm)\\b`,
    ),
  );

  if (m) {
    return normalizeTime(
      `${WORD_NUM[m[1]]}:${MIN_WORDS[m[2]] || "00"} ${m[3]}`,
    );
  }

  m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);

  if (m) {
    return hm(Number(m[1]), Number(m[2]));
  }

  m = t.match(new RegExp(`\\b(\\d{1,2}|${WORDS})\\s*o'?\\s?clock\\b`));

  if (m) {
    return hm(guessMeridiem(WORD_NUM[m[1]] ?? Number(m[1])));
  }

  const bare =
    t.match(
      new RegExp(
        `(?:\\bat\\s+|^\\W*)(\\d{1,2}|${WORDS})(?:\\s+(thirty|fifteen|forty[ -]five))?\\W*$`,
      ),
    ) ||
    (awaitingTime &&
      t.match(
        new RegExp(
          `\\b(\\d{1,2}|${WORDS})(?:\\s+(thirty|fifteen|forty[ -]five))?\\b(?!\\s*(?:st|nd|rd|th))`,
        ),
      )) ||
    t.match(
      new RegExp(
        `\\bat\\s+(\\d{1,2}|${WORDS})(?:\\s+(thirty|fifteen|forty[ -]five))?\\b(?!\\s*(?:st|nd|rd|th))`,
      ),
    );

  if (bare && (awaitingTime || /\bat\s/.test(t))) {
    const h = WORD_NUM[bare[1]] ?? Number(bare[1]);

    if (h >= 1 && h <= 12) {
      return hm(guessMeridiem(h), MIN_WORDS[bare[2]] || 0);
    }
  }

  return "";
}

// ----------------------------------------------------------------
// PHONE
// ----------------------------------------------------------------

const DIGIT_WORDS = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

const PHONE_FILLER = new Set([
  "my",
  "number",
  "is",
  "its",
  "it's",
  "it",
  "whatsapp",
  "phone",
  "mobile",
  "no",
  "contact",
  "and",
  "uh",
  "um",
  "hmm",
  "so",
  "okay",
  "ok",
  "yeah",
  "yes",
  "sure",
  "the",
  "same",
  "plus",
  "country",
  "code",
  "double",
  "triple",
]);

export function extractDigits(text) {
  let out = "";
  let mult = 1;
  let strayWords = 0;

  for (const tok of text
    .toLowerCase()
    .replace(/[,.\-()+]/g, " ")
    .split(/\s+/)
    .filter(Boolean)) {
    if (/^\d+$/.test(tok)) {
      out += tok;
      mult = 1;
    } else if (tok in DIGIT_WORDS) {
      out += String(DIGIT_WORDS[tok]).repeat(mult);

      mult = 1;
    } else if (tok === "double") {
      mult = 2;
    } else if (tok === "triple") {
      mult = 3;
    } else if (!PHONE_FILLER.has(tok)) {
      strayWords++;
    }
  }

  return {
    digits: out,
    strayWords,
  };
}

export function extractPhone(text, prevPartial, awaitingPhone) {
  const { digits, strayWords } = extractDigits(text);

  if (!digits) {
    return {
      partial: prevPartial,
    };
  }

  if (!awaitingPhone && digits.length < 10) {
    return {
      partial: prevPartial,
    };
  }

  if (awaitingPhone && strayWords > 0 && digits.length < 10) {
    return {
      partial: prevPartial,
    };
  }

  let d = digits.length < 10 && prevPartial ? prevPartial + digits : digits;

  if (d.length === 11 && d.startsWith("0")) {
    d = d.slice(1);
  }

  if (d.length === 12 && d.startsWith("91")) {
    d = d.slice(2);
  }

  if (d.length === 10) {
    return /^[6-9]\d{9}$/.test(d)
      ? {
          phone: `+91${d}`,
          partial: "",
        }
      : {
          invalid: true,
          partial: "",
        };
  }

  if (d.length < 10) {
    return {
      partial: d,
    };
  }

  return {
    invalid: true,
    partial: "",
  };
}

// ----------------------------------------------------------------
// NAME
// ----------------------------------------------------------------

const NAME_STOP = new Set([
  "and",
  "i",
  "want",
  "need",
  "would",
  "like",
  "to",
  "for",
  "please",
  "but",
  "calling",
  "looking",
  "here",
  "so",
  "because",
  "from",
  "uh",
  "um",
  "hmm",
  "actually",
  "book",
  "booking",
  "appointment",
  "have",
  "got",
]);

const GREETING =
  /^(hello|hi|hey|namaste|namaskar|good (morning|afternoon|evening)|yes|yeah|no|okay|ok|sure|thanks?|thank you)\W*$/i;

const cleanName = (raw) => {
  const words = [];

  for (const token of raw.split(/\s+/)) {
    const w = token.replace(/[.,!?]+$/, "");

    if (NAME_STOP.has(w.toLowerCase()) || words.length === 3) {
      break;
    }

    if (/^[a-z][a-z'-]*$/i.test(w)) {
      words.push(w[0].toUpperCase() + w.slice(1).toLowerCase());
    }

    if (/[.,!?]$/.test(token)) {
      break;
    }
  }

  return words.join(" ");
};

// ----------------------------------------------------------------
// EXPLICIT NAME CORRECTION
// ----------------------------------------------------------------

export function extractCorrectedName(text) {
  const explicit = text.match(
    /\b(?:my\s+name\s+is|name\s+is|call\s+me|myself|mera\s+naam)\s+([a-z][a-z'.\s-]*)/i,
  );

  if (!explicit) {
    return "";
  }

  return cleanName(explicit[1]);
}

export function extractName(text, awaitingName, knownExpertiseHit) {
  const explicit = text.match(
    /\b(?:my name is|name is|call me|myself|mera naam)\s+([a-z][a-z'.\s-]*)/i,
  );

  if (explicit) {
    return cleanName(explicit[1]);
  }

  if (!awaitingName) {
    return "";
  }

  const loose = text.match(
    /\b(?:i am|i'm|this is|it's|it is)\s+([a-z][a-z'.\s-]*)/i,
  );

  if (loose) {
    return cleanName(loose[1]);
  }

  const t = text.replace(/[.,!?]/g, " ").trim();

  // small talk / requests are not names ("Hello, kaise ho?", "I need a doctor")
  const SMALL_TALK =
    /\b(hello|hi|hey|namaste|namaskar|kaise|kaisi|kya|aap|how are you|how's|good (morning|afternoon|evening)|thank|thanks|please|appointment|book|want|need|doctor|dentist|treatment|today|tomorrow)\b/i;

  if (knownExpertiseHit || GREETING.test(t) || SMALL_TALK.test(t) || /\d/.test(t)) {
    return "";
  }

  const words = t
    .split(/\s+/)
    .filter((w) => !/^(uh|um|hmm|so|well|okay|ok|yeah)$/i.test(w));

  return words.length >= 1 && words.length <= 3
    ? cleanName(words.join(" "))
    : "";
}

// ----------------------------------------------------------------
// EMAIL
// ----------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ----------------------------------------------------------------
// EMAIL CHARACTER WORDS
// ----------------------------------------------------------------

const EMAIL_CHAR_WORDS = {
  a: "a",
  b: "b",
  c: "c",
  d: "d",
  e: "e",
  f: "f",
  g: "g",
  h: "h",
  i: "i",
  j: "j",
  k: "k",
  l: "l",
  m: "m",
  n: "n",
  o: "o",
  p: "p",
  q: "q",
  r: "r",
  s: "s",
  t: "t",
  u: "u",
  v: "v",
  w: "w",
  x: "x",
  y: "y",
  z: "z",

  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

const EMAIL_FILLERS = new Set([
  "my",
  "email",
  "address",
  "is",
  "it's",
  "its",
  "the",
  "please",
  "okay",
  "ok",
  "yeah",
  "yes",
  "sure",
  "uh",
  "um",
  "hmm",
  "so",
  "spell",
  "it",
]);

const EMAIL_NUMBER_WORDS = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

const expandEmailToken = (token) => {
  if (EMAIL_CHAR_WORDS[token]) {
    return EMAIL_CHAR_WORDS[token];
  }

  if (EMAIL_NUMBER_WORDS[token]) {
    return EMAIL_NUMBER_WORDS[token];
  }

  return "";
};

// ----------------------------------------------------------------
// EMAIL SPELLING PARSER
// ----------------------------------------------------------------

export function extractEmailSpelling(text) {
  let t = text.toLowerCase().trim();

  // Remove introductory phrases.
  t = t.replace(
    /\b(?:my\s+)?email(?:\s+address)?\s+(?:is|it's|it\s+is)\b/gi,
    " ",
  );

  t = t.replace(/\bplease\s+spell(?:\s+it)?\b/gi, " ");

  t = t.replace(/\bspell(?:\s+it)?\b/gi, " ");

  // Symbols.
  t = t.replace(/@/g, " at ");

  t = t.replace(/\./g, " dot ");

  t = t.replace(/_/g, " underscore ");

  t = t.replace(/-/g, " hyphen ");

  t = t.replace(/\s+/g, " ").trim();

  const tokens = t.split(/\s+/);

  let local = "";
  let domain = "";

  let current = "local";

  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    // ----------------------------------------------------------
    // @ / AT
    // ----------------------------------------------------------

    if (token === "at") {
      current = "domain";

      i++;

      continue;
    }

    // ----------------------------------------------------------
    // DOT
    // ----------------------------------------------------------

    if (token === "dot" || token === "period") {
      if (current === "domain") {
        domain += ".";
      } else {
        local += ".";
      }

      i++;

      continue;
    }

    // ----------------------------------------------------------
    // UNDERSCORE
    // ----------------------------------------------------------

    if (token === "underscore") {
      if (current === "local") {
        local += "_";
      } else {
        domain += "_";
      }

      i++;

      continue;
    }

    // ----------------------------------------------------------
    // HYPHEN
    // ----------------------------------------------------------

    if (token === "hyphen" || token === "dash") {
      if (current === "local") {
        local += "-";
      } else {
        domain += "-";
      }

      i++;

      continue;
    }

    // ----------------------------------------------------------
    // DOUBLE
    // ----------------------------------------------------------

    if (token === "double" && tokens[i + 1]) {
      const next = tokens[i + 1];

      const value = expandEmailToken(next);

      if (value) {
        if (current === "local") {
          local += value.repeat(2);
        } else {
          domain += value.repeat(2);
        }

        i += 2;

        continue;
      }
    }

    // ----------------------------------------------------------
    // TRIPLE
    // ----------------------------------------------------------

    if (token === "triple" && tokens[i + 1]) {
      const next = tokens[i + 1];

      const value = expandEmailToken(next);

      if (value) {
        if (current === "local") {
          local += value.repeat(3);
        } else {
          domain += value.repeat(3);
        }

        i += 2;

        continue;
      }
    }

    // ----------------------------------------------------------
    // FILLERS
    // ----------------------------------------------------------

    if (EMAIL_FILLERS.has(token)) {
      i++;

      continue;
    }

    // ----------------------------------------------------------
    // COMPLETE EMAIL TOKEN
    // ----------------------------------------------------------

    if (/^[a-z0-9.-]+@[a-z0-9.-]+$/i.test(token)) {
      const parts = token.split("@");

      if (parts.length === 2) {
        local += parts[0];

        current = "domain";

        domain += parts[1];

        i++;

        continue;
      }
    }

    // ----------------------------------------------------------
    // DOMAIN TOKEN
    // ----------------------------------------------------------

    if (current === "domain" && /^[a-z0-9.-]+$/i.test(token)) {
      domain += token;

      i++;

      continue;
    }

    // ----------------------------------------------------------
    // CHARACTER / NUMBER
    // ----------------------------------------------------------

    const value = expandEmailToken(token);

    if (value) {
      if (current === "local") {
        local += value;
      } else {
        domain += value;
      }

      i++;

      continue;
    }

    // ----------------------------------------------------------
    // STT FILLERS
    // ----------------------------------------------------------

    if (/^(uh|um|hmm|well|so|okay|ok|yeah|yes|sure)$/i.test(token)) {
      i++;

      continue;
    }

    // ----------------------------------------------------------
    // NORMAL EMAIL-SAFE WORD
    // ----------------------------------------------------------

    if (/^[a-z0-9]+$/i.test(token)) {
      if (current === "local") {
        local += token;
      } else {
        domain += token;
      }
    }

    i++;
  }

  if (!local || !domain || !domain.includes(".")) {
    return "";
  }

  const email = `${local}@${domain}`
    .replace(/\.+/g, ".")
    .replace(/@+/g, "@")
    .toLowerCase();

  return EMAIL_RE.test(email) ? email : "";
}

// ----------------------------------------------------------------
// EMAIL EXTRACTION
// ----------------------------------------------------------------

export function extractEmail(text, awaitingEmail) {
  // ------------------------------------------------------------
  // NORMAL EMAIL
  // ------------------------------------------------------------

  const match = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);

  if (match) {
    const email = match[0].toLowerCase();

    return EMAIL_RE.test(email) ? email : "";
  }

  // ------------------------------------------------------------
  // IMPORTANT FIX:
  //
  // Email can be given OUT OF ORDER.
  //
  // Example:
  //
  // Agent: Which doctor?
  // User: Dr Arjun Singh. My email is ...
  //
  // We still capture the email.
  // ------------------------------------------------------------

  const obviousEmail =
    /\b(?:at|dot|period|gmail|yahoo|hotmail|outlook|icloud|email|underscore|hyphen)\b/i.test(
      text,
    ) || /@/.test(text);

  if (!awaitingEmail && !obviousEmail) {
    return "";
  }

  // ------------------------------------------------------------
  // IMPORTANT:
  //
  // Run spelling parser FIRST.
  //
  // Otherwise:
  //
  // "two double zero one"
  //
  // could become:
  //
  // "twodoublezeroone"
  //
  // through simple whitespace removal.
  // ------------------------------------------------------------

  const spelling = extractEmailSpelling(text);

  if (spelling) {
    return spelling;
  }

  // ------------------------------------------------------------
  // SIMPLE SPOKEN EMAIL
  // ------------------------------------------------------------

  const spoken = text
    .toLowerCase()
    .replace(/\s+at\s+/g, "@")
    .replace(/\s+(?:dot|period)\s+/g, ".")
    .replace(/\s+/g, "");

  if (EMAIL_RE.test(spoken)) {
    return spoken;
  }

  return "";
}

// ----------------------------------------------------------------
// EMAIL-LIKE TRANSCRIPT
// ----------------------------------------------------------------

const looksLikeEmailTranscript = (text) =>
  /\b(?:email|gmail|yahoo|hotmail|outlook|icloud|at|dot|period|underscore|hyphen)\b/i.test(
    text,
  ) || /@/.test(text);

// ----------------------------------------------------------------
// YES / NO
// ----------------------------------------------------------------

const AFFIRM =
  /\b(yes|yeah|yep|yup|sure|okay|ok|correct|right|confirm(ed)?|go ahead|please do|book it|that works|sounds good|perfect|absolutely|of course|definitely|fine)\b/i;

const NEGATE =
  /\b(no|nope|not|don't|do not|wait|hold on|cancel|change|different|instead|another|but|wrong|mistake)\b/i;

export const isAffirmative = (text) => AFFIRM.test(text) && !NEGATE.test(text);

const isNegative = (text) => NEGATE.test(text) && !isAffirmative(text);

// ----------------------------------------------------------------
// BOOKING ID
// ----------------------------------------------------------------

// ----------------------------------------------------------------
// BOOKING ID
// ----------------------------------------------------------------

const BOOKING_ID_DIGITS = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

export function extractBookingId(text) {
  const t = String(text || "")
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // --------------------------------------------------------------
  // NORMAL:
  // CD-482731
  // CD 482731
  // CD482731
  // --------------------------------------------------------------

  let match = t.match(/\bcd[\s-]?(\d{6})\b/i);

  if (match) {
    return `CD-${match[1]}`;
  }

  // --------------------------------------------------------------
  // VOICE:
  // C D 4 8 2 7 3 1
  // --------------------------------------------------------------

  match = t.match(
    /\bc\s+d(?:\s+|-)((?:\d\s*){6})\b/i
  );

  if (match) {
    const digits = match[1].replace(/\D/g, "");

    if (digits.length === 6) {
      return `CD-${digits}`;
    }
  }

  // --------------------------------------------------------------
  // VOICE WORDS:
  // C D four eight two seven three one
  // --------------------------------------------------------------

  const tokens = t.split(/\s+/);

  let foundCD = false;
  let digits = "";

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (!foundCD) {
      if (
        token === "cd" ||
        (token === "c" && tokens[i + 1] === "d")
      ) {
        foundCD = true;

        if (token === "c") {
          i++;
        }

        continue;
      }
    }

    if (foundCD) {
      // Numeric digit
      if (/^\d$/.test(token)) {
        digits += token;
        continue;
      }

      // Spoken digit
      if (BOOKING_ID_DIGITS[token] !== undefined) {
        digits += BOOKING_ID_DIGITS[token];
        continue;
      }

      // Stop if unrelated text starts
      if (digits.length > 0) {
        break;
      }
    }
  }

  if (digits.length === 6) {
    return `CD-${digits}`;
  }

  return "";
}
// ----------------------------------------------------------------
// NEXT MISSING FIELD
// ----------------------------------------------------------------

export const nextMissing = (b) => ORDER.find((field) => !b[field]) || "";

const isComplete = (b) => ORDER.every((field) => !!b[field]);

// ----------------------------------------------------------------
// CORE BOOKING CHECK
// ----------------------------------------------------------------

const hasCoreBookingDetails = (b) =>
  !!b.patientName && !!b.treatment && !!b.doctorName && !!b.date && !!b.time;

// ----------------------------------------------------------------
// MAIN ENTRY
// ----------------------------------------------------------------

export async function updateBooking(prev, transcript) {
  const today = todayIST();

  const doctors = await getDoctors();

  // --------------------------------------------------------------
  // FINISHED BOOKING
  // --------------------------------------------------------------

  // --------------------------------------------------------------
// CANCELLATION FLOW
// --------------------------------------------------------------

const cancellationRequested =
  /\b(cancel|cancellation|cancel my appointment|cancel my booking)\b/i.test(
    transcript
  );

if (
  cancellationRequested &&
  !prev.cancellationMode
) {
  return {
    booking: {
      ...prev,
      cancellationMode: true,
      cancellationBookingId: "",
      cancellationAppointment: null,
      cancellationDetailsConfirmed: false,
      cancellationReason: "",
      cancellationFinalConfirmationPending: false,
      cancellationConfirmed: false,
    },

    ctx: {
      today,
      cancellation: true,
      cancellationStep: "bookingId",
      notices: [],
      treatments: [...new Set(
        doctors.flatMap((d) => d.expertise)
      )],
    },
  };
}

  // --------------------------------------------------------------
  // ACTIVE CANCELLATION FLOW
  // --------------------------------------------------------------

  if (prev.cancellationMode) {
    const b = {
      ...prev,
    };

    const notices = [];

    // ------------------------------------------------------------
    // STEP 1: GET BOOKING ID
    // ------------------------------------------------------------

    if (!b.cancellationBookingId) {
      const bookingId = extractBookingId(transcript);

      if (!bookingId) {
        return {
          booking: b,
          ctx: {
            today,
            cancellation: true,
            cancellationStep: "bookingId",
            cancellationAppointment: null,
            notices: [],
            treatments: [...new Set(
              doctors.flatMap((d) => d.expertise)
            )],
          },
        };
      }

      const appointment = await Appointment.findOne({
        bookingId,
        status: "booked",
      }).lean();

      if (!appointment) {
        return {
          booking: b,
          ctx: {
            today,
            cancellation: true,
            cancellationStep: "bookingId",
            cancellationAppointment: null,
            notices: [
              `No active appointment was found with booking ID ${bookingId}.`,
            ],
            treatments: [...new Set(
              doctors.flatMap((d) => d.expertise)
            )],
          },
        };
      }

      b.cancellationBookingId = appointment.bookingId;
      b.cancellationAppointment = {
        bookingId: appointment.bookingId,
        patientName: appointment.patientName,
        patientEmail: appointment.patientEmail,
        doctorName: appointment.doctorName,
        treatment: appointment.treatment,
        date: appointment.date,
        time: appointment.time,
      };

      return {
        booking: b,
        ctx: {
          today,
          cancellation: true,
          cancellationStep: "detailsConfirmation",
          cancellationAppointment: b.cancellationAppointment,
          notices: [],
          treatments: [...new Set(
            doctors.flatMap((d) => d.expertise)
          )],
        },
      };
    }

    // ------------------------------------------------------------
    // STEP 2: CONFIRM APPOINTMENT DETAILS
    // ------------------------------------------------------------

    if (
      !b.cancellationDetailsConfirmed &&
      !b.cancellationFinalConfirmationPending
    ) {
      if (isAffirmative(transcript)) {
        b.cancellationDetailsConfirmed = true;

        return {
          booking: b,
          ctx: {
            today,
            cancellation: true,
            cancellationStep: "reason",
            cancellationAppointment: b.cancellationAppointment,
            notices: [],
            treatments: [...new Set(
              doctors.flatMap((d) => d.expertise)
            )],
          },
        };
      }

      if (isNegative(transcript)) {
        b.cancellationBookingId = "";
        b.cancellationAppointment = null;
        b.cancellationDetailsConfirmed = false;

        return {
          booking: b,
          ctx: {
            today,
            cancellation: true,
            cancellationStep: "bookingId",
            cancellationAppointment: null,
            notices: [
              "The caller said the appointment details are not correct.",
            ],
            treatments: [...new Set(
              doctors.flatMap((d) => d.expertise)
            )],
          },
        };
      }

      return {
        booking: b,
        ctx: {
          today,
          cancellation: true,
          cancellationStep: "detailsConfirmation",
          cancellationAppointment: b.cancellationAppointment,
          notices: [],
          treatments: [...new Set(
            doctors.flatMap((d) => d.expertise)
          )],
        },
      };
    }

    // ------------------------------------------------------------
    // STEP 3: GET CANCELLATION REASON
    // ------------------------------------------------------------

    if (
      b.cancellationDetailsConfirmed &&
      !b.cancellationReason &&
      !b.cancellationFinalConfirmationPending
    ) {
      const reason = transcript.trim();

      if (
        reason &&
        !isAffirmative(reason) &&
        !isNegative(reason)
      ) {
        b.cancellationReason = reason;
        b.cancellationFinalConfirmationPending = true;

        return {
          booking: b,
          ctx: {
            today,
            cancellation: true,
            cancellationStep: "finalConfirmation",
            cancellationAppointment: b.cancellationAppointment,
            notices: [],
            treatments: [...new Set(
              doctors.flatMap((d) => d.expertise)
            )],
          },
        };
      }

      return {
        booking: b,
        ctx: {
          today,
          cancellation: true,
          cancellationStep: "reason",
          cancellationAppointment: b.cancellationAppointment,
          notices: [],
          treatments: [...new Set(
            doctors.flatMap((d) => d.expertise)
          )],
        },
      };
    }

    // ------------------------------------------------------------
    // STEP 4: FINAL CONFIRMATION
    // ------------------------------------------------------------

    if (b.cancellationFinalConfirmationPending) {
      if (isAffirmative(transcript)) {
        b.cancellationConfirmed = true;

        return {
          booking: b,
          ctx: {
            today,
            cancellation: true,
            cancellationStep: "execute",
            cancellationAppointment: b.cancellationAppointment,
            notices: [],
            treatments: [...new Set(
              doctors.flatMap((d) => d.expertise)
            )],
          },
        };
      }

      if (isNegative(transcript)) {
        b.cancellationFinalConfirmationPending = false;
        b.cancellationReason = "";

        return {
          booking: b,
          ctx: {
            today,
            cancellation: true,
            cancellationStep: "reason",
            cancellationAppointment: b.cancellationAppointment,
            notices: [],
            treatments: [...new Set(
              doctors.flatMap((d) => d.expertise)
            )],
          },
        };
      }

      return {
        booking: b,
        ctx: {
          today,
          cancellation: true,
          cancellationStep: "finalConfirmation",
          cancellationAppointment: b.cancellationAppointment,
          notices: [],
          treatments: [...new Set(
            doctors.flatMap((d) => d.expertise)
          )],
        },
      };
    }
  }

  const base = prev.bookingId
    ? {
        ...EMPTY_BOOKING,

        // Keep caller name
        // for the next conversation.
        patientName: prev.patientName,
      }
    : {
        ...EMPTY_BOOKING,
        ...prev,
      };

  const b = {
    ...base,
  };

  const notices = [];

  const prevFacts = await computeFacts(base, doctors);

  // --------------------------------------------------------------
  // WAS BOOKING READY BEFORE THIS TURN?
  // --------------------------------------------------------------

  const wasReady =
    isComplete(base) &&
    base.emailConfirmed === true &&
    prevFacts.availability?.available === true &&
    !base.confirmed;

  const awaiting = nextMissing(base);

  const changed = [];

  const set = (field, value) => {
    if (value && value !== b[field]) {
      b[field] = value;

      changed.push(field);
    }
  };

  // --------------------------------------------------------------
  // TREATMENT
  // --------------------------------------------------------------

  const exp = matchExpertise(transcript, doctors);

  if (exp) {
    set("treatment", exp);
  } else if (
    awaiting === "treatment" &&
    !prev.bookingId &&
    !isAffirmative(transcript) &&
    !/^\W*(yes|no|okay|ok|hello|hi|thanks?|thank you|bye|goodbye|nothing)\b/i.test(
      transcript,
    )
  ) {
    const raw = transcript
      .replace(
        /\b(i|we)\s+(want|need|would like)\s+(to\s+)?(book\s+)?(an?\s+)?(appointment\s+)?(for|with)?\s*/i,
        "",
      )
      .replace(/[.,!?]/g, "")
      .trim();

    if (raw && raw.split(/\s+/).length <= 5) {
      set("treatment", raw);
    }
  }

  // --------------------------------------------------------------
  // DOCTOR
  // --------------------------------------------------------------

  const named = matchDoctorName(transcript, doctors);

  if (named) {
    set("doctorName", named.name);
  }

  // Treatment changed and old doctor
  // cannot handle it.
  if (
    changed.includes("treatment") &&
    b.doctorName &&
    !changed.includes("doctorName")
  ) {
    const d = doctors.find((x) => x.name === b.doctorName);

    if (d && !findDoctorsFor(b.treatment, [d]).length) {
      b.doctorName = "";
    }
  }

  // --------------------------------------------------------------
  // YES TO SINGLE DOCTOR
  // --------------------------------------------------------------

  if (awaiting === "doctorName" && !b.doctorName && isAffirmative(transcript)) {
    const opts = findDoctorsFor(b.treatment, doctors);

    if (opts.length === 1) {
      set("doctorName", opts[0].name);
    }
  }

  // --------------------------------------------------------------
  // DATE
  // --------------------------------------------------------------

  // IMPORTANT:
  // Date extraction is GLOBAL.
  // User can correct date at any time.

  set("date", extractDate(transcript, today));

  // --------------------------------------------------------------
  // TIME
  // --------------------------------------------------------------

  // IMPORTANT:
  // Time extraction is GLOBAL.
  // User can correct time at any time.

  set("time", extractTime(transcript, awaiting === "time"));

  // --------------------------------------------------------------
  // PATIENT NAME
  // --------------------------------------------------------------

  // IMPORTANT:
  // Explicit name corrections work
  // even if we are not currently asking for name.

  const correctedName = extractCorrectedName(transcript);

  if (correctedName) {
    set("patientName", correctedName);
  } else {
    set(
      "patientName",
      extractName(transcript, awaiting === "patientName", !!exp),
    );
  }

  // --------------------------------------------------------------
  // EMAIL VERIFICATION
  // --------------------------------------------------------------

  /*
   * IMPORTANT FLOW:
   *
   * Email may be provided BEFORE we ask for it.
   *
   * Example:
   *
   * User:
   * "Agam Tyagi two double zero one at gmail dot com"
   *
   * Even if awaiting === "doctorName",
   * we capture it.
   */

  // Gemini transcribes e-mail addresses accurately, so the old "spell it letter by
  // letter -> read back -> confirm" ping-pong is gone. We accept the e-mail as heard;
  // it is verified by the COMPLETE read-back before booking (caller says yes, or says
  // the correct e-mail and we replace it).
  const heardEmail = extractEmail(transcript, awaiting === "patientEmail");

  if (heardEmail && heardEmail !== b.patientEmail) {
    b.patientEmail = heardEmail;

    b.emailSpelling = "";
    b.emailConfirmed = true;
    b.emailNeedsSpelling = false;
    b.emailNeedsConfirmation = false;
    b.emailRejected = false;

    changed.push("patientEmail");
  }

  // --------------------------------------------------------------
  // BOOKING FIELD CHANGED
  // --------------------------------------------------------------

  const bookingFieldChanged = changed.some((field) => ORDER.includes(field));

  // Any booking change invalidates
  // previous final confirmation.

  b.confirmed = false;

  // --------------------------------------------------------------
  // FINAL CONFIRMATION
  // --------------------------------------------------------------

  /*
   * Final "YES" is accepted ONLY if:
   *
   * 1. Everything was already complete before this turn.
   * 2. Email was already verified.
   * 3. No booking field changed in this turn.
   * 4. Caller said yes.
   */

  if (
    wasReady &&
    !bookingFieldChanged &&
    b.emailConfirmed === true &&
    isAffirmative(transcript)
  ) {
    b.confirmed = true;
  }

  // --------------------------------------------------------------
  // AUTHORITATIVE DB FACTS
  // --------------------------------------------------------------

  const facts = await computeFacts(b, doctors);

  // --------------------------------------------------------------
  // INVALID / UNAVAILABLE SLOT
  // --------------------------------------------------------------

  if (
    facts.availability &&
    !facts.availability.available &&
    facts.availability.problem
  ) {
    notices.push(facts.availability.reason);

    b[facts.availability.problem] = "";

    b.confirmed = false;
  }

  // --------------------------------------------------------------
  // LOG
  // --------------------------------------------------------------

  console.log("🧾 Extracted:", {
    transcript,

    changed,

    awaiting,

    patientName: b.patientName,

    treatment: b.treatment,

    doctorName: b.doctorName,

    date: b.date,

    time: b.time,

    patientEmail: b.patientEmail,

    emailSpelling: b.emailSpelling,

    emailConfirmed: b.emailConfirmed,

    emailNeedsSpelling: b.emailNeedsSpelling,

    emailNeedsConfirmation: b.emailNeedsConfirmation,

    confirmed: b.confirmed,
  });

  return {
    booking: b,

    ctx: {
      today,

      notices,

      ...facts,

      treatments: [...new Set(doctors.flatMap((d) => d.expertise))],
    },
  };
}

// ----------------------------------------------------------------
// DATABASE FACTS
// ----------------------------------------------------------------

async function computeFacts(b, doctors) {
  const facts = {
    doctorOptions: [],
    availability: null,
  };

  // --------------------------------------------------------------
  // DOCTOR OPTIONS
  // --------------------------------------------------------------

  if (b.treatment && !b.doctorName) {
    facts.doctorOptions = findDoctorsFor(b.treatment, doctors);
  }

  // --------------------------------------------------------------
  // SELECTED DOCTOR
  // --------------------------------------------------------------

  const doctor = doctors.find((d) => d.name === b.doctorName);

  // --------------------------------------------------------------
  // AVAILABILITY
  // --------------------------------------------------------------

  if (doctor && b.date) {
    facts.availability = await getAvailability(doctor, b.date, b.time);
  }

  if (doctor) {
    facts.doctor = doctor;
  }

  return facts;
}