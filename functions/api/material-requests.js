import { json, readCookie, tokenDigest, COOKIE } from "./auth/_session.js";

const ORDER_ACCESS = new Set(["SA-FZ-260005", "SA-FZ-260012"]);
const CATALOG = {
  armor: { name: "Броня", unit: "од.", category: "materials" },
  ammo: { name: "Боєприпаси", unit: "кор.", category: "materials" },
  medkit: { name: "Аптечки", unit: "од.", category: "medical" },
  radio: { name: "Радіостанції", unit: "од.", category: "materials" },
  bodycam: { name: "Бодікамери", unit: "од.", category: "materials" },
  sim: { name: "SIM-картки", unit: "од.", category: "materials" },
  fuel: { name: "Паливо", unit: "л", category: "materials" }
};

async function getActor(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin)
    return { error: json({ message: "Запит відхилено." }, 403) };
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const account = await env.DB.prepare(
    "SELECT a.id,a.role,a.faction_name,a.service_number FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
  ).bind(await tokenDigest(token), new Date().toISOString()).first();
  if (!account) return { error: json({ message: "Сесію не знайдено." }, 401) };
  if (account.role !== "faction_leader" && account.role !== "admin" && !ORDER_ACCESS.has(account.service_number)) return { error: json({ message: "Доступ до замовлень матеріалів обмежено." }, 403) };
  return { account };
}

