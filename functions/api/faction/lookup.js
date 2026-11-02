import { json, readCookie, tokenDigest, COOKIE } from "../auth/_session.js";

async function currentLeader(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (!env.SHEETS_API_URL || !env.SHEETS_API_SECRET) return { error: json({ message: "Реєстр SANG тимчасово недоступний." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return { error: json({ message: "Запит відхилено." }, 403) };
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const account = await env.DB.prepare("SELECT a.id,a.role,a.faction_name FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1")
    .bind(await tokenDigest(token), new Date().toISOString()).first();
  if (!account || account.role !== "faction_leader" || !account.faction_name) return { error: json({ message: "Пошук доступний лише підтвердженим керівникам фракцій." }, 403) };
  return { account };
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await currentLeader(request, env);
    if (auth.error) return auth.error;
    let body;
    try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
    const query = typeof body.name === "string" ? body.name.trim().replace(/\\s+/g, " ") : "";
    if (query.length < 3 || query.length > 100) return json({ message: "Введіть щонайменше 3 символи ПІБ." }, 400);

    // Використовуємо реєстр Google Sheets як єдине джерело службових відомостей.
    const response = await fetch(env.SHEETS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.SHEETS_API_SECRET, action: "roster" })
    });
    if (!response.ok) return json({ message: "Не вдалося отримати дані реєстру SANG." }, 502);
    const registry = await response.json();
    if (!registry.success || !Array.isArray(registry.soldiers)) return json({ message: "Реєстр повернув некоректну відповідь." }, 502);

    const normalized = query.normalize("NFKC").toLocaleLowerCase("uk-UA");
    const matches = registry.soldiers.filter(person => {
      const name = String(person.fullName || "").normalize("NFKC").toLocaleLowerCase("uk-UA");
      return name.includes(normalized);
    }).slice(0, 10).map(person => ({
      fullName: String(person.fullName || "—"),
      rank: String(person.rank || "Не зазначено"),
      unit: String(person.unit || "Не зазначено"),
      serviceStatus: String(person.serviceStatus || "Не зазначено")
    }));

    await env.DB.prepare("INSERT INTO faction_lookup_log(actor_account_id,query_name,result_count) VALUES(?,?,?)")
      .bind(auth.account.id, query, matches.length).run();
    await env.DB.prepare("INSERT INTO cabinet_audit_log(actor_account_id,action) VALUES (?,'faction_personnel_lookup')").bind(auth.account.id).run();
    return json({ success: true, faction: auth.account.faction_name, results: matches });
  } catch (error) {
    console.error("SANG faction lookup:", error);
    return json({ message: "Не вдалося виконати пошук." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "POST" });
}
