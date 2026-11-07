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

async function readRegistryProfile(env, serviceNumber) {
  if (!env.SHEETS_API_URL || !env.SHEETS_API_SECRET) return null;
  const response = await fetch(env.SHEETS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.SHEETS_API_SECRET, action: "profile", serviceNumber })
  });
  if (!response.ok) throw new Error("Sheets API HTTP " + response.status);
  const result = await response.json();
  return result.success && result.profile ? result.profile : null;
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;

    const accounts = await env.DB.prepare(
      `SELECT a.id,a.service_number,a.personnel_id,a.active,
        EXISTS(SELECT 1 FROM personnel_service_records sr WHERE sr.account_id=a.id AND sr.record_type='history' AND sr.title='Дострокове звільнення зі служби') AS dismissed,
        (SELECT sr.record_date FROM personnel_service_records sr WHERE sr.account_id=a.id AND sr.record_type='history' AND sr.title='Дострокове звільнення зі служби' ORDER BY sr.id DESC LIMIT 1) AS dismissal_date,
        (SELECT sr.description FROM personnel_service_records sr WHERE sr.account_id=a.id AND sr.record_type='history' AND sr.title='Дострокове звільнення зі служби' ORDER BY sr.id DESC LIMIT 1) AS dismissal_reason,
        (SELECT sr.document_number FROM personnel_service_records sr WHERE sr.account_id=a.id AND sr.record_type='history' AND sr.title='Дострокове звільнення зі служби' ORDER BY sr.id DESC LIMIT 1) AS dismissal_document,
        p.full_name,p.rank,p.unit,p.mos,p.service_status,p.service_note,p.updated_at
       FROM personnel_accounts a
       LEFT JOIN personnel_profiles p ON p.account_id=a.id
       WHERE a.role='soldier'
       ORDER BY a.service_number ASC`
    ).all();

    const profiles = await Promise.all((accounts.results || []).map(async account => {
      try {
        const row = await readRegistryProfile(env, account.service_number);
        return {
          id: account.id,
          service_number: account.service_number,
          personnel_id: account.personnel_id,
          active: Boolean(account.active),
          dismissed: Boolean(account.dismissed),
          dismissal_date: account.dismissal_date || "",
          dismissal_reason: account.dismissal_reason || "",
          dismissal_document: account.dismissal_document || "",
          found_in_registry: Boolean(row),
          full_name: account.full_name || row?.["ПІБ"] || "",
          rank: account.rank || row?.["Звання"] || "",
          unit: account.unit || row?.["Підрозділ"] || "",
          mos: account.mos || row?.["MOS"] || "",
          service_status: account.dismissed ? "Звільнений" : (account.service_status || row?.["Статус служби"] || ""),
          service_note: account.service_note || "",
          updated_at: account.updated_at || row?.["Останнє оновлення"] || ""
        };
      } catch (error) {
        console.error("SANG admin Sheets profile read error:", account.service_number, error);
        return {
          id: account.id,
          service_number: account.service_number,
          personnel_id: account.personnel_id,
          active: Boolean(account.active),
          found_in_registry: false,
          lookup_error: true,
          full_name: account.full_name || "",
          rank: account.rank || "",
          unit: account.unit || "",
          mos: account.mos || "",
          service_status: account.dismissed ? "Звільнений" : (account.service_status || ""),
          service_note: account.service_note || "",
          updated_at: account.updated_at || ""
        };
      }
    }));

    return json({ success: true, profiles });
  } catch (error) {
    console.error("SANG admin profile list error:", error);
    return json({ message: "Не вдалося завантажити профілі особового складу." }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;

    let body;
    try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ message: "Некоректні параметри службового профілю." }, 400);

    const allowed = new Set(["accountId", "rank", "unit", "mos", "serviceStatus", "serviceNote"]);
    if (Object.keys(body).some(key => !allowed.has(key))) {
      return json({ message: "Передано недозволені поля службового профілю." }, 400);
    }

    const accountId = Number(body.accountId);
    if (!Number.isSafeInteger(accountId) || accountId < 1) return json({ message: "Оберіть коректний обліковий запис." }, 400);

    const fields = [
      ["rank", "Звання", 80],
      ["unit", "Підрозділ", 80],
      ["mos", "MOS", 40],
      ["serviceStatus", "Статус служби", 80],
      ["serviceNote", "Службова примітка", 500]
    ];
    const values = {};
    for (const [key, label, max] of fields) {
      if (typeof body[key] !== "string") return json({ message: `Поле «${label}» має бути текстовим.` }, 400);
      values[key] = body[key].trim().replace(/\s+/g, " ");
      if (values[key].length > max) return json({ message: `Поле «${label}» перевищує ${max} символів.` }, 400);
    }

    const target = await env.DB.prepare("SELECT id,role,EXISTS(SELECT 1 FROM personnel_service_records sr WHERE sr.account_id=personnel_accounts.id AND sr.record_type='history' AND sr.title='Дострокове звільнення зі служби') AS dismissed FROM personnel_accounts WHERE id=? LIMIT 1").bind(accountId).first();
    if (!target) return json({ message: "Обліковий запис не знайдено." }, 404);
    if (target.role !== "soldier") return json({ message: "Можна змінювати службові дані лише військовослужбовців." }, 403);
    if (target.dismissed && values.serviceStatus !== "Звільнений") return json({ message: "Статус звільненого військовослужбовця не можна змінити." }, 409);

    await env.DB.prepare(
      `INSERT INTO personnel_profiles (account_id,rank,unit,mos,service_status,service_note,updated_by,updated_at)
       VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(account_id) DO UPDATE SET
         rank=excluded.rank,
         unit=excluded.unit,
         mos=excluded.mos,
         service_status=excluded.service_status,
         service_note=excluded.service_note,
         updated_by=excluded.updated_by,
         updated_at=CURRENT_TIMESTAMP`
    ).bind(accountId, values.rank, values.unit, values.mos, values.serviceStatus, values.serviceNote, auth.actor.id).run();

    await env.DB.prepare(
      "INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?,'service_profile_updated',?)"
    ).bind(auth.actor.id, accountId).run();

    return json({ success: true, message: "Службові дані військовослужбовця оновлено." });
  } catch (error) {
    console.error("SANG admin profile update error:", error);
    return json({ message: "Не вдалося зберегти службові дані." }, 500);
  }
}


