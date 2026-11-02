import { json, readCookie, tokenDigest, COOKIE } from "../auth/_session.js";

async function requireAdmin(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return { error: json({ message: "Запит відхилено." }, 403) };
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const actor = await env.DB.prepare("SELECT a.id,a.role FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1").bind(await tokenDigest(token), new Date().toISOString()).first();
  if (!actor || actor.role !== "admin") return { error: json({ message: "Недостатньо прав." }, 403) };
  return { actor };
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;
    let body;
    try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
    const factionName = typeof body.factionName === "string" ? body.factionName.trim().replace(/\s+/g, " ") : "";
    const contactName = typeof body.contactName === "string" ? body.contactName.trim().replace(/\s+/g, " ") : "";
    if (factionName.length < 2 || factionName.length > 80 || contactName.length > 100) return json({ message: "Перевірте назву фракції та ім’я керівника." }, 400);
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    await env.DB.prepare("INSERT INTO faction_lookup_invites(faction_name,contact_name,invite_token_hash,expires_at,created_by) VALUES(?,?,?,?,?)")
      .bind(factionName, contactName, await tokenDigest(token), expiresAt, auth.actor.id).run();
    await env.DB.prepare("INSERT INTO cabinet_audit_log(actor_account_id,action) VALUES (?,'faction_invite_created')").bind(auth.actor.id).run();
    const origin = new URL(request.url).origin;
    return json({ success: true, inviteUrl: origin + "/cabinet/faction/register/?token=" + token, expiresAt, message: "Одноразове запрошення створено. Передайте посилання керівнику фракції особисто." }, 201);
  } catch (error) {
    console.error("SANG faction invite create:", error);
    return json({ message: "Не вдалося створити запрошення." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "POST" });
}
