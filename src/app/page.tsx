"use client";

import {
  ArrowUpDown,
  Bookmark,
  Clock3,
  LogOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

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

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(!isFirebaseConfigured);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
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
  const [speakerIconPulse, setSpeakerIconPulse] = useState(0);
  const [micAPulse, setMicAPulse] = useState(0);
  const [micBPulse, setMicBPulse] = useState(0);

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

  const getBestVoiceForLanguage = (targetLanguage: LanguageCode) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return null;
    }

    const voices = voicesRef.current;
    const fullLang = languageByCode[targetLanguage].speechCode.toLowerCase();
    const baseLang = targetLanguage.toLowerCase();

    return (
      voices.find((voice) => voice.lang.toLowerCase() === fullLang) ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith(fullLang.split("-")[0])) ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith(baseLang)) ||
      null
    );
  };

  const speakText = (text: string, targetLanguage: LanguageCode) => {
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const selectedVoice = getBestVoiceForLanguage(targetLanguage);

    if (!selectedVoice && targetLanguage !== "en") {
      setErrorMessage(
        `No ${languageByCode[targetLanguage].name} voice is installed in this browser/OS. Install that language TTS voice to hear translated audio.`,
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

      speakText(translated, targetLanguage);
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

  const playSpeakerAudio = (text: string, targetLanguage: LanguageCode) => {
    setSpeakerIconPulse((value) => value + 1);
    speakText(text, targetLanguage);
  };

  useEffect(() => {
    if (!auth) {
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

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

  const handleAuthSubmit = async () => {
    if (!auth) {
      setErrorMessage("Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* values in .env.local.");
      return;
    }
    if (!authEmail.trim() || !authPassword.trim()) {
      setErrorMessage("Email and password are required.");
      return;
    }

    setIsAuthLoading(true);
    clearError();
    try {
      if (isSignupMode) {
        await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      }
      setAuthPassword("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setIsAuthLoading(false);
    }
  };

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

  if (!isAuthReady) {
    return <div className="min-h-screen bg-[#f0f3f8] p-6 text-[#1d2a35]">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f0f3f8] px-3 py-6 text-[#1d2a35] md:px-6">
        <main className="mx-auto max-w-md rounded-[28px] border border-[#d7deea] bg-[#f8fbff] p-5 shadow-[0_15px_50px_rgba(20,65,110,0.08)]">
          <h1 className="text-xl font-semibold text-[#1d2a35]">
            {isSignupMode ? "Create account" : "Sign in"}
          </h1>
          {!isFirebaseConfigured ? (
            <p className="mt-2 rounded-xl bg-[#fff6db] px-3 py-2 text-xs text-[#6f5600]">
              Firebase is not configured yet. Fill all NEXT_PUBLIC_FIREBASE_* values in `.env.local`.
            </p>
          ) : null}
          <p className="mt-1 text-sm text-[#5a6f8a]">
            {isSignupMode ? "Sign up to save translation data." : "Sign in to access your data."}
          </p>
          <div className="mt-4 space-y-3">
            <input
              className="w-full rounded-xl border border-[#dce5f1] bg-white px-3 py-2 text-sm outline-none"
              placeholder="Email"
              type="email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
            />
            <input
              className="w-full rounded-xl border border-[#dce5f1] bg-white px-3 py-2 text-sm outline-none"
              placeholder="Password"
              type="password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={handleAuthSubmit}
            disabled={isAuthLoading || !isFirebaseConfigured}
            className="mt-4 w-full rounded-xl bg-[#0a84ff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
          >
            {isAuthLoading ? "Please wait..." : isSignupMode ? "Sign up" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => setIsSignupMode((value) => !value)}
            disabled={!isFirebaseConfigured}
            className="mt-3 text-sm text-[#1f4f7b]"
          >
            {isSignupMode ? "Already have an account? Sign in" : "No account? Sign up"}
          </button>
          {errorMessage ? (
            <p className="mt-4 rounded-xl bg-[#ffdfe3] px-3 py-2 text-sm text-[#8a2832]">{errorMessage}</p>
          ) : null}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f3f8] px-3 py-6 text-[#1d2a35] md:px-6">
      <main className="mx-auto max-w-6xl rounded-[28px] border border-[#d7deea] bg-[#f8fbff] p-4 shadow-[0_15px_50px_rgba(20,65,110,0.08)] md:p-6">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-[#0a84ff] px-2 py-1 text-sm font-bold text-white">L2</div>
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-[#4d6480]">LINGUA</p>
              <p className="text-xs font-semibold tracking-[0.2em] text-[#4d6480]">ULTRA</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (auth) {
                void signOut(auth);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[#dce5f1] bg-white px-3 py-1.5 text-sm text-[#385678]"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </header>

        <section className="grid gap-4">
          <div className="rounded-3xl border border-[#dce5f1] bg-[#ffffff] p-3 md:p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <div className="rounded-2xl border border-[#e3ebf4] bg-[#f8fbff] p-4">
                <select
                  className="rounded-md border-none bg-transparent text-sm font-semibold text-[#577495] outline-none"
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
                <p className="mt-2 min-h-16 text-lg">{speakerATranscript}</p>
                <button
                  type="button"
                  onClick={() => playSpeakerAudio(toSpeakerAText || speakerATranscript, speakerALanguage)}
                  className="mt-3 inline-flex items-center gap-1 text-sm text-[#5f7591]"
                >
                  <img
                    src={`/model/sound.gif?${speakerIconPulse}`}
                    alt="Play translation audio"
                    className="h-4 w-4 rounded-full object-cover"
                  />
                  Play
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const a = speakerALanguage;
                  setSpeakerALanguage(speakerBLanguage);
                  setSpeakerBLanguage(a);
                }}
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#0a84ff] text-white shadow-md"
              >
                <ArrowUpDown size={20} />
              </button>

              <div className="rounded-2xl border border-[#e3ebf4] bg-[#f8fbff] p-4">
                <select
                  className="rounded-md border-none bg-transparent text-sm font-semibold text-[#577495] outline-none"
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
                <p className="mt-2 min-h-16 text-lg">{toSpeakerBText}</p>
                <button
                  type="button"
                  onClick={() => playSpeakerAudio(toSpeakerBText, speakerBLanguage)}
                  className="mt-3 inline-flex items-center gap-1 text-sm text-[#5f7591]"
                >
                  <img
                    src={`/model/sound.gif?${speakerIconPulse}`}
                    alt="Play translation audio"
                    className="h-4 w-4 rounded-full object-cover"
                  />
                  Play
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setMicAPulse((value) => value + 1);
                  if (isListeningA) {
                    stopListening("A");
                    return;
                  }
                  startListening("A");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#cfdae8] bg-white text-[#1f4f7b]"
                title="Person A mic"
              >
                <img
                  src={`/model/microphone.gif?${isListeningA ? `live-${micAPulse}` : `tap-${micAPulse}`}`}
                  alt="Person A microphone"
                  className="h-5 w-5 rounded-full object-cover"
                />
              </button>
              <button
                type="button"
                onClick={() => speakText(toSpeakerBText, speakerBLanguage)}
                className="rounded-full bg-[#0a84ff] px-8 py-3 text-sm font-semibold tracking-wide text-white shadow-[0_8px_20px_rgba(10,132,255,0.35)]"
              >
                TRANSLATE
              </button>
              <button
                type="button"
                onClick={() => void saveCurrentTranslation()}
                className="flex h-10 items-center justify-center gap-2 rounded-full border border-[#cfdae8] bg-white px-4 text-[#1f4f7b]"
                title="Save translation"
              >
                <Bookmark size={16} />
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setMicBPulse((value) => value + 1);
                  if (isListeningB) {
                    stopListening("B");
                    return;
                  }
                  startListening("B");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#cfdae8] bg-white text-[#1f4f7b]"
                title="Person B mic"
              >
                <img
                  src={`/model/microphone.gif?${isListeningB ? `live-${micBPulse}` : `tap-${micBPulse}`}`}
                  alt="Person B microphone"
                  className="h-5 w-5 rounded-full object-cover"
                />
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-[#e2e9f2] bg-white p-3">
                <Clock3 className="text-[#0a84ff]" size={18} />
                <p className="mt-1 text-xs font-semibold text-[#385678]">Translation History</p>
                <div className="mt-2 max-h-44 space-y-2 overflow-auto">
                  {translationHistory.length ? (
                    translationHistory.slice(0, 10).map((item) => (
                      <p key={item.id} className="rounded-lg border border-[#e2e9f2] bg-[#f8fbff] p-2 text-xs text-[#5a6f8a]">
                        {item.sourceLanguage.toUpperCase()} -&gt; {item.targetLanguage.toUpperCase()} | {item.sourceText}
                        {" => "}
                        {item.translatedText}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-[#5a6f8a]">No history yet.</p>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-[#e2e9f2] bg-white p-3">
                <Bookmark className="text-[#0a84ff]" size={18} />
                <p className="mt-1 text-xs font-semibold text-[#385678]">Saved Translations</p>
                <div className="mt-2 max-h-44 space-y-2 overflow-auto">
                  {savedTranslations.length ? (
                    savedTranslations.slice(0, 10).map((item) => (
                      <p key={item.id} className="rounded-lg border border-[#e2e9f2] bg-[#f8fbff] p-2 text-xs text-[#5a6f8a]">
                        {item.sourceLanguage.toUpperCase()} -&gt; {item.targetLanguage.toUpperCase()} | {item.sourceText}
                        {" => "}
                        {item.translatedText}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-[#5a6f8a]">No saved translations yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {errorMessage ? (
          <p className="mt-4 rounded-xl bg-[#ffdfe3] px-3 py-2 text-sm text-[#8a2832]">{errorMessage}</p>
        ) : null}
      </main>
    </div>
  );
}
