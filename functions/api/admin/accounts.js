import { json, readCookie, tokenDigest, COOKIE } from "../auth/_session.js";

const PASSWORD_ITERATIONS = 100000;

function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}
async function hashPassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return b64(new Uint8Array(bits));
}
async function requireAdmin(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return { error: json({ message: "Запит відхилено." }, 403) };
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const digest = await tokenDigest(token);
  const actor = await env.DB.prepare(
    "SELECT a.id, a.role FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
  ).bind(digest, new Date().toISOString()).first();
  if (!actor || actor.role !== "admin") return { error: json({ message: "Недостатньо прав." }, 403) };
  return { actor };
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;
    const result = await env.DB.prepare(
      "SELECT id, service_number, personnel_id, role, active, must_change_password, created_at FROM personnel_accounts ORDER BY role DESC, service_number ASC"
    ).all();
    return json({ success: true, accounts: result.results || [] });
  } catch (error) {
    console.error("SANG account list error:", error);
    return json({ message: "Не вдалося завантажити облікові записи." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  let auth;
  try { auth = await requireAdmin(request, env); } catch { return json({ message: "Не вдалося перевірити права доступу." }, 500); }
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
  const serviceNumber = typeof body.serviceNumber === "string" ? body.serviceNumber.trim().toUpperCase() : "";
  const personnelId = typeof body.personnelId === "string" ? body.personnelId.trim() : "";
  if (!/^[A-Z0-9-]{3,32}$/.test(serviceNumber) || !/^[A-Za-z0-9_-]{2,64}$/.test(personnelId)) {
    return json({ message: "Перевірте військовий номер та ID особової справи." }, 400);
  }
  try {
    const password = temporaryPassword();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const passwordHash = await hashPassword(password, salt);
    const result = await env.DB.prepare(
      "INSERT INTO personnel_accounts (service_number,password_hash,password_salt,password_iterations,personnel_id,role,active,must_change_password) VALUES (?,?,?,?,?,'soldier',1,1)"
    ).bind(serviceNumber, passwordHash, b64(salt), PASSWORD_ITERATIONS, personnelId).run();
    const targetId = result.meta?.last_row_id ?? null;
    await env.DB.prepare("INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?,'account_created',?)").bind(auth.actor.id, targetId).run();
    return json({ success: true, serviceNumber, temporaryPassword: password, message: "Передайте пароль військовослужбовцю особисто. Повторно його показати неможливо." }, 201);
  } catch (error) {
    if (String(error).includes("UNIQUE")) return json({ message: "Такий військовий номер або ID уже зареєстрований." }, 409);
    console.error("SANG account creation error:", error);
    return json({ message: "Не вдалося створити обліковий запис." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET, POST" });
}
