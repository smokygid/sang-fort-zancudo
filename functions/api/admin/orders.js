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

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;
    let body;
    try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
    const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "Наказ";
    const orderDate = typeof body.orderDate === "string" ? body.orderDate : "";
    const content = typeof body.body === "string" ? body.body.trim() : "";
    const status = body.status === "published" ? "published" : "draft";
    if (!/^[A-Za-zА-Яа-яІіЇїЄє0-9№./-]{1,40}$/.test(orderNumber)) return json({ message: "Перевірте номер документа." }, 400);
    if (!title || title.length > 180 || !["Наказ","Розпорядження","Директива","Інше"].includes(category) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(orderDate) || !content || content.length > 20000) {
      return json({ message: "Перевірте назву, тип, дату та текст документа." }, 400);
    }
    const result = await env.DB.prepare(
      `INSERT INTO sang_orders (order_number,title,category,order_date,body,status,created_by,updated_by,published_at)
       VALUES (?,?,?,?,?,?,?,?,CASE WHEN ?='published' THEN CURRENT_TIMESTAMP ELSE NULL END)`
    ).bind(orderNumber,title,category,orderDate,content,status,auth.actor.id,auth.actor.id,status).run();
    const order = await env.DB.prepare("SELECT id FROM sang_orders WHERE order_number=?").bind(orderNumber).first();
    await env.DB.prepare("INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?, ?, NULL)")
      .bind(auth.actor.id, status === "published" ? "order_published" : "order_created").run();
    return json({ success: true, id: order?.id, message: status === "published" ? "Документ опубліковано." : "Чернетку збережено." }, 201);
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE")) return json({ message: "Документ із таким номером уже існує." }, 409);
    console.error("SANG order create error:", error);
    return json({ message: "Не вдалося зберегти документ." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "POST" });
}
