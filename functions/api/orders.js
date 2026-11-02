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

function safeDocumentUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && (url.hostname === "docs.google.com" || url.hostname === "drive.google.com") ? url.href : "";
  } catch { return ""; }
}

function normalizeLegacyOrder(row, index, actor) {
  const value = key => row[key] ?? row[String(key).toLowerCase()] ?? "";
  const serviceNumber = String(value("Військовий №") || "").trim();
  const status = String(value("Статус") || "").trim();
  if (/скасован|відхилен|чернет|видален|анульован/i.test(status)) return null;
  if (actor.role !== "admin" && serviceNumber && serviceNumber !== actor.service_number) return null;
  return {
    id: "sheet-" + String(value("ID наказу") || index),
    order_number: String(value("Номер наказу") || ""),
    title: String(value("Тип наказу") || "Наказ"),
    category: String(value("Тип наказу") || "Наказ"),
    order_date: String(value("Дата") || value("Дата видання") || ""),
    issued_at: String(value("Дата видання") || value("Дата") || ""),
    service_number: serviceNumber,
    full_name: String(value("ПІБ") || ""),
    basis: String(value("Підстава") || ""),
    additional_text: String(value("Додатковий текст") || value("Нове значення") || ""),
    status: status || "Опубліковано",
    google_docs_url: safeDocumentUrl(value("Google Docs URL")),
    pdf_url: safeDocumentUrl(value("PDF URL")),
    author: String(value("Автор") || "")
  };
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

    const newOrders = (result.results || []).map(order => ({
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

    // Старі документи з Google Sheets залишаються доступними під час переходу на нову систему.
    let legacyOrders = [];
    if (env.SHEETS_API_URL && env.SHEETS_API_SECRET) {
      try {
        const upstream = await fetch(env.SHEETS_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "orders", secret: env.SHEETS_API_SECRET })
        });
        if (upstream.ok) {
          const payload = await upstream.json();
          if (payload?.success === true && Array.isArray(payload.orders)) {
            legacyOrders = payload.orders.map((row, index) => normalizeLegacyOrder(row, index, auth.actor)).filter(Boolean);
          }
        }
      } catch (error) {
        console.error("SANG legacy orders read error:", error);
      }
    }

    const orders = [...newOrders, ...legacyOrders]
      .sort((a, b) => String(b.issued_at || b.order_date).localeCompare(String(a.issued_at || a.order_date)))
      .slice(0, 300);
    return json({ success: true, orders, source: "d1_and_legacy_sheets" }, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    console.error("SANG orders list error:", error);
    return json({ message: "Не вдалося завантажити накази з бази даних." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET" });
}
