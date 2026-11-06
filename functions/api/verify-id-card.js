import { json } from "./auth/_session.js";

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function decryptServiceNumber(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]{16}$/.test(parts[0]) || !/^[A-Za-z0-9_-]{20,100}$/.test(parts[1])) return "";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
    const iv = fromBase64Url(parts[0]);
    const encrypted = fromBase64Url(parts[1]);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    const serviceNumber = new TextDecoder().decode(decrypted);
    return /^[A-Z0-9-]{3,32}$/.test(serviceNumber) ? serviceNumber : "";
  } catch {
    return "";
  }
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB || !env.SHEETS_API_URL || !env.SHEETS_API_SECRET) {
      return json({ valid: false, message: "Сервіс перевірки тимчасово недоступний." }, 503);
    }
    const token = new URL(request.url).searchParams.get("token") || "";
    if (token.length > 180) return json({ valid: false, message: "QR-код або посилання перевірки некоректне." }, 400);
    const serviceNumber = await decryptServiceNumber(token, env.SHEETS_API_SECRET);
    if (!serviceNumber) {
      return json({ valid: false, message: "QR-код недійсний або пошкоджений." }, 403);
    }

    const account = await env.DB.prepare(
      `SELECT a.service_number,a.personnel_id,a.active,a.role,
        p.full_name,p.rank,p.unit,p.mos,p.service_status
       FROM personnel_accounts a
       LEFT JOIN personnel_profiles p ON p.account_id=a.id
       WHERE a.service_number=? LIMIT 1`
    ).bind(serviceNumber).first();

    if (!account || !["soldier", "admin"].includes(account.role) || account.active !== 1) {
      return json({ valid: false, message: "Документ недійсний: обліковий запис неактивний або відсутній." }, 200);
    }

    const registryResponse = await fetch(env.SHEETS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.SHEETS_API_SECRET, action: "profile", serviceNumber })
    });
    if (!registryResponse.ok) throw new Error("Sheets API HTTP " + registryResponse.status);
    const registry = await registryResponse.json();
    if (!registry.success || !registry.profile) {
      return json({ valid: false, message: "Документ недійсний: запис відсутній у реєстрі SANG." }, 200);
    }

    const row = registry.profile;
    return json({
      valid: true,
      verifiedAt: new Date().toISOString(),
      card: {
        serviceNumber,
        fullName: account.full_name || row["ПІБ"] || "",
        rank: account.rank || row["Звання"] || "",
        unit: account.unit || row["Підрозділ"] || "",
        mos: account.mos || row["MOS"] || "",
        serviceStatus: account.service_status || row["Статус служби"] || ""
      }
    }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("SANG ID card verification error:", error);
    return json({ valid: false, message: "Не вдалося перевірити документ. Спробуйте пізніше." }, 500);
  }
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return json({ valid: false, message: "Метод не підтримується." }, 405, { Allow: "GET" });
  return onRequestGet({ request, env });
}
