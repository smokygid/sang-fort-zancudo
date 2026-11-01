import { json, readCookie, tokenDigest, COOKIE } from "./auth/_session.js";

async function currentAccount(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return { error: json({ message: "Запит відхилено." }, 403) };
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const digest = await tokenDigest(token);
  const account = await env.DB.prepare(
    "SELECT a.id, a.service_number, a.personnel_id, a.role FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
  ).bind(digest, new Date().toISOString()).first();
  return account ? { account } : { error: json({ message: "Сесію не знайдено." }, 401) };
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await currentAccount(request, env);
    if (auth.error) return auth.error;
    const profile = await env.DB.prepare(
      "SELECT full_name, age, contact, rank, unit, mos, service_status, service_note, updated_at FROM personnel_profiles WHERE account_id=?"
    ).bind(auth.account.id).first();
    return json({ success: true, profile: {
      fullName: profile?.full_name || "",
      age: profile?.age ?? "",
      contact: profile?.contact || "",
      rank: profile?.rank || "",
      unit: profile?.unit || "",
      mos: profile?.mos || "",
      serviceStatus: profile?.service_status || "",
      serviceNote: profile?.service_note || "",
      updatedAt: profile?.updated_at || null
    }});
  } catch (error) {
    console.error("SANG own profile read error:", error);
    return json({ message: "Не вдалося завантажити профіль." }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = await currentAccount(request, env);
    if (auth.error) return auth.error;
    let body;
    try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : null;
    const contact = typeof body.contact === "string" ? body.contact.trim() : null;
    const age = body.age === "" || body.age === null ? null : Number(body.age);
    if (fullName === null || contact === null || !fullName || fullName.length > 120 || contact.length > 160 ||
        (age !== null && (!Number.isInteger(age) || age < 16 || age > 100))) {
      return json({ message: "Перевірте ПІБ, вік і контактні дані. Вік має бути від 16 до 100 років." }, 400);
    }
    await env.DB.prepare(
      `INSERT INTO personnel_profiles (account_id, full_name, age, contact, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(account_id) DO UPDATE SET
         full_name=excluded.full_name, age=excluded.age, contact=excluded.contact,
         updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP`
    ).bind(auth.account.id, fullName, age, contact, auth.account.id).run();
    await env.DB.prepare("INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?,'personal_profile_updated',?)")
      .bind(auth.account.id, auth.account.id).run();
    return json({ success: true, message: "Особисті дані оновлено." });
  } catch (error) {
    console.error("SANG own profile update error:", error);
    return json({ message: "Не вдалося зберегти особисті дані." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET, PATCH" });
}
