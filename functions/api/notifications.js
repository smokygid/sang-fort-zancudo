import { json, readCookie, tokenDigest, COOKIE } from "./auth/_session.js";

async function getActor(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return { error: json({ message: "Запит відхилено." }, 403) };
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const actor = await env.DB.prepare(
    "SELECT a.id,a.role FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
  ).bind(await tokenDigest(token), new Date().toISOString()).first();
  return actor ? { actor } : { error: json({ message: "Потрібна авторизація." }, 401) };
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await getActor(request, env);
    if (auth.error) return auth.error;
    const rows = await env.DB.prepare(
      `SELECT id,notification_type,title,message,link,is_read,created_at,read_at
       FROM personnel_notifications WHERE account_id=?
       ORDER BY is_read ASC,created_at DESC,id DESC LIMIT 50`
    ).bind(auth.actor.id).all();
    const unread = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM personnel_notifications WHERE account_id=? AND is_read=0"
    ).bind(auth.actor.id).first();
    return json({ success:true, notifications:rows.results||[], unreadCount:Number(unread?.total||0) },200,{"Cache-Control":"private, no-store"});
  } catch(error) {
    console.error("SANG notifications read error:",error);
    return json({message:"Не вдалося завантажити сповіщення."},500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth=await getActor(request,env);
    if(auth.error)return auth.error;
    let body;
    try{body=await request.json();}catch{return json({message:"Некоректний запит."},400);}
    if(body?.markAll===true){
      await env.DB.prepare("UPDATE personnel_notifications SET is_read=1,read_at=CURRENT_TIMESTAMP WHERE account_id=? AND is_read=0").bind(auth.actor.id).run();
      return json({success:true,markedAll:true});
    }
    const id=Number(body?.notificationId);
    if(!Number.isSafeInteger(id)||id<1)return json({message:"Некоректний номер сповіщення."},400);
    const result=await env.DB.prepare(
      "UPDATE personnel_notifications SET is_read=1,read_at=CURRENT_TIMESTAMP WHERE id=? AND account_id=?"
    ).bind(id,auth.actor.id).run();
    if(!result.meta?.changes)return json({message:"Сповіщення не знайдено."},404);
    return json({success:true,notificationId:id});
  }catch(error){
    console.error("SANG notification update error:",error);
    return json({message:"Не вдалося оновити статус сповіщення."},500);
  }
}

export async function onRequest(context) {
  if(context.request.method==="GET")return onRequestGet(context);
  if(context.request.method==="POST")return onRequestPost(context);
  return json({message:"Метод не підтримується."},405,{Allow:"GET, POST"});
}
