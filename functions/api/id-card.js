import { json, readCookie, tokenDigest, COOKIE } from "./auth/_session.js";

async function currentAccount(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) {
    return { error: json({ message: "Запит відхилено." }, 403) };
  }
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const account = await env.DB.prepare(
    `SELECT a.id,a.service_number,a.personnel_id,a.role,a.active
     FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id
     WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1`
  ).bind(await tokenDigest(token), new Date().toISOString()).first();
  return account ? { account } : { error: json({ message: "Сесію не знайдено." }, 401) };
}

async function readRegistryProfile(env, serviceNumber) {
  if (!env.SHEETS_API_URL || !env.SHEETS_API_SECRET) throw new Error("Інтеграцію з реєстром не налаштовано.");
  const response = await fetch(env.SHEETS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.SHEETS_API_SECRET, action: "profile", serviceNumber })
  });
  if (!response.ok) throw new Error("Sheets API HTTP " + response.status);
  const result = await response.json();
  return result.success && result.profile ? result.profile : null;
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signServiceNumber(serviceNumber, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(serviceNumber));
  return toBase64Url(new Uint8Array(signature));
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await currentAccount(request, env);
    if (auth.error) return auth.error;
    if (auth.account.role !== "soldier") return json({ message: "Електронний військовий квиток доступний лише військовослужбовцям." }, 403);

    const [saved, registry, contract] = await Promise.all([
      env.DB.prepare(
        "SELECT full_name,rank,unit,mos,service_status FROM personnel_profiles WHERE account_id=? LIMIT 1"
      ).bind(auth.account.id).first(),
      readRegistryProfile(env, auth.account.service_number),
      env.DB.prepare(
        "SELECT start_date,end_date,duration_days FROM personnel_contracts WHERE account_id=? ORDER BY start_date DESC,id DESC LIMIT 1"
      ).bind(auth.account.id).first()
    ]);

    if (!registry) return json({ message: "Військовослужбовця не знайдено в чинному реєстрі SANG. Зверніться до командування." }, 404);

    const card = {
      serviceNumber: auth.account.service_number,
      personnelId: auth.account.personnel_id,
      fullName: saved?.full_name || registry["ПІБ"] || "",
      rank: saved?.rank || registry["Звання"] || "",
      unit: saved?.unit || registry["Підрозділ"] || "",
      mos: saved?.mos || registry["MOS"] || "",
      serviceStatus: saved?.service_status || registry["Статус служби"] || "",
      contractStart: contract?.start_date || "",
      contractEnd: contract?.end_date || "",
      contractDuration: contract?.duration_days || null,
      issuedAt: new Date().toISOString()
    };
    const signature = await signServiceNumber(card.serviceNumber, env.SHEETS_API_SECRET);
    const token = card.serviceNumber + "." + signature;
    const verifyUrl = new URL("/verify/?token=" + encodeURIComponent(token), new URL(request.url).origin).toString();

    return json({ success: true, card, verifyUrl }, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    console.error("SANG electronic ID card error:", error);
    return json({ message: "Не вдалося сформувати електронний військовий квиток." }, 500);
  }
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return json({ message: "Метод не підтримується." }, 405, { Allow: "GET" });
  return onRequestGet({ request, env });
}
