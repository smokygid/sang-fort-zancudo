import { json, readCookie, tokenDigest, COOKIE } from "./auth/_session.js";

async function requireSession(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) {
    return { error: json({ message: "Запит відхилено." }, 403) };
  }
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const actor = await env.DB.prepare(
    "SELECT a.id FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
  ).bind(await tokenDigest(token), new Date().toISOString()).first();
  if (!actor) return { error: json({ message: "Потрібна авторизація." }, 401) };
  return { actor };
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireSession(request, env);
    if (auth.error) return auth.error;
    const result = await env.DB.prepare(
      "SELECT order_key, read_at FROM personnel_order_reads WHERE account_id=? ORDER BY read_at DESC LIMIT 500"
    ).bind(auth.actor.id).all();
    const readOrderIds = (result.results || []).map(row => row.order_key);
    return json({ success: true, readOrderIds });
  } catch (error) {
    console.error("SANG order reads list error:", error);
    return json({ message: "Не вдалося завантажити статуси перегляду наказів." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireSession(request, env);
    if (auth.error) return auth.error;
    let body;
    try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
    const orderId = String(body?.orderId || "").trim();
    if (!orderId || orderId.length > 160 || !/^[a-zA-Z0-9_-]+$/.test(orderId)) {
      return json({ message: "Некоректний ідентифікатор наказу." }, 400);
    }
    await env.DB.prepare(
      "INSERT INTO personnel_order_reads (account_id, order_key) VALUES (?, ?) ON CONFLICT(account_id, order_key) DO NOTHING"
    ).bind(auth.actor.id, orderId).run();
    return json({ success: true, orderId });
  } catch (error) {
    console.error("SANG order read save error:", error);
    return json({ message: "Не вдалося зберегти статус перегляду наказу." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET, POST" });
}