export async function onRequestDelete({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;
    let body;
    try {
      const rawBody = await request.text();
      body = JSON.parse(rawBody);
    } catch (error) {
      console.error("SANG personnel delete: invalid request body:", error);
      return json({ message: "Не вдалося прочитати дані запиту. Оновіть сторінку та повторіть спробу." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ message: "Некоректні параметри видалення." }, 400);
    }
    const serviceNumber = typeof body.serviceNumber === "string" ? body.serviceNumber.trim().toUpperCase() : "";
    if (!/^[A-Z0-9-]{3,32}$/.test(serviceNumber)) return json({ message: "Некоректний військовий номер." }, 400);
    const target = await env.DB.prepare("SELECT id,role FROM personnel_accounts WHERE service_number=? LIMIT 1").bind(serviceNumber).first();
    if (!target || target.role !== "soldier") return json({ message: "Військовослужбовця не знайдено або запис не можна видалити." }, 404);

    // Якщо профіль існує в Google Sheets — видаляємо його там також.
    // Якщо запису в реєстрі немає (наприклад, тестовий профіль), видаляємо лише дані сайту.
    if (env.SHEETS_API_URL && env.SHEETS_API_SECRET) {
      const registryProfile = await readRegistryProfile(env, serviceNumber);
      if (registryProfile) {
        const sheetResponse = await fetch(env.SHEETS_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret: env.SHEETS_API_SECRET, action: "delete", serviceNumber })
        });
        if (!sheetResponse.ok) return json({ message: "Google Sheets не підтвердив видалення. Обліковий запис залишено без змін." }, 502);
        const sheetResult = await sheetResponse.json();
        if (!sheetResult.success) return json({ message: sheetResult.message || "Google Sheets не підтвердив видалення. Обліковий запис залишено без змін." }, 502);
      }
    }

    await env.DB.batch([
      env.DB.prepare("DELETE FROM cabinet_sessions WHERE account_id=?").bind(target.id),
      env.DB.prepare("DELETE FROM personnel_profiles WHERE account_id=?").bind(target.id),
      env.DB.prepare("DELETE FROM personnel_accounts WHERE id=?").bind(target.id),
      env.DB.prepare("INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?,'personnel_deleted',NULL)").bind(auth.actor.id)
    ]);
    return json({ success: true, message: "Запис " + serviceNumber + " повністю видалено з реєстру та системи доступу SANG." });
  } catch (error) {
    console.error("SANG personnel delete error:", error);
    return json({ message: "Не вдалося повністю видалити військовослужбовця. Перевірте журнал помилок." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET, PATCH, DELETE" });
}
