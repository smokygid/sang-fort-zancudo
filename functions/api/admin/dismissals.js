import { json, readCookie, tokenDigest, COOKIE } from "../auth/_session.js";

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

function kyivDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;

    let body;
    try { body = await request.json(); }
    catch { return json({ message: "Некоректний запит." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ message: "Некоректні параметри звільнення." }, 400);
    }

    const accountId = Number(body.accountId);
    const dismissalDate = typeof body.dismissalDate === "string" ? body.dismissalDate : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const documentNumber = typeof body.documentNumber === "string" ? body.documentNumber.trim().replace(/\\s+/g, " ") : "";

    if (!Number.isSafeInteger(accountId) || accountId < 1) return json({ message: "Оберіть військовослужбовця." }, 400);
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dismissalDate) ||
        Number.isNaN(Date.parse(dismissalDate + "T00:00:00Z")) ||
        new Date(dismissalDate + "T00:00:00Z").toISOString().slice(0, 10) !== dismissalDate ||
        dismissalDate > kyivDate()) {
      return json({ message: "Вкажіть коректну дату звільнення, не пізніше сьогоднішньої." }, 400);
    }
    if (reason.length < 5 || reason.length > 1500) return json({ message: "Підстава звільнення має містити від 5 до 1500 символів." }, 400);
    if (documentNumber.length > 80) return json({ message: "Номер наказу не може перевищувати 80 символів." }, 400);

    const target = await env.DB.prepare(
      `SELECT a.id,a.service_number,a.role,
        EXISTS(SELECT 1 FROM personnel_service_records sr
          WHERE sr.account_id=a.id AND sr.record_type='history'
          AND sr.title='Дострокове звільнення зі служби') AS dismissed
       FROM personnel_accounts a WHERE a.id=? LIMIT 1`
    ).bind(accountId).first();

    if (!target || target.role !== "soldier") return json({ message: "Військовослужбовця не знайдено." }, 404);
    if (target.dismissed) return json({ message: "Цього військовослужбовця вже звільнено зі служби." }, 409);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO personnel_service_records
         (account_id,record_type,title,description,document_number,record_date,created_by)
         VALUES (?,'history','Дострокове звільнення зі служби',?,?,?,?)`
      ).bind(accountId, reason, documentNumber, dismissalDate, auth.actor.id),
      env.DB.prepare("UPDATE personnel_accounts SET active=0 WHERE id=? AND role='soldier'").bind(accountId),
      env.DB.prepare("DELETE FROM cabinet_sessions WHERE account_id=?").bind(accountId),
      env.DB.prepare(
        "INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?,'personnel_dismissed',?)"
      ).bind(auth.actor.id, accountId)
    ]);

    return json({
      success: true,
      serviceNumber: target.service_number,
      dismissalDate,
      message: "Військовослужбовця достроково звільнено. Доступ до кабінету припинено, запис збережено в службовій історії."
    });
  } catch (error) {
    console.error("SANG personnel dismissal error:", error);
    return json({ message: "Не вдалося оформити дострокове звільнення." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "POST" });
}
