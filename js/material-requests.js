document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("material-request-form");
  const list = document.getElementById("material-requests-list");
  if (!list) return;
  const message = document.getElementById("material-request-message");
  const esc = value => String(value ?? "—");
  const fmtDate = value => value ? new Date(value + "T00:00:00").toLocaleDateString("uk-UA") : "—";
  async function api(method, payload) {
    const response = await fetch("/api/material-requests", {
      method, credentials:"same-origin", cache:"no-store",
      headers: method === "POST" ? {"Content-Type":"application/json"} : {},
      ...(payload ? {body:JSON.stringify(payload)} : {})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Помилка обробки заявки.");
    return data;
  }

  function make(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined) el.textContent = value;
    return el;
  }

  function renderDecision(card, request, side, label) {
    const status = request[side + "_status"];
    const block = make("div","material-decision");
    const heading = make("h4","",label + ": " + ({pending:"Очікує рішення",approved:"Підтверджено",proposed:"Запропоновано іншу дату",rejected:"Відхилено"}[status] || status));
    block.append(heading);
    if (status !== "rejected" && request.status !== "approved" && request.status !== "rejected" && request.status !== "completed") {
      const date = document.createElement("input"); date.type="date"; date.value=request[(side === "sang" ? "city" : "sang")+"_status"]==="proposed" ? request[(side === "sang" ? "city" : "sang")+"_date"] : request.requested_date; date.setAttribute("aria-label","Дата рішення "+label);
      const time = document.createElement("input"); time.type="time"; time.value=request[(side === "sang" ? "city" : "sang")+"_status"]==="proposed" ? request[(side === "sang" ? "city" : "sang")+"_time"] : request.requested_time; time.setAttribute("aria-label","Час рішення "+label);
      const comment = document.createElement("input"); comment.maxLength=1000; comment.placeholder="Коментар / причина";
      const actions = make("div","material-decision-actions");
      const approve = make("button","cabinet-logout","ПІДТВЕРДИТИ");
      approve.type="button";
      approve.addEventListener("click",()=>submitDecision(request.id,side,date.value===request.requested_date&&time.value===request.requested_time?"approved":"proposed",date.value,time.value,comment.value));
      const reject = make("button","cabinet-logout material-reject","ВІДХИЛИТИ");
      reject.type="button";
      reject.addEventListener("click",()=>{if(confirm("Відхилити замовлення "+request.request_number+"?"))submitDecision(request.id,side,"rejected","","",comment.value);});
      actions.append(approve,reject); block.append(date,time,comment,actions);
    } else {
      const chosenDate=request[side+"_date"], chosenTime=request[side+"_time"];
      block.append(make("p","",status==="rejected" ? (request[side+"_comment"]||"Без пояснення") : fmtDate(chosenDate)+" · "+(chosenTime||"—")));
      if(request[side+"_comment"]) block.append(make("small","",request[side+"_comment"]));
    }
    card.append(block);
  }

  async function submitDecision(id,side,decision,date,time,comment) {
    try { await api("POST",{action:"review",id,decision,date,time,comment}); await load(); }
    catch(error){ alert(error.message); }
  }

  function render(rows, data) {
    list.replaceChildren();
    if(!rows.length){list.append(make("p","material-empty","Заявок поки немає."));return;}
    for(const request of rows){
      const card=make("article","material-request-item");
      const head=make("div","material-request-head");
      head.append(make("strong","",request.request_number),make("span","material-status status-"+request.status,({pending:"НОВА",coordination:"УЗГОДЖЕННЯ",approved:"ПОГОДЖЕНО",rejected:"ВІДХИЛЕНО",completed:"ВИКОНАНО"}[request.status]||request.status)));
      card.append(head,make("p","material-request-meta",request.requester_faction+" · "+request.requester_service_number+" · "+fmtDate(request.created_at?.slice(0,10))));
      const items=make("ul","material-items");
      try{for(const item of JSON.parse(request.items_json))items.append(make("li","",item.name+": "+item.quantity+" "+item.unit));}catch{}
      card.append(items,make("p","", "Бажаний час: "+fmtDate(request.requested_date)+" · "+request.requested_time));
      if(request.comment)card.append(make("p","material-request-comment","Коментар: "+request.comment));
      if(data.reviewerSang)renderDecision(card,request,"sang","SANG");
      if(data.reviewerCity)renderDecision(card,request,"city","МЕРІЯ");
      if(!data.reviewerSang&&!data.reviewerCity){
        card.append(make("p","material-request-meta","SANG: "+request.sang_status+" · Мерія: "+request.city_status));
        if(request.sang_status!=="pending")card.append(make("p","", "Рішення SANG: "+(request.sang_date?fmtDate(request.sang_date)+" · "+request.sang_time:"Відхилено")+" "+(request.sang_comment||"")));
        if(request.city_status!=="pending")card.append(make("p","", "Рішення мерії: "+(request.city_date?fmtDate(request.city_date)+" · "+request.city_time:"Відхилено")+" "+(request.city_comment||"")));
      }
      list.append(card);
    }
  }

  async function load() {
    list.replaceChildren(make("p","","Завантаження заявок…"));
    try {const data=await api("GET");const panel=document.getElementById("material-requests");if(panel&&(data.canCreate||data.reviewerSang||data.reviewerCity))panel.hidden=false;const requestForm=document.getElementById("material-request-form");if(requestForm)requestForm.hidden=!data.canCreate;render(data.requests||[],data);}
    catch(error){list.replaceChildren(make("p","material-error",error.message));}
  }

  if (form) form.addEventListener("submit",async event=>{
    event.preventDefault();message.textContent="";
    const payload={category:document.getElementById("material-request-category").value,quantity:Number(document.getElementById("material-request-quantity").value),requestedDate:document.getElementById("material-request-date").value,requestedTime:document.getElementById("material-request-time").value,comment:document.getElementById("material-request-comment").value};
    if(!["materials","medical"].includes(payload.category)){message.textContent="Оберіть категорію замовлення.";return;}
    if(!Number.isSafeInteger(payload.quantity)||payload.quantity<1||payload.quantity>100000){message.textContent="Вкажіть кількість від 1 до 100000.";return;}
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{const result=await api("POST",payload);message.textContent=result.message+" Номер: "+result.requestNumber;form.reset();await load();}
    catch(error){message.textContent=error.message;}
    finally{button.disabled=false;}
  });
  document.getElementById("material-requests-refresh")?.addEventListener("click",load);
  const date=document.getElementById("material-request-date");
  if(date)date.min=new Date().toISOString().slice(0,10);
  load();
});
