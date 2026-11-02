import { json, readCookie, tokenDigest, COOKIE } from "../auth/_session.js";

async function requireAdmin(request,env) {
  if(!env.DB) return {error:json({message:"База даних недоступна."},503)};
  if(request.headers.get("Origin") && request.headers.get("Origin")!==new URL(request.url).origin) return {error:json({message:"Запит відхилено."},403)};
  const token=readCookie(request,COOKIE);
  if(!token || token.length>128) return {error:json({message:"Потрібна авторизація."},401)};
  const actor=await env.DB.prepare("SELECT a.id,a.role FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1").bind(await tokenDigest(token),new Date().toISOString()).first();
  if(!actor || actor.role!=="admin") return {error:json({message:"Недостатньо прав."},403)};
  return {actor};
}
export async function onRequestGet({request,env}) {
  try {
    const auth=await requireAdmin(request,env); if(auth.error)return auth.error;
    const result=await env.DB.prepare("SELECT id,service_number,personnel_id,full_name,status,created_at FROM cabinet_registration_requests WHERE status='pending' ORDER BY created_at ASC").all();
    return json({success:true,requests:result.results||[]});
  } catch(error) { console.error("SANG registrations list:",error); return json({message:"Не вдалося завантажити заявки."},500); }
}
export async function onRequestPatch({request,env}) {
  let auth; try{auth=await requireAdmin(request,env);}catch{return json({message:"Не вдалося перевірити права."},500);} if(auth.error)return auth.error;
  let body;try{body=await request.json();}catch{return json({message:"Некоректний запит."},400);}
  const requestId=Number(body.requestId), decision=body.decision;
  const note=typeof body.note==="string"?body.note.trim().slice(0,300):"";
  if(!Number.isSafeInteger(requestId)||requestId<1||!["approve","reject"].includes(decision)) return json({message:"Некоректні параметри рішення."},400);
  try {
    const pending=await env.DB.prepare("SELECT * FROM cabinet_registration_requests WHERE id=? AND status='pending' LIMIT 1").bind(requestId).first();
    if(!pending)return json({message:"Заявку не знайдено або її вже розглянуто."},404);
    if(decision==="reject") {
      await env.DB.prepare("UPDATE cabinet_registration_requests SET status='rejected',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE id=? AND status='pending'").bind(auth.actor.id,note,requestId).run();
      await env.DB.prepare("INSERT INTO cabinet_audit_log(actor_account_id,action) VALUES (?,'registration_rejected')").bind(auth.actor.id).run();
      return json({success:true,message:"Заявку відхилено."});
    }
    const existing=await env.DB.prepare("SELECT id FROM personnel_accounts WHERE service_number=? OR personnel_id=? LIMIT 1").bind(pending.service_number,pending.personnel_id).first();
    if(existing)return json({message:"Для цього військовослужбовця вже створено обліковий запис. Заявку не активовано."},409);
    const inserted=await env.DB.prepare("INSERT INTO personnel_accounts(service_number,password_hash,password_salt,password_iterations,personnel_id,role,active,must_change_password) VALUES (?,?,?,?,?,'soldier',1,0)")
      .bind(pending.service_number,pending.password_hash,pending.password_salt,pending.password_iterations,pending.personnel_id).run();
    const accountId=inserted.meta?.last_row_id;
    await env.DB.prepare("INSERT INTO personnel_profiles(account_id,full_name) VALUES (?,?)").bind(accountId,pending.full_name).run();
    await env.DB.prepare("UPDATE cabinet_registration_requests SET status='approved',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE id=? AND status='pending'").bind(auth.actor.id,note,requestId).run();
    await env.DB.prepare("INSERT INTO cabinet_audit_log(actor_account_id,action,target_account_id) VALUES (?,'registration_approved',?)").bind(auth.actor.id,accountId).run();
    return json({success:true,message:"Заявку підтверджено. Військовослужбовець може увійти до кабінету."});
  } catch(error) {
    if(String(error).includes("UNIQUE"))return json({message:"Обліковий запис із такими даними вже існує."},409);
    console.error("SANG registration review:",error); return json({message:"Не вдалося обробити заявку."},500);
  }
}
export async function onRequest(context) {
  if(context.request.method==="GET")return onRequestGet(context);
  if(context.request.method==="PATCH")return onRequestPatch(context);
  return json({message:"Метод не підтримується."},405,{Allow:"GET, PATCH"});
}