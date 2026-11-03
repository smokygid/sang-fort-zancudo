import { json, readCookie, tokenDigest, COOKIE } from "../auth/_session.js";

const CATEGORIES = ["КОМАНДУВАННЯ","СЛУЖБА","НАВЧАННЯ","ОСОБОВИЙ СКЛАД","ЗАХОДИ","СПІВПРАЦЯ","НАБІР","ОГОЛОШЕННЯ","ІНШЕ"];

async function requireAdmin(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) {
    return { error: json({ message: "Запит відхилено." }, 403) };
  }
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const actor = await env.DB.prepare(
    "SELECT a.id,a.role FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
  ).bind(await tokenDigest(token), new Date().toISOString()).first();
  if (!actor || actor.role !== "admin") return { error: json({ message: "Недостатньо прав." }, 403) };
  return { actor };
}

function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function imageUrl(value) {
  const raw = text(value, 1000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : null;
  } catch { return null; }
}
function normalize(body) {
  const title = text(body.title, 180);
  const category = text(body.category, 40).toUpperCase();
  const newsDate = text(body.newsDate, 10);
  const excerpt = text(body.excerpt, 320);
  const content = typeof body.body === "string" ? body.body.trim().slice(0, 30000) : "";
  const image = imageUrl(body.imageUrl);
  if (!title || !CATEGORIES.includes(category) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(newsDate) || !content) {
    return { error: "Заповніть заголовок, категорію, дату та текст публікації." };
  }
  if (image === null) return { error: "Для зображення вкажіть коректне HTTPS-посилання." };
  return {
    title, category, newsDate, excerpt, body: content, imageUrl: image,
    isFeatured: body.isFeatured === true ? 1 : 0,
    isAnnouncement: body.isAnnouncement === true ? 1 : 0
  };
}
async function audit(env, actorId, action) {
  await env.DB.prepare(
    "INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?, ?, NULL)"
  ).bind(actorId, action).run();
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;
    const result = await env.DB.prepare(
      "SELECT * FROM sang_news ORDER BY news_date DESC,id DESC LIMIT 300"
    ).all();
    return json({ success: true, news: result.results || [] });
  } catch (error) {
    console.error("SANG admin news list error:", error);
    return json({ message: "Не вдалося завантажити реєстр новин. Перевірте міграцію 0007." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;
    let input;
    try { input = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
    const item = normalize(input);
    if (item.error) return json({ message: item.error }, 400);
    const status = input.status === "published" ? "published" : "draft";
    if (item.isFeatured) await env.DB.prepare("UPDATE sang_news SET is_featured=0 WHERE is_featured=1").run();
    const result = await env.DB.prepare(
      `INSERT INTO sang_news
       (title,category,news_date,excerpt,body,image_url,is_featured,is_announcement,status,created_by,updated_by,published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='published' THEN CURRENT_TIMESTAMP ELSE NULL END)`
    ).bind(item.title,item.category,item.newsDate,item.excerpt,item.body,item.imageUrl,item.isFeatured,item.isAnnouncement,status,auth.actor.id,auth.actor.id,status).run();
    await audit(env, auth.actor.id, status === "published" ? "news_published" : "news_draft_created");
    return json({ success: true, id: result.meta?.last_row_id, message: status === "published" ? "Новину опубліковано на сайті." : "Чернетку новини збережено." }, 201);
  } catch (error) {
    console.error("SANG news create error:", error);
    return json({ message: "Не вдалося зберегти публікацію." }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;
    let input;
    try { input = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
    const id = Number(input.id);
    if (!Number.isSafeInteger(id) || id < 1) return json({ message: "Некоректний ID публікації." }, 400);
    const current = await env.DB.prepare("SELECT id,status FROM sang_news WHERE id=? LIMIT 1").bind(id).first();
    if (!current) return json({ message: "Публікацію не знайдено." }, 404);

    if (Object.prototype.hasOwnProperty.call(input, "title")) {
      const item = normalize(input);
      if (item.error) return json({ message: item.error }, 400);
      if (item.isFeatured) await env.DB.prepare("UPDATE sang_news SET is_featured=0 WHERE is_featured=1 AND id<>?").bind(id).run();
      await env.DB.prepare(
        `UPDATE sang_news SET title=?,category=?,news_date=?,excerpt=?,body=?,image_url=?,
         is_featured=?,is_announcement=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(item.title,item.category,item.newsDate,item.excerpt,item.body,item.imageUrl,item.isFeatured,item.isAnnouncement,auth.actor.id,id).run();
      await audit(env, auth.actor.id, "news_updated");
      return json({ success: true, message: "Зміни публікації збережено." });
    }

    const status = input.status;
    if (!["published","archived","draft"].includes(status)) return json({ message: "Некоректний статус публікації." }, 400);
    await env.DB.prepare(
      "UPDATE sang_news SET status=?,updated_by=?,updated_at=CURRENT_TIMESTAMP,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END WHERE id=?"
    ).bind(status,auth.actor.id,status,id).run();
    await audit(env, auth.actor.id, status === "published" ? "news_published" : status === "archived" ? "news_archived" : "news_restored_to_draft");
    return json({ success: true, message: status === "published" ? "Публікацію розміщено на сайті." : status === "archived" ? "Публікацію знято з сайту та переміщено до архіву." : "Публікацію повернуто до чернеток." });
  } catch (error) {
    console.error("SANG news management error:", error);
    return json({ message: "Не вдалося оновити публікацію." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET, POST, PATCH" });
}
