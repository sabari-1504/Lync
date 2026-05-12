"use client";

import {
  Bookmark,
  Clock3,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { speakerForLanguage } from "@/lib/voice-preference";

type LanguageCode = "en" | "ta" | "ml" | "hi";

type LanguageOption = {
  code: LanguageCode;
  name: string;
  speechCode: string;
};

type SpeakerKey = "A" | "B";
type HistoryEntry = {
  id: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  sourceText: string;
  translatedText: string;
  createdAt?: Timestamp;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
      length: number;
    };
    length: number;
  };
};

type BrowserWithSpeech = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "en", name: "English", speechCode: "en-US" },
  { code: "ta", name: "Tamil", speechCode: "ta-IN" },
  { code: "ml", name: "Malayalam", speechCode: "ml-IN" },
  { code: "hi", name: "Hindi", speechCode: "hi-IN" },
];

const languageByCode = LANGUAGE_OPTIONS.reduce<Record<LanguageCode, LanguageOption>>(
  (acc, option) => {
    acc[option.code] = option;
    return acc;
  },
  {} as Record<LanguageCode, LanguageOption>,
);

const SARVAM_LANG: Record<LanguageCode, string> = {
  en: "en-IN",
  ta: "ta-IN",
  ml: "ml-IN",
  hi: "hi-IN",
};

