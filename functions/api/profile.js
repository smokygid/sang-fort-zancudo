import { json, readCookie, tokenDigest, COOKIE } from "./auth/_session.js";

async function currentAccount(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) {
    return { error: json({ message: "Запит відхилено." }, 403) };
  }

  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };

  const account = await env.DB.prepare(
    `SELECT a.id, a.service_number, a.personnel_id, a.role
     FROM cabinet_sessions s
     JOIN personnel_accounts a ON a.id=s.account_id
     WHERE s.id=? AND s.expires_at>? AND a.active=1
     LIMIT 1`
  ).bind(await tokenDigest(token), new Date().toISOString()).first();

  return account ? { account } : { error: json({ message: "Сесію не знайдено." }, 401) };
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
    const auth = await currentAccount(request, env);
    if (auth.error) return auth.error;

    const [saved, registry] = await Promise.all([
      env.DB.prepare("SELECT full_name,age,contact,rank,unit,mos,service_status,service_note,updated_at FROM personnel_profiles WHERE account_id=? LIMIT 1")
        .bind(auth.account.id).first(),
      readRegistryProfile(env, auth.account.service_number).catch(error => {
        console.error("SANG Sheets profile read error:", error);
        return null;
      })
    ]);

    if (!saved && !registry) return json({ message: "Профіль не знайдено в реєстрі SANG." }, 404);
    const row = registry || {};

    return json({
      success: true,
      profile: {
        serviceNumber: auth.account.service_number,
        fullName: saved?.full_name || row["ПІБ"] || "",
        age: saved?.age ?? null,
        contact: saved?.contact || "",
        rank: saved?.rank || row["Звання"] || "",
        unit: saved?.unit || row["Підрозділ"] || "",
        mos: saved?.mos || row["MOS"] || "",
        serviceStatus: saved?.service_status || row["Статус служби"] || "",
        serviceNote: saved?.service_note || "",
        updatedAt: saved?.updated_at || row["Останнє оновлення"] || null
      }
    }, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    console.error("SANG profile read error:", error);
    return json({ message: "Не вдалося завантажити профіль." }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = await currentAccount(request, env);
    if (auth.error) return auth.error;

    let body;
    try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ message: "Некоректні параметри профілю." }, 400);

    const allowed = new Set(["fullName", "age", "contact"]);
    if (Object.keys(body).some(key => !allowed.has(key))) {
      return json({ message: "Дозволено змінювати лише ПІБ, вік та контактні дані." }, 403);
    }

    const fullName = typeof body.fullName === "string"
      ? body.fullName.normalize("NFKC").trim().replace(/\s+/g, " ")
      : "";
    const contact = typeof body.contact === "string"
      ? body.contact.trim().replace(/\s+/g, " ")
      : "";
    const ageText = body.age === null || body.age === undefined ? "" : String(body.age).trim();
    const age = ageText === "" ? null : Number(ageText);

    if (fullName.length < 3 || fullName.length > 100 || !/^[\p{L}\p{M}'’ -]+$/u.test(fullName)) {
      return json({ message: "Вкажіть коректне ПІБ (від 3 до 100 символів)." }, 400);
    }
    if (age !== null && (!Number.isInteger(age) || age < 16 || age > 100)) {
      return json({ message: "Вік має бути цілим числом від 16 до 100 або порожнім." }, 400);
    }
    if (contact.length > 120) return json({ message: "Контактні дані не повинні перевищувати 120 символів." }, 400);

    await env.DB.prepare(
      `INSERT INTO personnel_profiles (account_id,full_name,age,contact,updated_by,updated_at)
       VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(account_id) DO UPDATE SET
         full_name=excluded.full_name,
         age=excluded.age,
         contact=excluded.contact,
         updated_by=excluded.updated_by,
         updated_at=CURRENT_TIMESTAMP`
    ).bind(auth.account.id, fullName, age, contact, auth.account.id).run();

    await env.DB.prepare(
      "INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?,'personal_profile_updated',?)"
    ).bind(auth.account.id, auth.account.id).run();

    return json({ success: true, message: "Особисті дані успішно збережено." });
  } catch (error) {
    console.error("SANG personal profile update error:", error);
    return json({ message: "Не вдалося зберегти особисті дані." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET, PATCH" });
}
