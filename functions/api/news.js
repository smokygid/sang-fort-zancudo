import { json } from "./auth/_session.js";

export async function onRequestGet({ env }) {
  try {
    if (!env.DB) return json({ message: "База даних недоступна." }, 503);
    const result = await env.DB.prepare(
      `SELECT id,title,category,news_date,excerpt,body,image_url,is_featured,is_announcement,published_at
       FROM sang_news WHERE status='published'
       ORDER BY is_featured DESC, news_date DESC, id DESC LIMIT 100`
    ).all();
    return json({ success: true, news: result.results || [] }, 200, {
      "Cache-Control": "no-store"
    });
  } catch (error) {
    console.error("SANG public news error:", error);
    return json({ message: "Не вдалося завантажити новини." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET" });
}
