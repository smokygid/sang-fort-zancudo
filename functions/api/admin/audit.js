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
      `SELECT l.id, l.action, l.created_at,
        actor.service_number AS actor_service_number,
        target.service_number AS target_service_number
       FROM cabinet_audit_log l
       LEFT JOIN personnel_accounts actor ON actor.id=l.actor_account_id
       LEFT JOIN personnel_accounts target ON target.id=l.target_account_id
       ORDER BY l.id DESC LIMIT 200`
    ).all();
    return json({ success: true, entries: result.results || [] });
  } catch (error) {
    console.error("SANG audit log error:", error);
    return json({ message: "Не вдалося завантажити журнал аудиту." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET" });
}
