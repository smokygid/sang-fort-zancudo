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
    const url = new URL(request.url);
    if (url.searchParams.get("source") === "registry") {
      if (!env.SHEETS_API_URL || !env.SHEETS_API_SECRET) {
        return json({ message: "Інтеграцію з реєстром не налаштовано." }, 503);
      }
      const response = await fetch(env.SHEETS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: env.SHEETS_API_SECRET, action: "roster" })
      });
      if (!response.ok) return json({ message: "Не вдалося отримати реєстр Google Sheets." }, 502);
      const registry = await response.json();
      if (!registry.success || !Array.isArray(registry.soldiers)) {
        return json({ message: registry.message || "Некоректна відповідь реєстру." }, 502);
      }
      const existing = await env.DB.prepare("SELECT service_number FROM personnel_accounts").all();
      const registered = new Set((existing.results || []).map(row => row.service_number));
      const soldiers = registry.soldiers
        .filter(person => person.serviceNumber && !registered.has(person.serviceNumber))
        .map(person => ({
          serviceNumber: person.serviceNumber,
          personnelId: person.personnelId || person.serviceNumber,
          fullName: person.fullName || "",
          rank: person.rank || "",
          unit: person.unit || "",
          mos: person.mos || "",
          serviceStatus: person.serviceStatus || ""
        }));
      return json({ success: true, soldiers });
    }
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
  if (!/^[A-Z0-9-]{3,32}$/.test(serviceNumber)) {
    return json({ message: "Оберіть військовослужбовця з реєстру." }, 400);
  }
  if (!env.SHEETS_API_URL || !env.SHEETS_API_SECRET) {
    return json({ message: "Інтеграцію з реєстром не налаштовано." }, 503);
  }
  try {
    const registryResponse = await fetch(env.SHEETS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.SHEETS_API_SECRET, action: "profile", serviceNumber })
    });
    if (!registryResponse.ok) return json({ message: "Не вдалося перевірити військовослужбовця в реєстрі." }, 502);
    const registry = await registryResponse.json();
    if (!registry.success || !registry.profile) {
      return json({ message: "Військовослужбовця немає в реєстрі Google Sheets." }, 404);
    }
    const personnelId = String(registry.profile["ID"] || serviceNumber).trim();
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(personnelId)) {
      return json({ message: "У записі реєстру некоректний ID." }, 400);
    }
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

export async function onRequestPatch({ request, env }) {
  let auth;
  try { auth = await requireAdmin(request, env); } catch { return json({ message: "Не вдалося перевірити права доступу." }, 500); }
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
  const accountId = Number(body.accountId);
  const active = body.active;
  if (!Number.isSafeInteger(accountId) || accountId < 1 || typeof active !== "boolean") {
    return json({ message: "Некоректні параметри облікового запису." }, 400);
  }
  if (accountId === auth.actor.id) return json({ message: "Не можна змінити статус власного облікового запису." }, 400);
  try {
    const target = await env.DB.prepare("SELECT id, role, active FROM personnel_accounts WHERE id=? LIMIT 1").bind(accountId).first();
    if (!target) return json({ message: "Обліковий запис не знайдено." }, 404);
    if (target.role === "admin") return json({ message: "Зміна статусу адміністратора через цю панель заборонена." }, 403);
    if (Boolean(target.active) === active) return json({ success: true, active, message: "Статус не змінився." });
    await env.DB.prepare("UPDATE personnel_accounts SET active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(active ? 1 : 0, accountId).run();
    await env.DB.prepare("INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?,?,?)")
      .bind(auth.actor.id, active ? "account_activated" : "account_deactivated", accountId).run();
    if (!active) await env.DB.prepare("DELETE FROM cabinet_sessions WHERE account_id=?").bind(accountId).run();
    return json({ success: true, active, message: active ? "Обліковий запис активовано." : "Обліковий запис заблоковано." });
  } catch (error) {
    console.error("SANG account status error:", error);
    return json({ message: "Не вдалося змінити статус облікового запису." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET, POST, PATCH" });
}
