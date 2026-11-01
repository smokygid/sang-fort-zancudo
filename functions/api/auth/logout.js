import { json, readCookie, tokenDigest, COOKIE } from "./_session.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ message: "Сервіс кабінету недоступний." }, 503);
  const token = readCookie(request, COOKIE);
  try {
    if (token && token.length <= 128) {
      const digest = await tokenDigest(token);
      await env.DB.prepare("DELETE FROM cabinet_sessions WHERE id = ?").bind(digest).run();
    }
    return json({ success: true }, 200, {
      "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
    });
  } catch {
    return json({ message: "Не вдалося завершити сесію." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return json({ message: "Метод не підтримується." }, 405, { Allow: "POST" });
  }
  return onRequestPost(context);
}
