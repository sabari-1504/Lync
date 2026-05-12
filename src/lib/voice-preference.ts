"use client";

export type VoiceGender = "male" | "female";

const STORAGE_KEY = "lync-voice-gender";

/** Recommended speakers per language and gender (cloud TTS). */
export const SPEAKER_BY_LANG: Record<
  string,
  { male: string; female: string }
> = {
  "en-IN": { male: "ratan", female: "ishita" },
  "hi-IN": { male: "shubh", female: "priya" },
  "ta-IN": { male: "ratan", female: "ishita" },
  "ml-IN": { male: "shubh", female: "pooja" },
};

export function getStoredVoiceGender(): VoiceGender {
  if (typeof window === "undefined") return "male";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "female" ? "female" : "male";
}

export function setStoredVoiceGender(gender: VoiceGender) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, gender);
}

export function speakerForLanguage(targetLanguageCode: string): string {
  const gender = getStoredVoiceGender();
  const pair = SPEAKER_BY_LANG[targetLanguageCode] ?? SPEAKER_BY_LANG["hi-IN"];
  return gender === "female" ? pair.female : pair.male;
}
