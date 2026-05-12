import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="relative z-10 mx-auto max-w-2xl px-4 py-10 md:px-8 md:py-14">
      <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">About Lync</h1>
      <p className="mt-6 text-[var(--text-secondary)] leading-relaxed">
        Lync is a real-time two-way speech translator. Two people pick languages, speak into the mics, and hear
        translations spoken back—ideal for conversations across English, Tamil, Malayalam, and Hindi.
      </p>
      <p className="mt-4 text-[var(--text-secondary)] leading-relaxed">
        Speech is captured in your browser; translation runs on the server; playback uses high-quality neural voices.
        Sign in to sync recent lines and saved phrases across sessions.
      </p>
      <Link
        href="/"
        className="mt-10 inline-flex rounded-xl bg-[var(--hyper-violet)] px-6 py-3 text-sm font-semibold text-white shadow-[0_0_28px_var(--violet-glow)]"
      >
        Back to translator
      </Link>
    </main>
  );
}
