import { json, readCookie, tokenDigest, COOKIE } from "./auth/_session.js";

async function requireSession(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return { error: json({ message: "Запит відхилено." }, 403) };
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const digest = await tokenDigest(token);
  const actor = await env.DB.prepare(
    "SELECT a.id, a.role, a.service_number FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
  ).bind(digest, new Date().toISOString()).first();
  if (!actor) return { error: json({ message: "Потрібна авторизація." }, 401) };
  return { actor };
}

function normalizeOrder(row, index) {
  const value = (key) => row[key] ?? row[String(key).toLowerCase()] ?? "";
  const status = String(value("Статус") || "").trim();
  return {
    id: String(value("ID наказу") || index),
    order_number: String(value("Номер наказу") || ""),
    order_date: String(value("Дата") || value("Дата видання") || ""),
    category: String(value("Тип наказу") || "Наказ"),
    service_number: String(value("Військовий №") || ""),
    full_name: String(value("ПІБ") || ""),
    previous_value: String(value("Попереднє значення") || ""),
    new_value: String(value("Нове значення") || ""),
    basis: String(value("Підстава") || ""),
    additional_text: String(value("Додатковий текст") || ""),
    status,
    google_docs_url: safeDocumentUrl(value("Google Docs URL")),
    pdf_url: safeDocumentUrl(value("PDF URL")),
    author: String(value("Автор") || ""),
    created_at: String(value("Дата створення") || ""),
    issued_at: String(value("Дата видання") || ""),
    execution_status: String(value("Стан виконання") || ""),
    personnel_change: String(value("Кадрові зміни") || "")
  };
}

function safeDocumentUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && (url.hostname === "docs.google.com" || url.hostname === "drive.google.com")
      ? url.href : "";
  } catch { return ""; }
}

function isCancelled(order) {
  const status = order.status.toLocaleLowerCase("uk");
  return /скасован|відхилен|чернет|видален|анульован/.test(status);
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireSession(request, env);
    if (auth.error) return auth.error;
    if (!env.SHEETS_API_URL || !env.SHEETS_API_SECRET) {
      return json({ message: "Інтеграцію з реєстром наказів не налаштовано." }, 503);
    }

    const upstream = await fetch(env.SHEETS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "orders", secret: env.SHEETS_API_SECRET })
    });
    if (!upstream.ok) throw new Error("Sheets API HTTP " + upstream.status);
    const payload = await upstream.json();
    if (!payload || payload.success !== true || !Array.isArray(payload.orders)) {
      console.error("SANG orders API returned an invalid response");
      return json({ message: "Реєстр наказів повернув некоректну відповідь." }, 502);
    }

    const orders = payload.orders.map(normalizeOrder)
      .filter(order => {
        if (auth.actor.role === "admin") return true;
        if (isCancelled(order)) return false;
        // Загальні накази (без військового номера) доступні всьому особовому складу.
        // Персональні накази доступні лише адресату.
        return !order.service_number || order.service_number === auth.actor.service_number;
      })
      .sort((a, b) => String(b.issued_at || b.order_date).localeCompare(String(a.issued_at || a.order_date)))
      .slice(0, 300);

    return json({ success: true, orders, source: "google_sheets" }, 200, {
      "Cache-Control": "private, no-store"
    });
  } catch (error) {
    console.error("SANG orders list error:", error);
    return json({ message: "Не вдалося завантажити накази з реєстру Google Sheets." }, 502);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET" });
}
