"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  SPEAKER_BY_LANG,
  type VoiceGender,
  getStoredVoiceGender,
  setStoredVoiceGender,
} from "@/lib/voice-preference";

export default function VoicePage() {
  const [gender, setGender] = useState<VoiceGender>("male");

  useEffect(() => {
    setGender(getStoredVoiceGender());
  }, []);

  const apply = (next: VoiceGender) => {
    setGender(next);
    setStoredVoiceGender(next);
  };

  return (
    <main className="relative z-10 mx-auto max-w-2xl px-4 py-10 md:px-8 md:py-14">
      <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Voice</h1>
      <p className="mt-4 text-[var(--text-secondary)] leading-relaxed">
        Spoken translations use cloud neural voices. Pick male or female; we map the best match for each language (see
        table below).
      </p>

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={() => apply("male")}
          className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
            gender === "male"
              ? "border-[var(--electric-cyan)] bg-[var(--cyan-muted)] text-[var(--electric-cyan)]"
              : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)]"
          }`}
        >
          Male voices
        </button>
        <button
          type="button"
          onClick={() => apply("female")}
          className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
            gender === "female"
              ? "border-[var(--hyper-violet)] bg-[var(--violet-muted)] text-[var(--accent-bright)]"
              : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)]"
          }`}
        >
          Female voices
        </button>
      </div>

      <div className="mt-10 overflow-x-auto rounded-2xl border border-[var(--border-subtle)]">
        <table className="w-full text-left text-sm text-[var(--text-secondary)]">
          <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
            <tr>
              <th className="px-4 py-3">Language</th>
              <th className="px-4 py-3">Speaker id</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(SPEAKER_BY_LANG).map(([code, pair]) => (
              <tr key={code} className="border-b border-[var(--border-subtle)] last:border-0">
                <td className="px-4 py-3 text-[var(--text-primary)]">{code}</td>
                <td className="px-4 py-3 font-mono text-xs">{gender === "male" ? pair.male : pair.female}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Link
        href="/"
        className="mt-10 inline-flex rounded-xl border border-[var(--border-subtle)] px-6 py-3 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--hyper-violet)]"
      >
        Back to translator
      </Link>
    </main>
  );
}
