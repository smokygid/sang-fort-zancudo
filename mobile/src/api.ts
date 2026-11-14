const API_BASE = "https://sang-fort-zancudo.pages.dev";

export type Profile = {
  serviceNumber: string;
  fullName: string;
  age?: number | null;
  contact?: string;
  rank: string;
  unit: string;
  mos: string;
  serviceStatus: string;
  serviceNote?: string;
  updatedAt?: string | null;
};

export type NewsItem = {
  id: number;
  title: string;
  category?: string;
  news_date?: string;
  excerpt?: string;
  body?: string;
  image_url?: string;
  published_at?: string;
};

type LoginResponse = {
  success: true;
  sessionToken: string;
  mustChangePassword: boolean;
};

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(API_BASE + path, { ...init, headers });
  } catch {
    throw new Error("Немає з'єднання із сервером SANG. Перевірте інтернет.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.message === "string" ? payload.message : "Помилка запиту до SANG.";
    if (response.status === 401) throw new Error("Сесію завершено. Увійдіть повторно.");
    throw new Error(message);
  }
  return payload as T;
}

export const api = {
  async login(serviceId: string, password: string): Promise<LoginResponse> {
    const result = await request<LoginResponse>("/api/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({ serviceId, password, clientType: "mobile" }),
    });
    if (!result.sessionToken) throw new Error("Сервер не повернув токен мобільної сесії.");
    return result;
  },

  async profile(token: string): Promise<Profile> {
    const result = await request<{ success: true; profile: Profile }>("/api/profile", token);
    return result.profile;
  },

  async news(): Promise<NewsItem[]> {
    const result = await request<{ success: true; news: NewsItem[] }>("/api/news");
    return result.news || [];
  },

  async changePassword(token: string, currentPassword: string, newPassword: string): Promise<void> {
    await request<{ success: true }>("/api/auth/change-password", token, {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async logout(token: string): Promise<void> {
    await request<{ success: true }>("/api/auth/logout", token, { method: "POST" });
  },
};
