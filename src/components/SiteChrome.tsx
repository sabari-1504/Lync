"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  Home,
  Info,
  LogOut,
  Menu,
  UserRound,
  Volume2,
  X,
} from "lucide-react";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, profileName, ready } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!accountOpen) return;
    const close = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [accountOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const navLinkClass = (href: string) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-[var(--bg-elevated)] ${
      pathname === href ? "text-[var(--electric-cyan)]" : "text-[var(--text-secondary)]"
    }`;

  const handleSignUp = async () => {
    if (!auth || !db) {
      setAuthError("Firebase is not configured.");
      return;
    }
    if (!authName.trim() || !authEmail.trim() || !authPassword.trim()) {
      setAuthError("Name, email, and password are required.");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      await updateProfile(cred.user, { displayName: authName.trim() });
      await setDoc(
        doc(db, "users", cred.user.uid),
        {
          displayName: authName.trim(),
          email: authEmail.trim(),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
      setAuthPassword("");
      setAuthName("");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Sign up failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!auth) {
      setAuthError("Firebase is not configured.");
      return;
    }
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError("Email and password are required.");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      setAuthPassword("");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const showGate = ready && !user && isFirebaseConfigured;
  const displayName = profileName || user?.displayName || user?.email?.split("@")[0];

  return (
    <div className="relative min-h-screen min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-[60] border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:gap-6 md:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-8">
            <Link href="/" className="flex min-w-0 items-center">
              <Image
                src="/sync-logo.png"
                alt="Sync"
                width={140}
                height={40}
                className="h-9 w-auto md:h-10"
                priority
              />
            </Link>

            <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
              <Link href="/" className={navLinkClass("/")}>
                <span className="inline-flex items-center gap-1.5">
                  <Home size={16} aria-hidden />
                  Home
                </span>
              </Link>
              <Link href="/about" className={navLinkClass("/about")}>
                <span className="inline-flex items-center gap-1.5">
                  <Info size={16} aria-hidden />
                  About
                </span>
              </Link>
              <Link href="/voice" className={navLinkClass("/voice")}>
                <span className="inline-flex items-center gap-1.5">
                  <Volume2 size={16} aria-hidden />
                  Voice
                </span>
              </Link>
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2 md:gap-4">
            {user ? (
              <span className="hidden max-w-[10rem] truncate text-sm font-medium text-[var(--text-secondary)] sm:inline md:max-w-xs">
                {displayName}
              </span>
            ) : null}

            <button
              type="button"
              className="rounded-xl border border-[var(--border-subtle)] p-2 text-[var(--text-secondary)] md:hidden"
              aria-expanded={mobileOpen}
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={22} />
            </button>

            {user ? (
              <div ref={accountRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAccountOpen((o) => !o)}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border transition md:h-11 md:w-11 ${
                    accountOpen
                      ? "border-[var(--electric-cyan)] bg-[var(--cyan-muted)] text-[var(--electric-cyan)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-violet-glow)]"
                  }`}
                  aria-expanded={accountOpen}
                  aria-label="Account"
                >
                  <UserRound size={20} />
                </button>
                {accountOpen ? (
                  <div className="absolute right-0 top-12 z-[70] w-56 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-3 shadow-xl">
                    <p className="truncate px-2 py-1 text-xs text-[var(--text-tertiary)]">{user.email}</p>
                    <button
                      type="button"
                      className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                      onClick={() => {
                        if (auth) void signOut(auth);
                        setAccountOpen(false);
                      }}
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[80] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#0a0a0f]/75 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <nav
            className="absolute right-0 top-0 flex h-full w-[min(85vw,18rem)] flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-2xl"
            aria-label="Mobile main"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="text-lg font-bold tracking-tight">Menu</span>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                aria-label="Close"
                onClick={() => setMobileOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            {user ? (
              <div className="mb-5 flex items-center gap-3 rounded-xl bg-[var(--bg-elevated)] px-3 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--hyper-violet)]/20 text-[var(--accent-bright)]">
                  <UserRound size={16} />
                </div>
                <p className="truncate text-sm font-medium text-[var(--text-secondary)]">
                  {displayName}
                </p>
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <Link href="/" className={navLinkClass("/")} onClick={() => setMobileOpen(false)}>
                <span className="inline-flex items-center gap-3">
                  <Home size={18} aria-hidden />
                  Home
                </span>
              </Link>
              <Link href="/about" className={navLinkClass("/about")} onClick={() => setMobileOpen(false)}>
                <span className="inline-flex items-center gap-3">
                  <Info size={18} aria-hidden />
                  About
                </span>
              </Link>
              <Link href="/voice" className={navLinkClass("/voice")} onClick={() => setMobileOpen(false)}>
                <span className="inline-flex items-center gap-3">
                  <Volume2 size={18} aria-hidden />
                  Voice
                </span>
              </Link>
            </div>

            <div className="mt-auto border-t border-[var(--border-subtle)] pt-4">
              <p className="text-center font-mono text-[10px] tracking-wider text-[var(--text-tertiary)]">
                © {new Date().getFullYear()} Sync. All rights reserved.
              </p>
            </div>
          </nav>
        </div>
      ) : null}

      <div
        className={
          showGate
            ? "pointer-events-none min-h-[calc(100dvh-3.5rem)] blur-xl brightness-75 saturate-50 transition-[filter]"
            : ""
        }
        aria-hidden={showGate}
      >
        {children}
      </div>

      {showGate ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0a0a0f]/55 p-4 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gate-title"
            className="w-full max-w-md rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)]"
          >
            <h2 id="gate-title" className="text-lg font-bold text-[var(--text-primary)]">
              Welcome to Sync
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Sign in or create an account to use the translator.
            </p>

            {!isFirebaseConfigured ? (
              <p className="mt-4 rounded-xl bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger-text)]">
                Configure Firebase env vars in <span className="font-mono">.env.local</span>.
              </p>
            ) : (
              <>
                <div className="mt-6 flex rounded-xl bg-[var(--bg-base)] p-1">
                  <button
                    type="button"
                    className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                      authTab === "signin"
                        ? "bg-[var(--hyper-violet)] text-white shadow-[0_0_20px_var(--violet-glow)]"
                        : "text-[var(--text-tertiary)]"
                    }`}
                    onClick={() => {
                      setAuthTab("signin");
                      setAuthError("");
                    }}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                      authTab === "signup"
                        ? "bg-[var(--hyper-violet)] text-white shadow-[0_0_20px_var(--violet-glow)]"
                        : "text-[var(--text-tertiary)]"
                    }`}
                    onClick={() => {
                      setAuthTab("signup");
                      setAuthError("");
                    }}
                  >
                    Sign up
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {authTab === "signup" ? (
                    <input
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5 text-sm outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--electric-cyan)]"
                      placeholder="Full name"
                      autoComplete="name"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                    />
                  ) : null}
                  <input
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5 text-sm outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--electric-cyan)]"
                    placeholder="Email"
                    type="email"
                    autoComplete="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                  <input
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5 text-sm outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--electric-cyan)]"
                    placeholder="Password"
                    type="password"
                    autoComplete={authTab === "signup" ? "new-password" : "current-password"}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />
                </div>

                {authError ? (
                  <p className="mt-3 text-sm text-[var(--danger-text)]">{authError}</p>
                ) : null}

                <button
                  type="button"
                  disabled={authLoading}
                  className="mt-6 w-full rounded-xl bg-[var(--hyper-violet)] py-3 text-sm font-semibold text-white shadow-[0_0_28px_var(--violet-glow)] disabled:opacity-50"
                  onClick={() => void (authTab === "signup" ? handleSignUp() : handleSignIn())}
                >
                  {authLoading ? "Please wait…" : authTab === "signup" ? "Create account" : "Sign in"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
