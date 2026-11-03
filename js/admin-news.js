document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("news-create-form");
  if (!form) return;
  const list = document.getElementById("admin-news-list");
  const message = document.getElementById("news-admin-message");
  const buttons = [...form.querySelectorAll("[data-news-status]")];
  const imageInput = document.getElementById("news-image-url");
  const preview = document.getElementById("news-image-preview");
  let editing = null;
  let allNews = [];

  const toolbar = document.createElement("div");
  toolbar.className = "orders-toolbar admin-news-toolbar";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "orders-search";
  search.placeholder = "Пошук за заголовком або текстом…";
  search.setAttribute("aria-label","Пошук публікацій");
  const filter = document.createElement("select");
  filter.className = "orders-filter";
  filter.setAttribute("aria-label","Фільтр публікацій за статусом");
  [["all","Усі публікації"],["draft","Чернетки"],["published","Опубліковані"],["archived","Архів"]].forEach(([value,label]) => filter.add(new Option(label,value)));
  list.parentNode.insertBefore(toolbar,list);
  toolbar.append(search,filter);
  search.addEventListener("input",renderFiltered);
  filter.addEventListener("change",renderFiltered);

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "cabinet-logout";
  cancel.textContent = "СКАСУВАТИ РЕДАГУВАННЯ";
  cancel.hidden = true;
  cancel.addEventListener("click",resetEditor);
  form.querySelector(".order-form-actions").appendChild(cancel);

  function localDate() {
    const now = new Date();
    return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
  }
  function dateLabel(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3]+"."+m[2]+"."+m[1] : String(value || "");
  }
  function statusLabel(status) {
    return status === "published" ? "Опубліковано" : status === "archived" ? "Архів" : "Чернетка";
  }
  function updatePreview() {
    const url = imageInput.value.trim();
    preview.replaceChildren();
    if (!url) { preview.hidden = true; return; }
    const img = document.createElement("img");
    img.src = url;
    img.alt = "Попередній перегляд зображення";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => { preview.textContent = "Не вдалося завантажити зображення за цим посиланням."; };
    preview.appendChild(img);
    preview.hidden = false;
  }
  imageInput.addEventListener("input",updatePreview);

  function renderFiltered() {
    const q = search.value.trim().toLocaleLowerCase("uk");
    const status = filter.value;
    renderList(allNews.filter(item => {
      const hay = [item.title,item.category,item.excerpt,item.body].join(" ").toLocaleLowerCase("uk");
      return (!q || hay.includes(q)) && (status === "all" || item.status === status);
    }));
  }
  function renderList(items) {
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "orders-empty";
      empty.textContent = "Публікацій за вибраними параметрами немає.";
      list.appendChild(empty);
      return;
    }
    for (const item of items) {
      const card = document.createElement("article");
      card.className = "order-card admin-news-item";
      const heading = document.createElement("div");
      heading.className = "order-card-line";
      const title = document.createElement("strong");
      title.textContent = item.title;
      heading.appendChild(title);
      const badge = document.createElement("span");
      badge.className = "order-status " + (item.status === "published" ? "is-success" : "is-muted");
      badge.textContent = statusLabel(item.status);
      heading.appendChild(badge);
      card.appendChild(heading);
      const meta = document.createElement("p");
      meta.textContent = [item.category,dateLabel(item.news_date),Number(item.is_featured) ? "Головна" : "",Number(item.is_announcement) ? "Оголошення" : ""].filter(Boolean).join(" · ");
      card.appendChild(meta);
      if (item.excerpt || item.body) {
        const desc = document.createElement("p");
        const value = item.excerpt || item.body;
        desc.textContent = value.length > 240 ? value.slice(0,240)+"…" : value;
        card.appendChild(desc);
      }
      const actions = document.createElement("div");
      actions.className = "order-form-actions admin-order-actions";
      const edit = document.createElement("button");
      edit.type = "button"; edit.className = "cabinet-logout"; edit.textContent = "РЕДАГУВАТИ";
      edit.addEventListener("click",() => beginEdit(item));
      actions.appendChild(edit);
      const state = document.createElement("button");
      state.type = "button"; state.className = "cabinet-logout";
      if (item.status === "draft") {
        state.textContent = "ОПУБЛІКУВАТИ";
        state.addEventListener("click",() => changeStatus(item.id,"published"));
      } else if (item.status === "published") {
        state.textContent = "ЗНЯТИ З ПУБЛІКАЦІЇ";
        state.addEventListener("click",() => changeStatus(item.id,"archived"));
      } else {
        state.textContent = "ПОВЕРНУТИ ДО ЧЕРНЕТКИ";
        state.addEventListener("click",() => changeStatus(item.id,"draft"));
      }
      actions.appendChild(state);
      card.appendChild(actions);
      list.appendChild(card);
    }
  }
  function beginEdit(item) {
    editing = item;
    document.getElementById("news-title").value = item.title || "";
    document.getElementById("news-category").value = item.category || "ІНШЕ";
    document.getElementById("news-date").value = item.news_date || "";
    document.getElementById("news-image-url").value = item.image_url || "";
    document.getElementById("news-excerpt").value = item.excerpt || "";
    document.getElementById("news-body").value = item.body || "";
    document.getElementById("news-featured").checked = Number(item.is_featured) === 1;
    document.getElementById("news-announcement").checked = Number(item.is_announcement) === 1;
    updatePreview();
    buttons[0].textContent = "ЗБЕРЕГТИ ЗМІНИ";
    buttons[1].hidden = true;
    cancel.hidden = false;
    message.textContent = "Редагування публікації: " + item.title;
    form.scrollIntoView({behavior:"smooth",block:"center"});
  }
  function resetEditor() {
    editing = null;
    form.reset();
    document.getElementById("news-date").value = localDate();
    buttons[0].textContent = "ЗБЕРЕГТИ ЧЕРНЕТКУ";
    buttons[1].hidden = false;
    cancel.hidden = true;
    preview.replaceChildren();
    preview.hidden = true;
    message.textContent = "";
  }
  async function loadNews() {
    list.textContent = "Завантаження публікацій…";
    try {
      const response = await fetch("/api/admin/news",{credentials:"same-origin",cache:"no-store"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося завантажити публікації.");
      allNews = data.news || [];
      renderFiltered();
    } catch (error) { list.textContent = error.message; }
  }
  async function changeStatus(id,status) {
    message.textContent = "";
    try {
      const response = await fetch("/api/admin/news",{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося змінити статус.");
      message.textContent = data.message;
      await loadNews();
    } catch (error) { message.textContent = error.message; }
  }

  form.addEventListener("submit",async event => {
    event.preventDefault();
    const submitter = event.submitter || buttons[0];
    const status = submitter.dataset.newsStatus || "draft";
    submitter.disabled = true;
    message.textContent = "";
    const payload = {
      title:document.getElementById("news-title").value,
      category:document.getElementById("news-category").value,
      newsDate:document.getElementById("news-date").value,
      imageUrl:document.getElementById("news-image-url").value,
      excerpt:document.getElementById("news-excerpt").value,
      body:document.getElementById("news-body").value,
      isFeatured:document.getElementById("news-featured").checked,
      isAnnouncement:document.getElementById("news-announcement").checked,
      status
    };
    try {
      const response = await fetch("/api/admin/news",{
        method:editing ? "PATCH" : "POST",
        credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(editing ? {...payload,id:editing.id} : payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося зберегти публікацію.");
      message.textContent = data.message;
      resetEditor();
      await loadNews();
    } catch (error) { message.textContent = error.message; }
    finally { submitter.disabled = false; }
  });

  document.getElementById("news-date").value = localDate();
  loadNews();
});
