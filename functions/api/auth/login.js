const SESSION_COOKIE = "__Host-sang_session";
const SESSION_SECONDS = 60 * 60 * 8;
const PBKDF2_ITERATIONS_MAX = 600000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyPassword(password, saltText, expectedText, iterations) {
  const salt = fromBase64(saltText);
  const expected = fromBase64(expectedText);
  if (!salt || !expected || salt.length < 16 || expected.length !== 32 ||
      !Number.isInteger(iterations) || iterations < 100000 ||
      iterations > PBKDF2_ITERATIONS_MAX) return false;

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256
  );
  const actual = new Uint8Array(bits);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ message: "Сервіс авторизації тимчасово недоступний." }, 503);

  let body;
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 4096) return json({ message: "Некоректний запит." }, 413);
    body = await request.json();
  } catch {
    return json({ message: "Перевірте формат запиту." }, 400);
  }

  const serviceNumber = typeof body.serviceId === "string"
    ? body.serviceId.trim().toUpperCase()
    : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!/^[A-Z0-9-]{3,32}$/.test(serviceNumber) || password.length < 1 || password.length > 256) {
    return json({ message: "Невірний військовий номер або пароль." }, 400);
  }

  try {
    const account = await env.DB.prepare(
      "SELECT id, password_hash, password_salt, password_iterations, active, must_change_password FROM personnel_accounts WHERE service_number = ? LIMIT 1"
    ).bind(serviceNumber).first();

    if (!account || account.active !== 1) {
      return json({ message: "Невірний військовий номер або пароль." }, 401);
    }

    const valid = await verifyPassword(
      password, account.password_salt, account.password_hash, account.password_iterations
    );
    if (!valid) return json({ message: "Невірний військовий номер або пароль." }, 401);

    const rawToken = new Uint8Array(32);
    crypto.getRandomValues(rawToken);
    const token = toBase64(rawToken).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();

    await env.DB.prepare(
      "INSERT INTO cabinet_sessions (id, account_id, expires_at) VALUES (?, ?, ?)"
    ).bind(tokenHash, account.id, expiresAt).run();

    return json({ redirect: "/cabinet/dashboard/", mustChangePassword: account.must_change_password === 1 }, 200, {
      "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`
    });
  } catch {
    return json({ message: "Помилка сервера авторизації. Спробуйте пізніше." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return json({ message: "Метод не підтримується." }, 405, { Allow: "POST" });
  }
  return onRequestPost(context);
}
