// Friendly names for the ACE-Step language codes. Unknown codes fall back to
// the raw code, so this map can be partial without breaking the picker.
const LANGUAGE_NAMES = {
  ar: "Arabic", az: "Azerbaijani", bg: "Bulgarian", bn: "Bengali", ca: "Catalan",
  cs: "Czech", da: "Danish", de: "German", el: "Greek", en: "English",
  es: "Spanish", fa: "Persian", fi: "Finnish", fr: "French", he: "Hebrew",
  hi: "Hindi", hr: "Croatian", ht: "Haitian Creole", hu: "Hungarian", id: "Indonesian",
  is: "Icelandic", it: "Italian", ja: "Japanese", ko: "Korean", la: "Latin",
  lt: "Lithuanian", ms: "Malay", ne: "Nepali", nl: "Dutch", no: "Norwegian",
  pa: "Punjabi", pl: "Polish", pt: "Portuguese", ro: "Romanian", ru: "Russian",
  sa: "Sanskrit", sk: "Slovak", sr: "Serbian", sv: "Swedish", sw: "Swahili",
  ta: "Tamil", te: "Telugu", th: "Thai", tl: "Tagalog", tr: "Turkish",
  uk: "Ukrainian", ur: "Urdu", vi: "Vietnamese", yue: "Cantonese", zh: "Chinese",
  unknown: "Unknown / auto",
};

export const languageLabel = (code) =>
  LANGUAGE_NAMES[code] ? `${LANGUAGE_NAMES[code]} (${code})` : code;
