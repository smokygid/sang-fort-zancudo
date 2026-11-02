import { json, readCookie, tokenDigest, COOKIE } from "./auth/_session.js";

async function requireSession(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return { error: json({ message: "Запит відхилено." }, 403) };
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const actor = await env.DB.prepare(
    "SELECT a.id, a.role, a.service_number FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
  ).bind(await tokenDigest(token), new Date().toISOString()).first();
  if (!actor) return { error: json({ message: "Потрібна авторизація." }, 401) };
  return { actor };
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireSession(request, env);
    if (auth.error) return auth.error;
    const result = await env.DB.prepare(
      `SELECT o.*,
        CASE WHEN o.audience_type='all' THEN 'Усім військовослужбовцям'
             WHEN o.audience_type='person' THEN 'Персональний документ'
             ELSE 'Груповий документ' END AS audience_label
       FROM sang_orders o
       WHERE o.status='published'
         AND (o.audience_type='all' OR EXISTS (
           SELECT 1 FROM sang_order_recipients r
           WHERE r.order_id=o.id AND r.account_id=?
         ))
       ORDER BY o.order_date DESC, o.id DESC
       LIMIT 300`
    ).bind(auth.actor.id).all();

    const orders = (result.results || []).map(order => ({
      id: String(order.id),
      order_number: order.order_number,
      title: order.title,
      category: order.category,
      order_date: order.order_date,
      issued_at: order.order_date,
      body: order.body,
      additional_text: order.body,
      status: "Опубліковано",
      audience_label: order.audience_label
    }));
    return json({ success: true, orders, source: "d1" }, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    console.error("SANG orders list error:", error);
    return json({ message: "Не вдалося завантажити накази з бази даних." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET" });
}
