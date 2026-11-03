import { json, readCookie, tokenDigest, COOKIE } from "./auth/_session.js";

async function getActor(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return { error: json({ message: "Запит відхилено." }, 403) };
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const actor = await env.DB.prepare(
    "SELECT a.id,a.role FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
  ).bind(await tokenDigest(token), new Date().toISOString()).first();
  return actor ? { actor } : { error: json({ message: "Сесію не знайдено." }, 401) };
}

const contractSelect = `
  SELECT c.id,c.account_id,c.start_date,c.duration_days,c.end_date,c.created_at,
    MAX(0,CAST(julianday(c.end_date)-julianday(date('now')) AS INTEGER)) AS days_left,
    CASE WHEN c.end_date < date('now') THEN 'expired' ELSE 'active' END AS status
  FROM personnel_contracts c
`;

export async function onRequestGet({ request, env }) {
  try {
    const auth = await getActor(request, env);
    if (auth.error) return auth.error;
    if (auth.actor.role === "admin") {
      const rows = await env.DB.prepare(`
        SELECT a.id AS account_id,a.service_number,p.full_name,
          c.id,c.start_date,c.duration_days,c.end_date,
          MAX(0,CAST(julianday(c.end_date)-julianday(date('now')) AS INTEGER)) AS days_left,
          CASE WHEN c.id IS NULL THEN 'missing' WHEN c.end_date < date('now') THEN 'expired' ELSE 'active' END AS status
        FROM personnel_accounts a
        LEFT JOIN personnel_profiles p ON p.account_id=a.id
        LEFT JOIN personnel_contracts c ON c.id=(
          SELECT c2.id FROM personnel_contracts c2 WHERE c2.account_id=a.id
          ORDER BY c2.start_date DESC,c2.id DESC LIMIT 1
        )
        WHERE a.role='soldier'
        ORDER BY CASE WHEN c.id IS NULL THEN 0 WHEN c.end_date < date('now') THEN 1 ELSE 2 END,
          c.end_date ASC,a.service_number ASC
      `).all();
      return json({ success:true, contracts:rows.results||[] },200,{"Cache-Control":"private, no-store"});
    }
    const current = await env.DB.prepare(contractSelect+`
      WHERE c.account_id=? ORDER BY c.start_date DESC,c.id DESC LIMIT 1
    `).bind(auth.actor.id).first();
    const history = await env.DB.prepare(contractSelect+`
      WHERE c.account_id=? ORDER BY c.start_date DESC,c.id DESC LIMIT 20
    `).bind(auth.actor.id).all();
    return json({success:true,current:current||null,history:history.results||[]},200,{"Cache-Control":"private, no-store"});
  } catch(error) {
    console.error("SANG contracts read error:",error);
    return json({message:"Не вдалося завантажити відомості про контракт."},500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth=await getActor(request,env);
    if(auth.error)return auth.error;
    if(auth.actor.role!=="admin")return json({message:"Керувати контрактами може лише командування."},403);
    let body;
    try{body=await request.json();}catch{return json({message:"Некоректний запит."},400);}
    if(!body||typeof body!=="object"||Array.isArray(body))return json({message:"Некоректні параметри контракту."},400);
    const accountId=Number(body.accountId);
    const durationDays=Number(body.durationDays);
    const startDate=typeof body.startDate==="string"?body.startDate:"";
    if(!Number.isSafeInteger(accountId)||accountId<1)return json({message:"Оберіть військовослужбовця."},400);
    if(![14,30].includes(durationDays))return json({message:"Строк контракту може становити лише 14 або 30 днів."},400);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||new Date(startDate+"T00:00:00Z").toISOString().slice(0,10)!==startDate)return json({message:"Вкажіть коректну дату початку контракту."},400);
    const target=await env.DB.prepare("SELECT id,role FROM personnel_accounts WHERE id=? LIMIT 1").bind(accountId).first();
    if(!target||target.role!=="soldier")return json({message:"Військовослужбовця не знайдено."},404);
    const endDate=new Date(Date.parse(startDate+"T00:00:00Z")+durationDays*86400000).toISOString().slice(0,10);
    const statements=[
      env.DB.prepare("INSERT INTO personnel_contracts (account_id,start_date,duration_days,end_date,created_by) VALUES (?,?,?,?,?)").bind(accountId,startDate,durationDays,endDate,auth.actor.id),
      env.DB.prepare("INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?,'contract_created',?)").bind(auth.actor.id,accountId)
    ];
    await env.DB.batch(statements);
    return json({success:true,startDate,durationDays,endDate,message:"Контракт успішно оформлено."});
  }catch(error){
    console.error("SANG contract create error:",error);
    return json({message:"Не вдалося оформити контракт."},500);
  }
}

export async function onRequest(context) {
  if(context.request.method==="GET")return onRequestGet(context);
  if(context.request.method==="POST")return onRequestPost(context);
  return json({message:"Метод не підтримується."},405,{Allow:"GET, POST"});
}
