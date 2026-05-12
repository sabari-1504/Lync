"use client";

import { AuthProvider } from "@/contexts/auth-context";
import { SiteChrome } from "@/components/SiteChrome";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SiteChrome>{children}</SiteChrome>
    </AuthProvider>
  );
}
