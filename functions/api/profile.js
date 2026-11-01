
import { json, readCookie, tokenDigest, COOKIE } from "./auth/_session.js";

async function currentAccount(request, env) {
  if (!env.DB) {
    return { error: json({ message: "База даних недоступна." }, 503) };
  }

  if (
    request.headers.get("Origin") &&
    request.headers.get("Origin") !== new URL(request.url).origin
  ) {
    return { error: json({ message: "Запит відхилено." }, 403) };
  }

  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) {
    return { error: json({ message: "Потрібна авторизація." }, 401) };
  }

  const digest = await tokenDigest(token);

  const account = await env.DB.prepare(
    `SELECT a.id, a.service_number, a.personnel_id, a.role
     FROM cabinet_sessions s
     JOIN personnel_accounts a ON a.id=s.account_id
     WHERE s.id=? AND s.expires_at>? AND a.active=1
     LIMIT 1`
  ).bind(digest, new Date().toISOString()).first();

  return account
    ? { account }
    : { error: json({ message: "Сесію не знайдено." }, 401) };
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await currentAccount(request, env);
    if (auth.error) return auth.error;

    if (!env.SHEETS_API_URL || !env.SHEETS_API_SECRET) {
      return json({ message: "Інтеграцію з реєстром не налаштовано." }, 503);
    }

    const response = await fetch(env.SHEETS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.SHEETS_API_SECRET,
        action: "profile",
        serviceNumber: auth.account.service_number
      })
    });

    if (!response.ok) {
      console.error("SANG Sheets API HTTP error:", response.status);
      return json({ message: "Не вдалося отримати дані реєстру." }, 502);
    }

    const result = await response.json();

    if (!result.success || !result.profile) {
      return json({ message: "Профіль не знайдено в реєстрі SANG." }, 404);
    }

    const row = result.profile;

    return json({
      success: true,
      profile: {
        serviceNumber: row["Військовий №"] || "",
        fullName: row["ПІБ"] || "",
        rank: row["Звання"] || "",
        unit: row["Підрозділ"] || "",
        mos: row["MOS"] || "",
        serviceStatus: row["Статус служби"] || "",
        updatedAt: row["Останнє оновлення"] || null
      }
    });
  } catch (error) {
    console.error("SANG Sheets profile read error:", error);
    return json({ message: "Не вдалося завантажити профіль." }, 500);
  }
}

export async function onRequest({ request, env }) {
  if (request.method === "GET") return onRequestGet({ request, env });

  return json(
    { message: "Метод не підтримується. Дані доступні лише для читання." },
    405,
    { Allow: "GET" }
  );
}
