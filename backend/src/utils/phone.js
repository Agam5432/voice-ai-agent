const digitWords = {
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

const convertSpokenDigits = (value) => {
  const words = value
    .toLowerCase()
    .replace(/[,+()-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let result = "";
  let converted = false;

  for (const word of words) {
    if (digitWords[word] !== undefined) {
      result += digitWords[word];
      converted = true;
    }
  }

  return converted ? result : "";
};

export const normalizePhoneNumber = (value) => {
  if (!value) {
    return "";
  }

  let phone = String(value).trim();

  // Try spoken digits first.
  const spokenDigits = convertSpokenDigits(phone);

  if (spokenDigits) {
    phone = spokenDigits;
  } else {
    phone = phone
      .replace(/phone|mobile|number|no\.?/gi, "")
      .replace(/plus/gi, "+")
      .replace(/[\s\-().]/g, "")
      .replace(/[^\d+]/g, "");
  }

  // Indian 10-digit number
  if (/^\d{10}$/.test(phone)) {
    return `+91${phone}`;
  }

  // Indian number with country code
  if (/^91\d{10}$/.test(phone)) {
    return `+${phone}`;
  }

  // International number
  if (/^\+\d{10,15}$/.test(phone)) {
    return phone;
  }

  return "";
};