function isSang(name) { return /sang|national\s*guard|національн.*гварді/i.test(String(name || "")); }
function isCity(name) { return /мері|мэр|mayor|city\s*hall/i.test(String(name || "")); }
function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0,10) === value;
}
function validTime(value) { return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
function parseItems(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > Object.keys(CATALOG).length) return null;
  const seen = new Set(), result = [];
  for (const item of raw) {
    const key = String(item?.key || "");
    const quantity = Number(item?.quantity);
    if (!CATALOG[key] || seen.has(key) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) return null;
    seen.add(key);
    result.push({ key, name: CATALOG[key].name, unit: CATALOG[key].unit, quantity });
  }
  return result;
}
async function notify(env, accountId, title, message, sourceKey) {
  if (!accountId) return;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO personnel_notifications (account_id,notification_type,title,message,link,source_key) VALUES (?,'system',?,?,?,?)"
  ).bind(accountId,title,message,"#material-requests",sourceKey).run();
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await getActor(request, env); if (auth.error) return auth.error;
    const canCreate = auth.account.role === "admin" || auth.account.role === "faction_leader" || ORDER_ACCESS.has(auth.account.service_number);
    const faction = auth.account.role === "admin" ? "SANG" : (auth.account.faction_name || "");
    const reviewerSang = isSang(faction), reviewerCity = auth.account.role !== "admin" && isCity(faction);
    let sql = `SELECT r.*, a.service_number AS requester_service_number
      FROM material_requests r JOIN personnel_accounts a ON a.id=r.requester_account_id`;
    let rows;
    if (reviewerSang || reviewerCity) {
      rows = await env.DB.prepare(sql + " ORDER BY CASE WHEN r.status IN ('pending','coordination') THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100").all();
    } else {
      rows = await env.DB.prepare(sql + " WHERE r.requester_account_id=? ORDER BY r.created_at DESC LIMIT 100").bind(auth.account.id).all();
    }
    return json({ success:true, catalog:CATALOG, requests:rows.results || [], reviewerSang, reviewerCity, canCreate, faction });
  } catch (error) {
    console.error("SANG material requests list:",error);
    return json({ message:"Не вдалося завантажити замовлення матеріалів." },500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await getActor(request, env); if (auth.error) return auth.error;
    let body; try { body = await request.json(); } catch { return json({message:"Некоректний запит."},400); }
    const action = String(body?.action || "create");
    if (action === "create") {
      if (auth.account.role !== "admin" && auth.account.role !== "faction_leader" && !ORDER_ACCESS.has(auth.account.service_number)) return json({message:"Створювати замовлення можуть лише уповноважені керівники фракцій."},403);
      const requesterFaction = auth.account.role === "admin" ? "SANG" : (auth.account.faction_name || "Невідома фракція");
      const requesterIsSang = isSang(requesterFaction);
      const category = String(body.category || "");
      const items = category === "materials"
        ? [{ key:"materials", name:"Матеріали", unit:"category", quantity:1 }]
        : category === "medical"
          ? [{ key:"medical", name:"Медичні матеріали", unit:"category", quantity:1 }]
          : null;
      const requestedDate = body.requestedDate, requestedTime = body.requestedTime;
      const comment = typeof body.comment === "string" ? body.comment.trim().slice(0,1000) : "";
      if (!items) return json({message:"Оберіть категорію та вкажіть кількість від 1 до 100000."},400);
      if (!validDate(requestedDate) || requestedDate < new Date().toISOString().slice(0,10) || !validTime(requestedTime))
        return json({message:"Вкажіть коректну майбутню дату та час."},400);
      const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM material_requests").first();
      const number = "MR-" + new Date().getFullYear() + "-" + String(Number(count?.total || 0) + 1).padStart(4,"0");
      const inserted = await env.DB.prepare(
        "INSERT INTO material_requests (request_number,requester_account_id,requester_faction,items_json,comment,requested_date,requested_time,sang_status,sang_date,sang_time) VALUES (?,?,?,?,?,?,?,?,?,?)"
      ).bind(number,auth.account.id,requesterFaction,JSON.stringify(items),comment,requestedDate,requestedTime,requesterIsSang ? "approved" : "pending",requesterIsSang ? requestedDate : null,requesterIsSang ? requestedTime : null).run();
      const id = inserted.meta?.last_row_id;
      const leaders = await env.DB.prepare("SELECT id,faction_name FROM personnel_accounts WHERE role='faction_leader' AND active=1").all();
      for (const leader of leaders.results || []) {
        if ((requesterIsSang && isCity(leader.faction_name)) || (!requesterIsSang && (isSang(leader.faction_name) || isCity(leader.faction_name))))
          await notify(env,leader.id,"Нове замовлення матеріалів",number+" · "+requesterFaction+" · "+requestedDate+" "+requestedTime,"material-request:"+id+":new");
      }
      await env.DB.prepare("INSERT INTO cabinet_audit_log(actor_account_id,action) VALUES (?,'material_request_created')").bind(auth.account.id).run();
      return json({success:true,id,requestNumber:number,message:"Замовлення надіслано керівникам SANG та мерії."},201);
    }

    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id < 1) return json({message:"Некоректний номер заявки."},400);
    const current = await env.DB.prepare("SELECT * FROM material_requests WHERE id=? LIMIT 1").bind(id).first();
    if (!current) return json({message:"Заявку не знайдено."},404);
    const sang = auth.account.role === "admin" || isSang(auth.account.faction_name), city = auth.account.role !== "admin" && isCity(auth.account.faction_name);
    if (!sang && !city) return json({message:"Рішення доступне лише керівникам SANG та мерії."},403);
    const side = sang ? "sang" : "city";
    const decision = String(body.decision || "");
    if (!["approved","proposed","rejected"].includes(decision)) return json({message:"Оберіть рішення."},400);
    const date = body.date || current.requested_date, time = body.time || current.requested_time;
    const comment = typeof body.comment === "string" ? body.comment.trim().slice(0,1000) : "";
    if ((decision === "approved" || decision === "proposed") && (!validDate(date) || !validTime(time)))
      return json({message:"Вкажіть коректну дату та час."},400);
    const prefix = side === "sang" ? "sang" : "city";
    const nextDate = decision === "rejected" ? null : date;
    const nextTime = decision === "rejected" ? null : time;
    await env.DB.prepare(
      `UPDATE material_requests SET ${prefix}_status=?,${prefix}_date=?,${prefix}_time=?,${prefix}_comment=?,${prefix}_reviewer_id=?,${prefix}_reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(decision,nextDate,nextTime,comment,auth.account.id,id).run();
    const updated = await env.DB.prepare("SELECT sang_status,sang_date,sang_time,city_status,city_date,city_time FROM material_requests WHERE id=?").bind(id).first();
    let status = "coordination";
    if (updated.sang_status === "rejected" || updated.city_status === "rejected") status = "rejected";
    else if (current.requester_faction && isSang(current.requester_faction) && updated.city_status === "approved" && updated.city_date === updated.sang_date && updated.city_time === updated.sang_time) status = "approved";
    else if (updated.sang_status === "approved" && updated.city_status === "approved" && updated.sang_date === updated.city_date && updated.sang_time === updated.city_time) status = "approved";
    else if (updated.sang_status !== "pending" && updated.city_status !== "pending") status = "coordination";
    else status = "pending";
    await env.DB.prepare("UPDATE material_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,id).run();
    const title = decision === "approved" ? "Замовлення підтверджено" : decision === "proposed" ? "Запропоновано іншу дату" : "Замовлення відхилено";
    await notify(env,current.requester_account_id,title,current.request_number+" · "+(decision === "rejected" ? comment || "Без коментаря" : date+" "+time),"material-request:"+id+":"+side+":"+Date.now());
    await env.DB.prepare("INSERT INTO cabinet_audit_log(actor_account_id,action,target_account_id) VALUES (?,'material_request_reviewed',?)").bind(auth.account.id,current.requester_account_id).run();
    return json({success:true,status,message:"Рішення збережено."});
  } catch(error) {
    console.error("SANG material request save:",error);
    return json({message:"Не вдалося зберегти замовлення або рішення."},500);
  }
}
export async function onRequest(context) {
  if(context.request.method==="GET") return onRequestGet(context);
  if(context.request.method==="POST") return onRequestPost(context);
  return json({message:"Метод не підтримується."},405,{Allow:"GET, POST"});
}
