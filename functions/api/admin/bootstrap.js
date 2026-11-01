import { json } from "../auth/_session.js";

const PASSWORD_ITERATIONS = 100000;

function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function makePasswordHash(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return b64(new Uint8Array(bits));
}

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOOTSTRAP_SECRET) return json({ message: "Початкове налаштування не доступне." }, 503);
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) {
    return json({ message: "Запит відхилено." }, 403);
  }
  if (request.headers.get("X-Bootstrap-Secret") !== env.BOOTSTRAP_SECRET) {
    return json({ message: "Доступ заборонено." }, 403);
  }
  let body;
  try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
  const serviceNumber = typeof body.serviceNumber === "string" ? body.serviceNumber.trim().toUpperCase() : "";
  const personnelId = typeof body.personnelId === "string" ? body.personnelId.trim() : "";
  if (!/^[A-Z0-9-]{3,32}$/.test(serviceNumber) || !/^[A-Za-z0-9_-]{2,64}$/.test(personnelId)) {
    return json({ message: "Перевірте військовий номер та ID особової справи." }, 400);
  }
  try {
    const admin = await env.DB.prepare("SELECT COUNT(*) AS total FROM personnel_accounts WHERE role = 'admin'").first();
    if (admin.total > 0) return json({ message: "Початковий адміністратор уже створений." }, 409);
    const password = temporaryPassword();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await makePasswordHash(password, salt);
    await env.DB.prepare(
      "INSERT INTO personnel_accounts (service_number,password_hash,password_salt,password_iterations,personnel_id,role,active,must_change_password) VALUES (?,?,?,?,?,'admin',1,1)"
    ).bind(serviceNumber, hash, b64(salt), PASSWORD_ITERATIONS, personnelId).run();
    return json({ success: true, serviceNumber, temporaryPassword: password, message: "Збережіть тимчасовий пароль. Він більше не буде показаний." }, 201);
  } catch (error) {
    console.error("SANG bootstrap error:", error);
    return json({ message: "Не вдалося створити початковий обліковий запис." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ message: "Метод не підтримується." }, 405, { Allow: "POST" });
  return onRequestPost(context);
}
