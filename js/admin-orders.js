document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("order-create-form");
  if (!form) return;
  const audience = document.getElementById("order-audience");
  const recipientsWrap = document.getElementById("order-recipients-wrap");
  const recipients = document.getElementById("order-recipients");
  const factionWrap = document.getElementById("order-faction-wrap");
  const factionSelect = document.getElementById("order-faction");
  const message = document.getElementById("order-admin-message");
  const list = document.getElementById("admin-orders-list");
  const submitButtons = [...form.querySelectorAll("[data-order-status]")];
  const actions = form.querySelector(".order-form-actions");
  let editingOrder = null;
  let allOrders = [];

  const toolbar = document.createElement("div");
  toolbar.className = "orders-toolbar admin-orders-toolbar";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "orders-search";
  search.placeholder = "Пошук за номером або назвою…";
  search.setAttribute("aria-label", "Пошук документів командування");
  const filter = document.createElement("select");
  filter.className = "orders-filter";
  filter.setAttribute("aria-label", "Фільтр за статусом документа");
  [["all","Усі документи"],["draft","Чернетки"],["published","Опубліковані"],["archived","Архів"]].forEach(([value,label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    filter.appendChild(option);
  });
  list.parentNode.insertBefore(toolbar, list);
  toolbar.append(search, filter);
  search.addEventListener("input", renderFiltered);
  filter.addEventListener("change", renderFiltered);

  const cancelEdit = document.createElement("button");
  cancelEdit.type = "button";
  cancelEdit.className = "cabinet-logout";
  cancelEdit.textContent = "СКАСУВАТИ РЕДАГУВАННЯ";
  cancelEdit.hidden = true;
  cancelEdit.addEventListener("click", resetEditor);
  actions.appendChild(cancelEdit);

  function updateAudience() {
    const needsRecipients = audience.value === "person" || audience.value === "group";
    recipientsWrap.hidden = !needsRecipients;
    recipients.required = needsRecipients;
    recipients.multiple = audience.value === "group";
    recipients.size = audience.value === "group" ? 7 : 1;
    factionWrap.hidden = audience.value !== "faction";
    factionSelect.required = audience.value === "faction";
    if (audience.value === "person" && recipients.selectedOptions.length > 1) {
      const selected = recipients.value;
      [...recipients.options].forEach(option => { option.selected = option.value === selected; });
    }
  }

  function fillRoster(soldiers, factions) {
    recipients.replaceChildren();
    factionSelect.replaceChildren();
    const factionPlaceholder = document.createElement("option");
    factionPlaceholder.value = "";
    factionPlaceholder.textContent = "Оберіть фракцію";
    factionSelect.appendChild(factionPlaceholder);
    for (const faction of factions || []) {
      const option = document.createElement("option");
      option.value = faction.name;
      option.textContent = faction.name;
      factionSelect.appendChild(option);
    }
    for (const soldier of soldiers || []) {
      const option = document.createElement("option");
      option.value = String(soldier.accountId);
      option.textContent = [soldier.fullName, soldier.rank, soldier.serviceNumber].filter(Boolean).join(" · ") || soldier.serviceNumber;
      recipients.appendChild(option);
    }
    updateAudience();
  }

  function statusLabel(status) {
    return status === "published" ? "Опубліковано" : status === "archived" ? "Архів" : "Чернетка";
  }

  function renderFiltered() {
    const query = search.value.trim().toLocaleLowerCase("uk");
    const status = filter.value;
    const filtered = allOrders.filter(order => {
      const haystack = [order.order_number,order.title,order.category,order.body].join(" ").toLocaleLowerCase("uk");
      return (!query || haystack.includes(query)) && (status === "all" || order.status === status);
    });
    renderAdminOrders(list, filtered);
  }

  function renderAdminOrders(target, orders) {
    target.replaceChildren();
    if (!orders.length) {
      const empty = document.createElement("p");
      empty.className = "orders-empty";
      empty.textContent = "Документів за вибраними параметрами немає.";
      target.appendChild(empty);
      return;
    }
    for (const order of orders) {
      const card = document.createElement("article");
      card.className = "order-card admin-order-management";
      const heading = document.createElement("div");
      heading.className = "order-card-line";
      const number = document.createElement("strong");
      number.textContent = order.order_number + " · " + order.title;
      heading.appendChild(number);
      const badge = document.createElement("span");
      badge.className = "order-status " + (order.status === "published" ? "is-success" : "is-muted");
      badge.textContent = statusLabel(order.status);
      heading.appendChild(badge);
      card.appendChild(heading);

      const audienceLabel = order.audience_type === "faction" ? "Фракція: " + (order.audience_faction || "—") : order.audience_type === "all" ? "Увесь особовий склад" : order.audience_type === "person" ? "Персональний документ" : "Груповий документ";
      const people = (order.recipients || []).map(person => [person.fullName,person.serviceNumber].filter(Boolean).join(" · ")).join(", ");
      const info = document.createElement("p");
      info.textContent = order.category + " · " + order.order_date + " · " + audienceLabel + (people ? ": " + people : "");
      card.appendChild(info);
      const preview = document.createElement("p");
      preview.textContent = order.body.length > 260 ? order.body.slice(0,260) + "…" : order.body;
      card.appendChild(preview);

      const buttons = document.createElement("div");
      buttons.className = "order-form-actions admin-order-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "cabinet-logout";
      edit.textContent = "РЕДАГУВАТИ";
      edit.addEventListener("click", () => beginEdit(order));
      buttons.appendChild(edit);

      const state = document.createElement("button");
      state.type = "button";
      state.className = "cabinet-logout";
      if (order.status === "draft") {
        state.textContent = "ОПУБЛІКУВАТИ";
        state.addEventListener("click", () => changeStatus(order.id,"published"));
      } else if (order.status === "published") {
        state.textContent = "СКАСУВАТИ ПУБЛІКАЦІЮ";
        state.addEventListener("click", () => changeStatus(order.id,"archived"));
      } else {
        state.textContent = "ПОВЕРНУТИ ДО ЧЕРНЕТКИ";
        state.addEventListener("click", () => changeStatus(order.id,"draft"));
      }
      buttons.appendChild(state);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "cabinet-logout admin-delete-button";
      remove.textContent = "ВИДАЛИТИ";
      remove.addEventListener("click", () => deleteOrder(order));
      buttons.appendChild(remove);
      card.appendChild(buttons);
      target.appendChild(card);
    }
  }

  function beginEdit(order) {
    editingOrder = order;
    document.getElementById("order-number").value = order.order_number || "";
    document.getElementById("order-title").value = order.title || "";
    document.getElementById("order-category").value = order.category || "Наказ";
    document.getElementById("order-date").value = order.order_date || "";
    document.getElementById("order-body").value = order.body || "";
    audience.value = order.audience_type || "all";
    factionSelect.value = order.audience_faction || "";
    const selected = new Set((order.recipients || []).map(person => String(person.accountId)));
    [...recipients.options].forEach(option => { option.selected = selected.has(option.value); });
    updateAudience();
    submitButtons[0].textContent = "ЗБЕРЕГТИ ЗМІНИ";
    submitButtons[1].hidden = true;
    cancelEdit.hidden = false;
    message.textContent = "Редагування документа: " + order.order_number;
    form.scrollIntoView({behavior:"smooth",block:"center"});
  }

  function resetEditor() {
    editingOrder = null;
    form.reset();
    audience.value = "all";
    factionSelect.value = "";
    [...recipients.options].forEach(option => { option.selected = false; });
    updateAudience();
    submitButtons[0].textContent = "ЗБЕРЕГТИ ЧЕРНЕТКУ";
    submitButtons[1].hidden = false;
    cancelEdit.hidden = true;
    message.textContent = "";
  }

  async function loadAdminOrders() {
    list.textContent = "Завантаження документів…";
    try {
      const response = await fetch("/api/admin/orders", {credentials:"same-origin",cache:"no-store"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося завантажити документи.");
      fillRoster(data.soldiers, data.factions);
      allOrders = data.orders || [];
      renderFiltered();
    } catch (error) { list.textContent = error.message; }
  }

  async function deleteOrder(order) {
    const label = [order.order_number, order.title].filter(Boolean).join(" · ");
    if (!confirm("Остаточно видалити документ «" + label + "»? Цю дію неможливо скасувати.")) return;
    message.textContent = "";
    try {
      const response = await fetch("/api/admin/orders", {
        method:"DELETE",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id:order.id})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося видалити документ.");
      message.textContent = data.message;
      if (editingOrder && String(editingOrder.id) === String(order.id)) resetEditor();
      await loadAdminOrders();
      if (typeof loadOrders === "function") await loadOrders();
    } catch (error) { message.textContent = error.message; }
  }

  async function changeStatus(id,status) {
    message.textContent = "";
    try {
      const response = await fetch("/api/admin/orders", {
        method:"PATCH",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id,status})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося змінити статус документа.");
      message.textContent = data.message;
      await loadAdminOrders();
      if (typeof loadOrders === "function") await loadOrders();
    } catch (error) { message.textContent = error.message; }
  }

  audience.addEventListener("change",updateAudience);
  recipients.addEventListener("change",() => {
    if (audience.value === "person" && recipients.selectedOptions.length > 1) {
      const selected = recipients.value;
      [...recipients.options].forEach(option => { option.selected = option.value === selected; });
    }
  });

  form.addEventListener("submit",async event => {
    event.preventDefault();
    const submitter = event.submitter || submitButtons[0];
    const status = submitter.dataset.orderStatus || "draft";
    message.textContent = "";
    submitter.disabled = true;
    const payload = {
      orderNumber:document.getElementById("order-number").value,
      title:document.getElementById("order-title").value,
      category:document.getElementById("order-category").value,
      orderDate:document.getElementById("order-date").value,
      audienceType:audience.value,
      factionName:audience.value === "faction" ? factionSelect.value : "",
      recipientAccountIds:audience.value === "person" || audience.value === "group" ? [...recipients.selectedOptions].map(option => Number(option.value)) : [],
      body:document.getElementById("order-body").value,
      status
    };
    try {
      const response = await fetch("/api/admin/orders", {
        method:editingOrder ? "PATCH" : "POST",
        credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(editingOrder ? {...payload,id:editingOrder.id} : payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося зберегти документ.");
      const successMessage = data.message;
      if (editingOrder) resetEditor();
      else {
        form.reset();
        audience.value = "all";
        updateAudience();
      }
      message.textContent = successMessage;
      await loadAdminOrders();
      if (typeof loadOrders === "function") await loadOrders();
    } catch (error) { message.textContent = error.message; }
    finally { submitter.disabled = false; }
  });

  loadAdminOrders();
});
