import { json, readCookie, tokenDigest, COOKIE } from "./auth/_session.js";

async function requireSession(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return { error: json({ message: "Запит відхилено." }, 403) };
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const digest = await tokenDigest(token);
  const actor = await env.DB.prepare(
    "SELECT a.id, a.role FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
  ).bind(digest, new Date().toISOString()).first();
  if (!actor) return { error: json({ message: "Потрібна авторизація." }, 401) };
  return { actor };
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireSession(request, env);
    if (auth.error) return auth.error;
    const isAdmin = auth.actor.role === "admin";
    const result = await env.DB.prepare(
      `SELECT id, order_number, title, category, order_date, body, status, created_at, updated_at, published_at
       FROM sang_orders ${isAdmin ? "" : "WHERE status='published'"}
       ORDER BY order_date DESC, id DESC LIMIT 200`
    ).all();
    return json({ success: true, orders: result.results || [] });
  } catch (error) {
    console.error("SANG orders list error:", error);
    return json({ message: "Не вдалося завантажити накази." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET" });
}
