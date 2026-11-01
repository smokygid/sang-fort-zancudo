
import { json } from "../auth/_session.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOOTSTRAP_SECRET) {
    return json({
      success: false,
      message: "DB или BOOTSTRAP_SECRET не найдены."
    }, 503);
  }

  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ success: false, message: "Запрос отклонён." }, 403);
  }

  const suppliedSecret = request.headers.get("X-Bootstrap-Secret");

  if (!suppliedSecret || suppliedSecret !== env.BOOTSTRAP_SECRET) {
    return json({ success: false, message: "Секрет не совпадает." }, 403);
  }

  return json({
    success: true,
    dbConfigured: true,
    secretAccepted: true,
    message: "DB и BOOTSTRAP_SECRET доступны."
  }, 200);
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return json(
      { message: "Метод не поддерживается." },
      405,
      { Allow: "POST" }
    );
  }

  return onRequestPost(context);
}
