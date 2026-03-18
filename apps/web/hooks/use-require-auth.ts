"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

/**
 * Client-side auth guard hook.
 * Redirects to /login if user is not authenticated after hydration.
 */
export function useRequireAuth() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isHydrated, isAuthenticated, router]);

  return {
    user,
    isLoading: !isHydrated || isLoading,
    isAuthenticated,
  };
}
