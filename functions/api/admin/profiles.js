import { json, readCookie, tokenDigest, COOKIE } from "../auth/_session.js";

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
      `SELECT a.id, a.service_number, a.personnel_id, a.active,
        p.full_name, p.age, p.contact, p.rank, p.unit, p.mos,
        p.service_status, p.service_note, p.updated_at
       FROM personnel_accounts a LEFT JOIN personnel_profiles p ON p.account_id=a.id
       WHERE a.role='soldier' ORDER BY a.service_number ASC`
    ).all();
    return json({ success: true, profiles: result.results || [] });
  } catch (error) {
    console.error("SANG admin profile list error:", error);
    return json({ message: "Не вдалося завантажити профілі." }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;
    let body;
    try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
    const accountId = Number(body.accountId);
    const fields = ["rank", "unit", "mos", "serviceStatus", "serviceNote"];
    if (!Number.isSafeInteger(accountId) || accountId < 1) return json({ message: "Некоректний обліковий запис." }, 400);
    const values = {};
    const limits = { rank: 80, unit: 80, mos: 40, serviceStatus: 80, serviceNote: 1000 };
    for (const field of fields) {
      if (typeof body[field] !== "string" || body[field].trim().length > limits[field]) {
        return json({ message: "Перевірте заповнення службових полів." }, 400);
      }
      values[field] = body[field].trim();
    }
    const target = await env.DB.prepare("SELECT id FROM personnel_accounts WHERE id=? AND role='soldier'").bind(accountId).first();
    if (!target) return json({ message: "Військовослужбовця не знайдено." }, 404);
    await env.DB.prepare(
      `INSERT INTO personnel_profiles (account_id, rank, unit, mos, service_status, service_note, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(account_id) DO UPDATE SET
         rank=excluded.rank, unit=excluded.unit, mos=excluded.mos,
         service_status=excluded.service_status, service_note=excluded.service_note,
         updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP`
    ).bind(accountId, values.rank, values.unit, values.mos, values.serviceStatus, values.serviceNote, auth.actor.id).run();
    await env.DB.prepare("INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?,'service_profile_updated',?)")
      .bind(auth.actor.id, accountId).run();
    return json({ success: true, message: "Службовий профіль оновлено." });
  } catch (error) {
    console.error("SANG admin profile update error:", error);
    return json({ message: "Не вдалося зберегти службовий профіль." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET, PATCH" });
}
