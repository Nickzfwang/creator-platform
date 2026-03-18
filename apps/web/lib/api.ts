const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// Mutex for token refresh to avoid concurrent refreshes
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken =
    typeof window !== 'undefined'
      ? localStorage.getItem('refreshToken')
      : null;

  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('refreshToken');
      }
      setAccessToken(null);
      return null;
    }

    const data = await response.json();
    setAccessToken(data.accessToken);
    if (typeof window !== 'undefined') {
      localStorage.setItem('refreshToken', data.refreshToken);
    }
    return data.accessToken;
  } catch {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('refreshToken');
    }
    setAccessToken(null);
    return null;
  }
}

async function getRefreshedToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = refreshAccessToken();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function api<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { skipAuth, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (!skipAuth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
  });

  // Auto-retry on 401 with token refresh
  if (response.status === 401 && !skipAuth) {
    const newToken = await getRefreshedToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(`${API_BASE}${path}`, {
        ...fetchOptions,
        headers,
      });
    } else {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new ApiError(401, 'Session expired');
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      body.detail || body.message || 'An error occurred',
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) return undefined as T;

  return JSON.parse(text) as T;
}

// Auth API helpers
export const authApi = {
  register(data: { email: string; password: string; displayName: string }) {
    return api<{
      accessToken: string;
      refreshToken: string;
      user: {
        id: string;
        email: string;
        displayName: string;
        tenantId: string;
        role: string;
        onboardingCompleted: boolean;
      };
    }>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
      skipAuth: true,
    });
  },

  login(data: { email: string; password: string }) {
    return api<{
      accessToken: string;
      refreshToken: string;
      user: {
        id: string;
        email: string;
        displayName: string;
        tenantId: string;
        role: string;
        onboardingCompleted: boolean;
      };
    }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
      skipAuth: true,
    });
  },

  refresh(refreshToken: string) {
    return api<{ accessToken: string; refreshToken: string }>(
      '/v1/auth/refresh',
      {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
        skipAuth: true,
      },
    );
  },

  logout(refreshToken: string) {
    return api('/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },
};
