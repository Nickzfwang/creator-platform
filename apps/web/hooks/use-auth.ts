"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import type { User } from "@/lib/auth-store";

export function useLogin() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      await login(data.email, data.password);
    },
    onSuccess: () => {
      router.push("/");
    },
  });
}

export function useRegister() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);

  return useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      displayName: string;
    }) => {
      await register(data.email, data.password, data.displayName);
    },
    onSuccess: () => {
      router.push("/");
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  return useMutation({
    mutationFn: async () => {
      await logout();
    },
    onSuccess: () => {
      router.push("/login");
    },
  });
}

export function useUpdateProfile() {
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: async (data: {
      displayName?: string;
      avatarUrl?: string;
      locale?: string;
      timezone?: string;
    }) => {
      return api<User>("/v1/users/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (user) => {
      setUser(user);
    },
  });
}
