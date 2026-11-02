document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("order-create-form");
  if (!form) return;
  const audience = document.getElementById("order-audience");
  const recipientsWrap = document.getElementById("order-recipients-wrap");
  const recipients = document.getElementById("order-recipients");
  const message = document.getElementById("order-admin-message");

  function updateAudience() {
    const needsRecipients = audience.value !== "all";
    recipientsWrap.hidden = !needsRecipients;
    recipients.required = needsRecipients;
    recipients.multiple = audience.value === "group";
    recipients.size = audience.value === "group" ? 7 : 1;
    if (audience.value === "person" && recipients.selectedOptions.length > 1) {
      const selected = recipients.value;
      [...recipients.options].forEach(option => { option.selected = option.value === selected; });
    }
  }

  function fillRoster(soldiers) {
    recipients.replaceChildren();
    for (const soldier of soldiers || []) {
      const option = document.createElement("option");
      option.value = String(soldier.accountId);
      option.textContent = [soldier.fullName, soldier.rank, soldier.serviceNumber].filter(Boolean).join(" · ") || soldier.serviceNumber;
      recipients.appendChild(option);
    }
    updateAudience();
  }

  function renderAdminOrders(target, orders) {
    target.replaceChildren();
    if (!orders.length) {
      const empty = document.createElement("p");
      empty.textContent = "Документів поки немає.";
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
      const status = document.createElement("span");
      status.className = "order-status " + (order.status === "published" ? "is-success" : "is-muted");
      status.textContent = order.status === "published" ? "Опубліковано" : order.status === "archived" ? "Архів" : "Чернетка";
      heading.appendChild(status);
      card.appendChild(heading);
      const audienceLabel = order.audience_type === "all" ? "Увесь особовий склад" : order.audience_type === "person" ? "Персональний документ" : "Груповий документ";
      const people = (order.recipients || []).map(p => [p.fullName, p.serviceNumber].filter(Boolean).join(" · ")).join(", ");
      const info = document.createElement("p");
      info.textContent = order.category + " · " + order.order_date + " · " + audienceLabel + (people ? ": " + people : "");
      card.appendChild(info);
      const preview = document.createElement("p");
      preview.textContent = order.body.length > 240 ? order.body.slice(0, 240) + "…" : order.body;
      card.appendChild(preview);
      const actions = document.createElement("div");
      actions.className = "order-form-actions";
      if (order.status === "draft") {
        const publish = document.createElement("button");
        publish.type = "button";
        publish.className = "cabinet-logout";
        publish.textContent = "ОПУБЛІКУВАТИ";
        publish.addEventListener("click", () => changeStatus(order.id, "published"));
        actions.appendChild(publish);
      } else if (order.status === "published") {
        const archive = document.createElement("button");
        archive.type = "button";
        archive.className = "cabinet-logout";
        archive.textContent = "СКАСУВАТИ ПУБЛІКАЦІЮ";
        archive.addEventListener("click", () => changeStatus(order.id, "archived"));
        actions.appendChild(archive);
      }
      if (actions.childNodes.length) card.appendChild(actions);
      target.appendChild(card);
    }
  }

  async function loadAdminOrders() {
    const list = document.getElementById("admin-orders-list");
    list.textContent = "Завантаження документів…";
    try {
      const response = await fetch("/api/admin/orders", { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося завантажити документи.");
      fillRoster(data.soldiers);
      renderAdminOrders(list, data.orders || []);
    } catch (error) { list.textContent = error.message; }
  }

  async function changeStatus(id, status) {
    message.textContent = "";
    try {
      const response = await fetch("/api/admin/orders", {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося змінити статус документа.");
      message.textContent = data.message;
      await loadAdminOrders();
      if (typeof loadOrders === "function") await loadOrders();
    } catch (error) { message.textContent = error.message; }
  }

  audience.addEventListener("change", updateAudience);
  recipients.addEventListener("change", () => {
    if (audience.value === "person" && recipients.selectedOptions.length > 1) {
      const selected = recipients.value;
      [...recipients.options].forEach(option => { option.selected = option.value === selected; });
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submitter = event.submitter;
    const status = submitter?.dataset.orderStatus || "draft";
    message.textContent = "";
    submitter.disabled = true;
    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: document.getElementById("order-number").value,
          title: document.getElementById("order-title").value,
          category: document.getElementById("order-category").value,
          orderDate: document.getElementById("order-date").value,
          audienceType: audience.value,
          recipientAccountIds: audience.value === "all" ? [] : [...recipients.selectedOptions].map(option => Number(option.value)),
          body: document.getElementById("order-body").value,
          status
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося зберегти документ.");
      message.textContent = data.message;
      form.reset();
      updateAudience();
      await loadAdminOrders();
      if (typeof loadOrders === "function") await loadOrders();
    } catch (error) { message.textContent = error.message; }
    finally { submitter.disabled = false; }
  });

  loadAdminOrders();
});
