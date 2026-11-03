import { json, readCookie, tokenDigest, COOKIE } from "./auth/_session.js";

async function getActor(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) {
    return { error: json({ message: "Запит відхилено." }, 403) };
  }
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const actor = await env.DB.prepare(
    "SELECT a.id,a.role FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
  ).bind(await tokenDigest(token), new Date().toISOString()).first();
  return actor ? { actor } : { error: json({ message: "Сесію не знайдено." }, 401) };
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await getActor(request, env);
    if (auth.error) return auth.error;
    const url = new URL(request.url);
    let accountId = auth.actor.id;
    if (auth.actor.role === "admin" && url.searchParams.has("accountId")) {
      accountId = Number(url.searchParams.get("accountId"));
      if (!Number.isSafeInteger(accountId) || accountId < 1) return json({ message: "Некоректний ID військовослужбовця." }, 400);
    }
    const records = await env.DB.prepare(
      `SELECT id,record_type,title,description,document_number,record_date,created_at,created_by
       FROM personnel_service_records WHERE account_id=?
       ORDER BY record_date DESC,id DESC LIMIT 200`
    ).bind(accountId).all();
    return json({ success: true, records: records.results || [] }, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    console.error("SANG service records read error:", error);
    return json({ message: "Не вдалося завантажити службову історію." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await getActor(request, env);
    if (auth.error) return auth.error;
    if (auth.actor.role !== "admin") return json({ message: "Додавати службові записи може лише командування." }, 403);
    let body;
    try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ message: "Некоректні параметри запису." }, 400);

    const accountId = Number(body.accountId);
    const type = String(body.recordType || "");
    const title = typeof body.title === "string" ? body.title.trim().replace(/\s+/g, " ") : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const documentNumber = typeof body.documentNumber === "string" ? body.documentNumber.trim().replace(/\s+/g, " ") : "";
    const recordDate = typeof body.recordDate === "string" ? body.recordDate : "";
    if (!Number.isSafeInteger(accountId) || accountId < 1) return json({ message: "Оберіть військовослужбовця." }, 400);
    if (!["award","reprimand","history"].includes(type)) return json({ message: "Оберіть тип службового запису." }, 400);
    if (title.length < 3 || title.length > 160) return json({ message: "Назва має містити від 3 до 160 символів." }, 400);
    if (description.length > 1500 || documentNumber.length > 80) return json({ message: "Перевищено допустиму довжину тексту." }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate) || Number.isNaN(Date.parse(recordDate + "T00:00:00Z"))) return json({ message: "Вкажіть коректну дату запису." }, 400);

    const target = await env.DB.prepare("SELECT id,role FROM personnel_accounts WHERE id=? LIMIT 1").bind(accountId).first();
    if (!target || target.role !== "soldier") return json({ message: "Військовослужбовця не знайдено." }, 404);

    const inserted = await env.DB.prepare(
      `INSERT INTO personnel_service_records
       (account_id,record_type,title,description,document_number,record_date,created_by)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(accountId,type,title,description,documentNumber,recordDate,auth.actor.id).run();
    const recordId = inserted.meta?.last_row_id || null;
    const notificationTitle = type === "award" ? "Нова відзнака" : type === "reprimand" ? "Дисциплінарне стягнення" : "Оновлення службової історії";
    const notificationMessage = title + (documentNumber ? " · Підстава: " + documentNumber : "");
    await env.DB.prepare(
      `INSERT INTO personnel_notifications (account_id,notification_type,title,message,link,source_key)
       VALUES (?,?,?,?,?,?)`
    ).bind(accountId,type,notificationTitle,notificationMessage,"#awards-section","service-record:" + String(recordId || Date.now())).run();
    await env.DB.prepare(
      "INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?,'service_record_created',?)"
    ).bind(auth.actor.id, accountId).run();

    return json({ success: true, id: recordId, message: "Запис додано до службової історії та надіслано сповіщення." });
  } catch (error) {
    console.error("SANG service record create error:", error);
    return json({ message: "Не вдалося додати службовий запис." }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const auth = await getActor(request, env);
    if (auth.error) return auth.error;
    if (auth.actor.role !== "admin") return json({ message:"Видаляти записи особової справи може лише командування." },403);
    let body;
    try { body = await request.json(); } catch { return json({ message:"Некоректний запит." },400); }
    const id = Number(body?.id);
    if (!Number.isSafeInteger(id) || id < 1) return json({ message:"Некоректний ID запису." },400);
    const current = await env.DB.prepare("SELECT id,account_id,record_type,title FROM personnel_service_records WHERE id=? LIMIT 1").bind(id).first();
    if (!current) return json({ message:"Запис не знайдено." },404);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM personnel_notifications WHERE account_id=? AND source_key=?").bind(current.account_id,"service-record:"+String(id)),
      env.DB.prepare("DELETE FROM personnel_service_records WHERE id=?").bind(id),
      env.DB.prepare("INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?,'service_record_deleted',?)").bind(auth.actor.id,current.account_id)
    ]);
    return json({ success:true,message:"Запис видалено з особової справи.",deletedId:id });
  } catch(error) {
    console.error("SANG service record delete error:",error);
    return json({message:"Не вдалося видалити запис з особової справи."},500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET, POST, DELETE" });
}