export default function Home() {
  const { user } = useAuth();
  const [speakerALanguage, setSpeakerALanguage] = useState<LanguageCode>("en");
  const [speakerBLanguage, setSpeakerBLanguage] = useState<LanguageCode>("hi");
  const [isListeningA, setIsListeningA] = useState(false);
  const [isListeningB, setIsListeningB] = useState(false);
  const [speakerATranscript, setSpeakerATranscript] = useState("");
  const [toSpeakerBText, setToSpeakerBText] = useState("");
  const [toSpeakerAText, setToSpeakerAText] = useState("");
  const [translationHistory, setTranslationHistory] = useState<HistoryEntry[]>([]);
  const [savedTranslations, setSavedTranslations] = useState<HistoryEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  const recognitionARef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionBRef = useRef<SpeechRecognitionLike | null>(null);
  const manualStopARef = useRef(false);
  const manualStopBRef = useRef(false);
  const isTranslatingARef = useRef(false);
  const isTranslatingBRef = useRef(false);
  const lastFinalARef = useRef("");
  const lastFinalBRef = useRef("");
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  const speechRecognitionCtor = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const speechWindow = window as BrowserWithSpeech;
    return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
  }, []);

  const clearError = () => setErrorMessage("");

  const saveToCollection = async (
    collectionName: "translationHistory" | "savedTranslations",
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
    sourceText: string,
    translatedText: string,
  ) => {
    if (!user || !db) return;
    await addDoc(collection(db, "users", user.uid, collectionName), {
      sourceLanguage,
      targetLanguage,
      sourceText,
      translatedText,
      createdAt: serverTimestamp(),
    });
  };

  const getBestVoiceForLanguage = (targetLanguage: LanguageCode): SpeechSynthesisVoice | null => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return null;
    }

    const voices = voicesRef.current;
    const opt = languageByCode[targetLanguage];
    const candidates = [
      opt.speechCode.toLowerCase().replace("_", "-"),
      `${targetLanguage.toLowerCase()}-in`,
      `${targetLanguage.toLowerCase()}_in`,
      targetLanguage.toLowerCase(),
    ];

    const normalize = (s: string) => s.toLowerCase().replace("_", "-");

    for (const want of candidates) {
      const exact = voices.find((v) => normalize(v.lang) === want);
      if (exact) return exact;
    }

    for (const want of candidates) {
      const prefix = want.split("-")[0];
      const byPrefix = voices.find(
        (v) =>
          normalize(v.lang).startsWith(prefix + "-") || normalize(v.lang) === prefix,
      );
      if (byPrefix) return byPrefix;
    }

    return null;
  };

  const speakWithCloudTts = async (text: string, targetLanguage: LanguageCode): Promise<boolean> => {
    const target_language_code = SARVAM_LANG[targetLanguage];
    const speaker = speakerForLanguage(target_language_code);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          target_language_code,
          speaker,
        }),
      });
      const data = (await res.json()) as { error?: string; audioBase64?: string };
      if (!res.ok) {
        throw new Error(data.error || "TTS request failed");
      }
      const b64 = data.audioBase64;
      if (!b64) return false;

      const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([binary], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Playback error"));
        };
        void audio.play().catch(reject);
      });
      return true;
    } catch {
      return false;
    }
  };

  const speakText = async (text: string, targetLanguage: LanguageCode) => {
    if (!text || typeof window === "undefined") {
      return;
    }

    const cloud = await speakWithCloudTts(text, targetLanguage);
    if (cloud) {
      return;
    }

    if (!("speechSynthesis" in window)) {
      setErrorMessage("Speech playback is not supported in this browser.");
      return;
    }

    const selectedVoice = getBestVoiceForLanguage(targetLanguage);

    if (!selectedVoice && targetLanguage !== "en") {
      setErrorMessage(
        `Cloud voice unavailable and no ${languageByCode[targetLanguage].name} system voice found. Check your connection or install a language pack.`,
      );
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = languageByCode[targetLanguage].speechCode;
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const translateText = async (
    text: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
  ) => {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        sourceLanguage,
        targetLanguage,
      }),
    });

    const rawBody = await response.text();
    let payload: { error?: string; translatedText?: string } = {};
    try {
      payload = rawBody ? (JSON.parse(rawBody) as { error?: string; translatedText?: string }) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const fallback = rawBody.startsWith("<!DOCTYPE")
        ? "Server returned HTML instead of JSON. Ensure Next.js is running in the realtime-translator folder."
        : "Translation failed";
      throw new Error(payload?.error || fallback);
    }

    return String(payload?.translatedText || "").trim();
  };

  const processFinalTranscript = async (
    fromSpeaker: SpeakerKey,
    finalText: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
  ) => {
    if (!finalText.trim()) {
      return;
    }

    if (fromSpeaker === "A") {
      if (isTranslatingARef.current || lastFinalARef.current === finalText.trim()) {
        return;
      }
      isTranslatingARef.current = true;
      lastFinalARef.current = finalText.trim();
    } else {
      if (isTranslatingBRef.current || lastFinalBRef.current === finalText.trim()) {
        return;
      }
      isTranslatingBRef.current = true;
      lastFinalBRef.current = finalText.trim();
    }

    try {
      clearError();
      const translated = await translateText(finalText, sourceLanguage, targetLanguage);

      if (fromSpeaker === "A") {
        setToSpeakerBText(translated);
        if (user) {
          await saveToCollection("translationHistory", sourceLanguage, targetLanguage, finalText, translated);
        }
      } else {
        setToSpeakerAText(translated);
        if (user) {
          await saveToCollection("translationHistory", sourceLanguage, targetLanguage, finalText, translated);
        }
      }

      await speakText(translated, targetLanguage);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown translation error");
    } finally {
      if (fromSpeaker === "A") {
        isTranslatingARef.current = false;
      } else {
        isTranslatingBRef.current = false;
      }
    }
  };

  const startListening = (speaker: SpeakerKey) => {
    if (!speechRecognitionCtor) {
      setErrorMessage("Speech recognition is not supported in this browser.");
      return;
    }

    clearError();
    const recognition = new speechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;

    if (speaker === "A") {
      manualStopARef.current = false;
      recognition.lang = languageByCode[speakerALanguage].speechCode;
      recognition.onresult = (event) => {
        let interimText = "";
        let finalText = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const chunk = event.results[i][0]?.transcript ?? "";
          if (event.results[i].isFinal) {
            finalText += chunk;
          } else {
            interimText += chunk;
          }
        }
        setSpeakerATranscript((finalText || interimText).trim());
        if (finalText.trim()) {
          void processFinalTranscript("A", finalText, speakerALanguage, speakerBLanguage);
        }
      };
      recognition.onerror = (event) => {
        setErrorMessage(`Speaker A recognition error: ${event.error}`);
      };
      recognition.onend = () => {
        if (!manualStopARef.current) {
          recognition.start();
          return;
        }
        setIsListeningA(false);
      };
      recognitionARef.current = recognition;
      recognition.start();
      setIsListeningA(true);
      return;
    }

    manualStopBRef.current = false;
    recognition.lang = languageByCode[speakerBLanguage].speechCode;
    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          finalText += chunk;
        }
      }
      if (finalText.trim()) {
        void processFinalTranscript("B", finalText, speakerBLanguage, speakerALanguage);
      }
    };
    recognition.onerror = (event) => {
      setErrorMessage(`Speaker B recognition error: ${event.error}`);
    };
    recognition.onend = () => {
      if (!manualStopBRef.current) {
        recognition.start();
        return;
      }
      setIsListeningB(false);
    };
    recognitionBRef.current = recognition;
    recognition.start();
    setIsListeningB(true);
  };

  const stopListening = (speaker: SpeakerKey) => {
    if (speaker === "A") {
      manualStopARef.current = true;
      recognitionARef.current?.stop();
      return;
    }
    manualStopBRef.current = true;
    recognitionBRef.current?.stop();
  };

  const playSpeakerAudio = async (text: string, targetLanguage: LanguageCode) => {
    await speakText(text, targetLanguage);
  };

  useEffect(() => {
    if (!user || !db) {
      return;
    }

    const historyQuery = query(
      collection(db, "users", user.uid, "translationHistory"),
      orderBy("createdAt", "desc"),
    );
    const savedQuery = query(
      collection(db, "users", user.uid, "savedTranslations"),
      orderBy("createdAt", "desc"),
    );

    const unSubHistory = onSnapshot(
      historyQuery,
      (snapshot) => {
        setTranslationHistory(
          snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<HistoryEntry, "id">) })),
        );
      },
      (error) => {
        setErrorMessage(
          `History access denied: ${error.message}. Update Firestore rules to allow users/${user.uid} access.`,
        );
      },
    );
    const unSubSaved = onSnapshot(
      savedQuery,
      (snapshot) => {
        setSavedTranslations(
          snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<HistoryEntry, "id">) })),
        );
      },
      (error) => {
        setErrorMessage(
          `Saved access denied: ${error.message}. Update Firestore rules to allow users/${user.uid} access.`,
        );
      },
    );

    return () => {
      unSubHistory();
      unSubSaved();
    };
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const populateVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };

    populateVoices();
    window.speechSynthesis.onvoiceschanged = populateVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      manualStopARef.current = true;
      manualStopBRef.current = true;
      recognitionARef.current?.stop();
      recognitionBRef.current?.stop();
    };
  }, []);

  const saveCurrentTranslation = async () => {
    if (!user) {
      setErrorMessage("Please sign in to save translations.");
      return;
    }
    if (!speakerATranscript.trim() || !toSpeakerBText.trim()) {
      setErrorMessage("No translation is available to save.");
      return;
    }

    try {
      clearError();
      await saveToCollection(
        "savedTranslations",
        speakerALanguage,
        speakerBLanguage,
        speakerATranscript.trim(),
        toSpeakerBText.trim(),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save translation.");
    }
  };

  const clearCurrentTranslation = () => {
    setSpeakerATranscript("");
    setToSpeakerBText("");
    setToSpeakerAText("");
    lastFinalARef.current = "";
    lastFinalBRef.current = "";
    clearError();
  };

  const micButton = (speaker: SpeakerKey) => {
    const listening = speaker === "A" ? isListeningA : isListeningB;
    return (
      <button
        type="button"
        onClick={() => {
          if (listening) {
            stopListening(speaker);
            return;
          }
          startListening(speaker);
        }}
        className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border transition ${
          listening
            ? "border-[var(--electric-cyan)] bg-[var(--cyan-muted)] shadow-[0_0_36px_rgba(0,245,255,0.5)] ring-2 ring-[var(--electric-cyan)]/35"
            : "border-[var(--border-subtle)] bg-[var(--bg-base)] hover:border-[var(--border-strong)]"
        }`}
        title={speaker === "A" ? "Microphone · Speaker A" : "Microphone · Speaker B"}
      >
        <Image
          src="/microphone.gif"
          alt="Microphone"
          width={36}
          height={36}
          unoptimized
          className={listening ? "" : "opacity-60 grayscale"}
        />
      </button>
    );
  };

  return (
    <main className="relative flex min-h-0 flex-col overflow-auto">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          background:
            "radial-gradient(ellipse 85% 55% at 50% -15%, rgba(0, 245, 255, 0.14), transparent), radial-gradient(ellipse 55% 45% at 100% 5%, rgba(112, 0, 255, 0.12), transparent)",
        }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-8 md:py-12">
        <header className="mb-10">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] md:text-4xl">
            Two-way speech bridge
          </h2>
          <p className="mt-2 max-w-xl text-sm text-[var(--text-secondary)]">
            Choose languages for each side, tap the mics, and listen to the translated line for the other person.
          </p>
        </header>

        <section className="rounded-[2rem] border border-[var(--border-subtle)] bg-[var(--bg-card)]/80 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md md:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
            {/* Speaker A */}
            <div className="order-1 flex min-h-0 flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-5 lg:min-h-[280px]">
              <div className="mb-4">
                <label className="mb-2 block font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                  Speaker A · hears translation below when B speaks
                </label>
                <select
                  className="w-full cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--electric-cyan)] disabled:opacity-60"
                  value={speakerALanguage}
                  onChange={(event) => setSpeakerALanguage(event.target.value as LanguageCode)}
                  disabled={isListeningA}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-h-[120px] flex-1 rounded-xl bg-[var(--bg-elevated)]/80 px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                  Said (A)
                </p>
                <p className="mt-2 min-h-[4rem] text-lg leading-relaxed text-[var(--text-primary)]">
                  {speakerATranscript || (
                    <span className="text-[var(--text-tertiary)]">Waiting for speech…</span>
                  )}
                </p>
              </div>
              <div className="mt-4 rounded-xl border border-[var(--border-violet-glow)] bg-[var(--violet-muted)] px-4 py-3 shadow-[inset_0_0_24px_rgba(112,0,255,0.06)]">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent-bright)]">
                  For speaker A · from B
                </p>
                <p className="mt-1 min-h-[3rem] text-base leading-relaxed text-[var(--text-primary)] [text-shadow:0_0_24px_rgba(112,0,255,0.15)]">
                  {toSpeakerAText || <span className="text-[var(--text-tertiary)]">—</span>}
                </p>
                <button
                  type="button"
                  onClick={() => void playSpeakerAudio(toSpeakerAText || speakerATranscript, speakerALanguage)}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--accent-bright)] transition hover:bg-[var(--bg-card)]"
                >
                  <Image src="/sound.gif" alt="Play" width={18} height={18} unoptimized />
                  Play for A
                </button>
              </div>
            </div>

            {/* Middle: mic buttons between the boxes */}
            <div className="order-2 flex flex-col items-center justify-center gap-5 lg:min-w-[6rem] lg:pt-16">
              <div className="flex flex-row items-center gap-6 lg:flex-col lg:gap-5">
                <div className="flex flex-col items-center gap-1.5">
                  {micButton("A")}
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    Mic A
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  {micButton("B")}
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    Mic B
                  </span>
                </div>
              </div>
            </div>

            {/* Speaker B */}
            <div className="order-3 flex min-h-0 flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-5 lg:min-h-[280px]">
              <div className="mb-4">
                <label className="mb-2 block font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                  Speaker B · hears translation below when A speaks
                </label>
                <select
                  className="w-full cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--electric-cyan)]"
                  value={speakerBLanguage}
                  onChange={(event) => setSpeakerBLanguage(event.target.value as LanguageCode)}
                  disabled={isListeningB}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex min-h-[120px] flex-1 flex-col rounded-xl border border-transparent bg-[var(--bg-elevated)]/80 px-4 py-3 ring-1 ring-[var(--border-violet-glow)]">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                  For speaker B · from A
                </p>
                <p className="mt-2 min-h-[4rem] flex-1 text-lg leading-relaxed text-[var(--text-primary)] [text-shadow:0_0_28px_rgba(112,0,255,0.18)]">
                  {toSpeakerBText || (
                    <span className="text-[var(--text-tertiary)]">Translation appears here…</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => void playSpeakerAudio(toSpeakerBText, speakerBLanguage)}
                  className="mt-auto inline-flex items-center gap-2 self-start rounded-lg px-2 py-1 text-xs font-semibold text-[var(--accent-bright)] transition hover:bg-[var(--bg-card)]"
                >
                  <Image src="/sound.gif" alt="Play" width={18} height={18} unoptimized />
                  Play for B
                </button>
              </div>
            </div>
          </div>

          {/* Save + Clear buttons – below speaker boxes */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void saveCurrentTranslation()}
              className="flex h-11 items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-6 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:shadow-[0_0_24px_var(--violet-glow)]"
              title="Save current translation"
            >
              <Bookmark size={16} aria-hidden />
              Save
            </button>
            <button
              type="button"
              onClick={clearCurrentTranslation}
              className="flex h-11 items-center gap-2 rounded-2xl border border-red-500/20 bg-[var(--bg-base)] px-6 text-sm font-semibold text-red-400 transition hover:border-red-500/40 hover:bg-red-500/5"
              title="Clear current translation"
            >
              <Trash2 size={16} aria-hidden />
              Clear
            </button>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-5">
              <div className="mb-3 flex items-center gap-2 text-[var(--text-secondary)]">
                <Clock3 size={18} className="text-[var(--accent)]" aria-hidden />
                <span className="text-sm font-semibold">Recent translations</span>
              </div>
              <div className="max-h-52 space-y-2 overflow-auto pr-1">
                {user && translationHistory.length ? (
                  translationHistory.slice(0, 12).map((item) => (
                    <p
                      key={item.id}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs leading-snug text-[var(--text-secondary)]"
                    >
                      <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                        {item.sourceLanguage.toUpperCase()} → {item.targetLanguage.toUpperCase()}
                      </span>
                      <br />
                      <span className="text-[var(--text-primary)]">{item.sourceText}</span>
                      <span className="text-[var(--text-tertiary)]"> · </span>
                      <span className="font-medium text-[var(--accent-bright)]">{item.translatedText}</span>
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-[var(--text-tertiary)]">
                    {user ? "No history yet." : "Sign in to sync history."}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-5">
              <div className="mb-3 flex items-center gap-2 text-[var(--text-secondary)]">
                <Bookmark size={18} className="text-[var(--cyan)]" aria-hidden />
                <span className="text-sm font-semibold">Saved</span>
              </div>
              <div className="max-h-52 space-y-2 overflow-auto pr-1">
                {user && savedTranslations.length ? (
                  savedTranslations.slice(0, 12).map((item) => (
                    <p
                      key={item.id}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs leading-snug text-[var(--text-secondary)]"
                    >
                      <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                        {item.sourceLanguage.toUpperCase()} → {item.targetLanguage.toUpperCase()}
                      </span>
                      <br />
                      <span className="text-[var(--text-primary)]">{item.sourceText}</span>
                      <span className="text-[var(--text-tertiary)]"> · </span>
                      <span className="font-medium text-[var(--accent-bright)]">{item.translatedText}</span>
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-[var(--text-tertiary)]">
                    {user ? "Nothing saved yet." : "Sign in to save phrases."}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-red-500/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-text)]"
          >
            {errorMessage}
          </div>
        ) : null}
      </div>
    </main>
  );
}
