import { create } from 'zustand';
import { api, authApi, setAccessToken } from './api';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string | null;
  timezone: string | null;
  tenantId: string;
  role: string;
  onboardingCompleted: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isHydrated: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const REFRESH_TOKEN_KEY = 'refreshToken';

function setAuthCookie(value: boolean) {
  if (value) {
    document.cookie = 'hasAuth=1; path=/; max-age=31536000; SameSite=Lax';
  } else {
    document.cookie = 'hasAuth=; path=/; max-age=0';
  }
}

let refreshInterval: ReturnType<typeof setInterval> | null = null;

function startAutoRefresh() {
  if (refreshInterval) return;
  // Refresh every 12 minutes (access token expires in 15 min)
  refreshInterval = setInterval(
    async () => {
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        stopAutoRefresh();
        return;
      }
      try {
        const res = await authApi.refresh(refreshToken);
        setAccessToken(res.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
      } catch {
        // Refresh failed — will be handled on next API call
      }
    },
    12 * 60 * 1000,
  );
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isHydrated: false,
  isAuthenticated: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const res = await authApi.login({ email, password });
      setAccessToken(res.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
      set({ user: res.user as User, isLoading: false, isAuthenticated: true, isHydrated: true });
      setAuthCookie(true);
      startAutoRefresh();
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (email, password, displayName) => {
    set({ isLoading: true });
    try {
      const res = await authApi.register({ email, password, displayName });
      setAccessToken(res.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
      set({ user: res.user as User, isLoading: false, isAuthenticated: true, isHydrated: true });
      setAuthCookie(true);
      startAutoRefresh();
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    stopAutoRefresh();
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => {});
    }
    setAccessToken(null);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setAuthCookie(false);
    set({ user: null, isAuthenticated: false });
  },

  hydrate: async () => {
    // Skip hydration if already authenticated (e.g. just logged in)
    const state = useAuthStore.getState();
    if (state.isAuthenticated && state.user) {
      set({ isHydrated: true });
      return;
    }

    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      setAuthCookie(false);
      set({ isHydrated: true });
      return;
    }

    set({ isLoading: true });

    try {
      // 1. Refresh token to get new access token
      const res = await authApi.refresh(refreshToken);
      setAccessToken(res.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);

      // 2. Fetch user profile
      const user = await api<User>('/v1/users/me');
      set({ user, isLoading: false, isHydrated: true, isAuthenticated: true });
      setAuthCookie(true);
      startAutoRefresh();
    } catch {
      // Token expired or invalid — clean up
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      setAccessToken(null);
      setAuthCookie(false);
      set({ user: null, isLoading: false, isHydrated: true, isAuthenticated: false });
    }
  },

  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
  },
}));
