import { json, readCookie, tokenDigest, COOKIE } from "./_session.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ message: "Сервіс кабінету недоступний." }, 503);
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return json({ authenticated: false }, 401);

  try {
    const digest = await tokenDigest(token);
    const session = await env.DB.prepare(
      `SELECT a.service_number, a.personnel_id, a.role, a.must_change_password
       FROM cabinet_sessions s
       JOIN personnel_accounts a ON a.id = s.account_id
       WHERE s.id = ? AND s.expires_at > ? AND a.active = 1
       LIMIT 1`
    ).bind(digest, new Date().toISOString()).first();

    if (!session) return json({ authenticated: false }, 401);
    return json({
      authenticated: true,
      soldier: {
        serviceNumber: session.service_number,
        personnelId: session.personnel_id,
        role: session.role,
        mustChangePassword: session.must_change_password === 1
      }
    });
  } catch {
    return json({ message: "Не вдалося перевірити сесію." }, 500);
  }
}
