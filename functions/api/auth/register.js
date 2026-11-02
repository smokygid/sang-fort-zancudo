import { json } from "./_session.js";

const ITERATIONS = 100000;
function b64(bytes) { let s=""; for (const b of bytes) s+=String.fromCharCode(b); return btoa(s); }
async function hashPassword(password, salt) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:ITERATIONS},key,256);
  return b64(new Uint8Array(bits));
}
function normalizeName(value) { return String(value||"").normalize("NFKC").toLocaleLowerCase("uk-UA").replace(/\s+/g," ").trim(); }

export async function onRequestPost({request,env}) {
  if (!env.DB || !env.SHEETS_API_URL || !env.SHEETS_API_SECRET) return json({message:"Реєстрація тимчасово недоступна."},503);
  if (request.headers.get("Origin") && request.headers.get("Origin")!==new URL(request.url).origin) return json({message:"Запит відхилено."},403);
  let body; try { body=await request.json(); } catch { return json({message:"Некоректний запит."},400); }
  const serviceNumber=typeof body.serviceNumber==="string"?body.serviceNumber.trim().toUpperCase():"";
  const fullName=typeof body.fullName==="string"?body.fullName.trim().replace(/\s+/g," "):"";
  const password=typeof body.password==="string"?body.password:"";
  if (!/^[A-Z0-9-]{3,32}$/.test(serviceNumber) || fullName.length<5 || fullName.length>100 || !/^[\p{L}\p{M}'’ -]+$/u.test(fullName) || password.length<10 || password.length>128) {
    return json({message:"Перевірте військовий номер, ПІБ та пароль (не менше 10 символів)."},400);
  }
  try {
    const response=await fetch(env.SHEETS_API_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({secret:env.SHEETS_API_SECRET,action:"roster"})});
    if (!response.ok) return json({message:"Не вдалося перевірити реєстр SANG."},502);
    const data=await response.json();
    if (!data.success || !Array.isArray(data.soldiers)) return json({message:"Реєстр повернув некоректну відповідь."},502);
    const person=data.soldiers.find(p=>String(p.serviceNumber||"").trim().toUpperCase()===serviceNumber);
    if (!person || normalizeName(person.fullName)!==normalizeName(fullName)) return json({message:"Не вдалося підтвердити військовий номер і ПІБ за реєстром. Перевірте дані або зверніться до штабу."},404);
    const status=String(person.serviceStatus||"").toLocaleLowerCase("uk-UA");
    if (/звільн|відрах|чорн|неактив|припинен/.test(status)) return json({message:"За реєстром статус служби не дозволяє подати заявку на кабінет."},403);
    const personnelId=String(person.personnelId||person.serviceNumber||serviceNumber).trim();
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(personnelId)) return json({message:"У записі реєстру некоректний ID. Зверніться до штабу."},400);
    const exists=await env.DB.prepare("SELECT id FROM personnel_accounts WHERE service_number=? OR personnel_id=? LIMIT 1").bind(serviceNumber,personnelId).first();
    if (exists) return json({message:"Для цього військовослужбовця вже існує обліковий запис. Зверніться до штабу."},409);
    const pending=await env.DB.prepare("SELECT id FROM cabinet_registration_requests WHERE service_number=? OR personnel_id=? LIMIT 1").bind(serviceNumber,personnelId).first();
    if (pending) return json({message:"Заявка з цими даними вже подана або очікує розгляду."},409);
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const passwordHash=await hashPassword(password,salt);
    await env.DB.prepare("INSERT INTO cabinet_registration_requests (service_number,personnel_id,full_name,password_hash,password_salt,password_iterations) VALUES (?,?,?,?,?,?)")
      .bind(serviceNumber,personnelId,fullName,passwordHash,b64(salt),ITERATIONS).run();
    return json({success:true,message:"Заявку подано. Доступ до кабінету буде відкрито після перевірки та підтвердження командуванням."},201);
  } catch(error) {
    if (String(error).includes("UNIQUE")) return json({message:"Заявка або обліковий запис із такими даними вже існує."},409);
    console.error("SANG self-registration error:",error);
    return json({message:"Не вдалося подати заявку. Спробуйте пізніше."},500);
  }
}
export async function onRequest(context) {
  if(context.request.method==="POST") return onRequestPost(context);
  return json({message:"Метод не підтримується."},405,{Allow:"POST"});
}