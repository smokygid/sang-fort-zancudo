import { json, readCookie, tokenDigest, COOKIE } from "./_session.js";

function decodeBase64(value) {
  try {
    const s = atob(value);
    return Uint8Array.from(s, c => c.charCodeAt(0));
  } catch { return null; }
}
function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
async function hashPassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return b64(new Uint8Array(bits));
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ message: "База даних недоступна." }, 503);
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return json({ message: "Запит відхилено." }, 403);
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return json({ message: "Сесія завершилася. Увійдіть знову." }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 12 || newPassword.length > 128 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return json({ message: "Новий пароль має містити щонайменше 12 символів, великі й малі літери та цифри." }, 400);
  }
  try {
    const digest = await tokenDigest(token);
    const account = await env.DB.prepare(
      "SELECT a.id,a.password_hash,a.password_salt,a.password_iterations FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
    ).bind(digest, new Date().toISOString()).first();
    if (!account) return json({ message: "Сесія завершилася. Увійдіть знову." }, 401);
    const saltOld = decodeBase64(account.password_salt);
    const expected = decodeBase64(account.password_hash);
    if (!saltOld || !expected || expected.length !== 32) return json({ message: "Не вдалося перевірити обліковий запис." }, 500);
    const oldHash = await hashPassword(currentPassword, saltOld, account.password_iterations);
    const oldBytes = decodeBase64(oldHash);
    let diff = 0;
    for (let i=0;i<expected.length;i++) diff |= expected[i] ^ oldBytes[i];
    if (diff !== 0) return json({ message: "Поточний пароль неправильний." }, 401);

    const saltNew = crypto.getRandomValues(new Uint8Array(16));
    const hashNew = await hashPassword(newPassword, saltNew, 310000);
    await env.DB.prepare(
      "UPDATE personnel_accounts SET password_hash=?,password_salt=?,password_iterations=310000,must_change_password=0,updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(hashNew, b64(saltNew), account.id).run();
    await env.DB.prepare("DELETE FROM cabinet_sessions WHERE account_id=? AND id<>?").bind(account.id, digest).run();
    return json({ success: true, message: "Пароль успішно змінено." });
  } catch {
    return json({ message: "Не вдалося змінити пароль." }, 500);
  }
}
export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ message: "Метод не підтримується." }, 405, { Allow: "POST" });
  return onRequestPost(context);
}
