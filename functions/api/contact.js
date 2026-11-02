const json = (data, status = 200) => new Response(JSON.stringify(data), {
 status, headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
export async function onRequestPost({request, env}) {
 if (!env.CONTACT_WEBHOOK_URL) return json({error:"Приймальня ще не налаштована. Спробуйте пізніше."},503);
 let body;
 try { body = await request.json(); } catch { return json({error:"Некоректний формат звернення."},400); }
 if (body.website) return json({ok:true});
 const clean = (v,n) => String(v || "").trim().slice(0,n);
 const name=clean(body.name,80), reply=clean(body.reply,120), audience=clean(body.audience,80), topic=clean(body.topic,80), message=clean(body.message,3000);
 if (!name || !reply || !audience || !topic || message.length<10 || body.consent!=="on") return json({error:"Перевірте заповнення всіх обов'язкових полів."},400);
 const safe = v => v.replace(/[\`*_~|>]/g, c => "\\"+c);
 const payload={username:"SANG • Електронна приймальня",allowed_mentions:{parse:[]},embeds:[{title:"Нове офіційне звернення",color:13280330,fields:[
 {name:"Заявник",value:safe(name),inline:true},{name:"Контакт для відповіді",value:safe(reply),inline:true},
 {name:"Адресат",value:safe(audience),inline:true},{name:"Тема",value:safe(topic),inline:true},
 {name:"Зміст звернення",value:safe(message)}],footer:{text:"SANG • Fort Zancudo | RP-портал"},timestamp:new Date().toISOString()}]};
 try {
  const sent=await fetch(env.CONTACT_WEBHOOK_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  if(!sent.ok) return json({error:"Не вдалося передати звернення до службового каналу. Спробуйте пізніше."},502);
  return json({ok:true});
 } catch { return json({error:"Помилка зв'язку з приймальнею. Спробуйте пізніше."},502); }
}