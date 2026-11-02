import { json, tokenDigest } from "../auth/_session.js";

const ITERATIONS = 100000;
function b64(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return b64(new Uint8Array(bits));
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ message: "Сервіс тимчасово недоступний." }, 503);
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return json({ message: "Запит відхилено." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
  const token = typeof body.token === "string" ? body.token : "";
  const contactName = typeof body.contactName === "string" ? body.contactName.trim().replace(/\s+/g, " ") : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[a-f0-9]{64}$/.test(token) || contactName.length < 3 || contactName.length > 100 ||
      password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return json({ message: "Перевірте запрошення, ім’я та пароль (від 12 символів, великі й малі літери та цифри)." }, 400);
  }
  try {
    const inviteHash = await tokenDigest(token);
    const invite = await env.DB.prepare("SELECT id,faction_name,contact_name FROM faction_lookup_invites WHERE invite_token_hash=? AND used_at IS NULL AND expires_at>? LIMIT 1")
      .bind(inviteHash, new Date().toISOString()).first();
    if (!invite) return json({ message: "Запрошення недійсне, прострочене або вже використане." }, 404);
    const id = crypto.randomUUID().replace(/-/g, "").toUpperCase();
    const serviceNumber = "FL-" + id.slice(0, 18);
    const personnelId = "FL-" + id;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const passwordHash = await hashPassword(password, salt);
    const created = await env.DB.prepare("INSERT INTO personnel_accounts(service_number,password_hash,password_salt,password_iterations,personnel_id,role,active,must_change_password,faction_name) VALUES(?,?,?,?,?,'faction_leader',1,0,?)")
      .bind(serviceNumber,passwordHash,b64(salt),ITERATIONS,personnelId,invite.faction_name).run();
    const accountId = created.meta?.last_row_id;
    const claimed = await env.DB.prepare("UPDATE faction_lookup_invites SET used_at=CURRENT_TIMESTAMP WHERE id=? AND used_at IS NULL AND expires_at>?")
      .bind(invite.id,new Date().toISOString()).run();
    if (!claimed.meta?.changes) {
      await env.DB.prepare("DELETE FROM personnel_accounts WHERE id=?").bind(accountId).run();
      return json({ message: "Запрошення вже використано. Зверніться до командування SANG." }, 409);
    }
    await env.DB.prepare("INSERT INTO personnel_profiles(account_id,full_name) VALUES(?,?)").bind(accountId,contactName).run();
    await env.DB.prepare("INSERT INTO cabinet_audit_log(actor_account_id,action,target_account_id) VALUES(NULL,'faction_leader_registered',?)").bind(accountId).run();
    return json({ success: true, message: "Обліковий запис керівника фракції створено. Тепер можна увійти до кабінету.", serviceNumber });
  } catch (error) {
    console.error("SANG faction invite redeem:", error);
    return json({ message: "Не вдалося активувати запрошення." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "POST" });
}
