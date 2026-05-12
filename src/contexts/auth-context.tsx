"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

type AuthContextValue = {
  user: User | null;
  profileName: string | null;
  ready: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profileName: null,
  ready: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [ready, setReady] = useState(!isFirebaseConfigured);

  useEffect(() => {
    if (!auth) {
      setReady(true);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser && db) {
        try {
          const snap = await getDoc(doc(db, "users", nextUser.uid));
          const data = snap.data();
          const name =
            (typeof data?.displayName === "string" && data.displayName.trim()) ||
            nextUser.displayName?.trim() ||
            null;
          setProfileName(name);
        } catch {
          setProfileName(nextUser.displayName?.trim() ?? null);
        }
      } else {
        setProfileName(null);
      }
      setReady(true);
    });

    return () => unsub();
  }, []);

  const value = useMemo(
    () => ({
      user,
      profileName,
      ready,
    }),
    [user, profileName, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
