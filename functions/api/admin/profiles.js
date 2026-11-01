import { json, readCookie, tokenDigest, COOKIE } from "../auth/_session.js";

async function requireAdmin(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) {
    return { error: json({ message: "Запит відхилено." }, 403) };
  }
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const digest = await tokenDigest(token);
  const actor = await env.DB.prepare(
    "SELECT a.id, a.role FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
  ).bind(digest, new Date().toISOString()).first();
  if (!actor || actor.role !== "admin") return { error: json({ message: "Недостатньо прав." }, 403) };
  return { actor };
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;
    if (!env.SHEETS_API_URL || !env.SHEETS_API_SECRET) {
      return json({ message: "Інтеграцію з реєстром не налаштовано." }, 503);
    }

    const accounts = await env.DB.prepare(
      "SELECT id, service_number, personnel_id, active FROM personnel_accounts WHERE role='soldier' ORDER BY service_number ASC"
    ).all();

    const profiles = await Promise.all((accounts.results || []).map(async account => {
      try {
        const response = await fetch(env.SHEETS_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: env.SHEETS_API_SECRET,
            action: "profile",
            serviceNumber: account.service_number
          })
        });
        if (!response.ok) throw new Error("Sheets API HTTP " + response.status);
        const result = await response.json();
        const row = result.success && result.profile ? result.profile : null;
        return {
          id: account.id,
          service_number: account.service_number,
          personnel_id: account.personnel_id,
          active: Boolean(account.active),
          found_in_registry: Boolean(row),
          full_name: row?.["ПІБ"] || "",
          rank: row?.["Звання"] || "",
          unit: row?.["Підрозділ"] || "",
          mos: row?.["MOS"] || "",
          service_status: row?.["Статус служби"] || "",
          updated_at: row?.["Останнє оновлення"] || ""
        };
      } catch (error) {
        console.error("SANG admin Sheets profile read error:", account.service_number, error);
        return {
          id: account.id,
          service_number: account.service_number,
          personnel_id: account.personnel_id,
          active: Boolean(account.active),
          found_in_registry: false,
          lookup_error: true
        };
      }
    }));

    return json({ success: true, profiles });
  } catch (error) {
    console.error("SANG admin profile list error:", error);
    return json({ message: "Не вдалося завантажити профілі з реєстру." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PATCH" || context.request.method === "POST" || context.request.method === "PUT" || context.request.method === "DELETE") {
    return json({ message: "Зміна службових даних через сайт вимкнена. Джерело даних — реєстр Google Sheets." }, 405, { Allow: "GET" });
  }
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET" });
}
