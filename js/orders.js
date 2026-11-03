document.addEventListener("DOMContentLoaded", loadOrders);

function orderText(parent, tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = value || "";
  parent.appendChild(el);
  return el;
}

function safeOrderLink(parent, url, label) {
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.className = "order-doc-link";
  a.textContent = label;
  parent.appendChild(a);
}

function statusClass(value) {
  const s = String(value || "").toLowerCase();
  if (/опублік|видан|чинн|виконан/.test(s)) return "is-success";
  if (/викон|процес|розгляд/.test(s)) return "is-progress";
  if (/скас|відхил|архів|чернет/.test(s)) return "is-muted";
  return "";
}

function createOrderCard(order, isAdmin) {
  const card = document.createElement("details");
  card.className = "order-card";

  const summary = document.createElement("summary");
  summary.className = "order-card-summary";
  const main = document.createElement("div");
  main.className = "order-card-main";

  const line = document.createElement("div");
  line.className = "order-card-line";
  orderText(line, "strong", "order-number", order.order_number || "Без номера");
  orderText(line, "span", "order-date", order.issued_at || order.order_date || "");
  if (order.status) {
    const badge = orderText(line, "span", "order-status " + statusClass(order.status), order.status);
    badge.title = "Статус наказу";
  }
  const readBadge = orderText(line, "span", "order-read-status " + (order._isRead ? "is-read" : "is-unread"), order._isRead ? "ПЕРЕГЛЯНУТО" : "НОВИЙ НАКАЗ");
  readBadge.setAttribute("aria-label", order._isRead ? "Наказ переглянуто" : "Новий непрочитаний наказ");
  main.appendChild(line);

  orderText(main, "h3", "order-title", order.title || order.category || "Наказ");
  const person = [order.full_name, order.service_number].filter(Boolean).join(" · ");
  if (person) orderText(main, "p", "order-person", person);
  const preview = order.additional_text || order.body || order.new_value || order.basis || "";
  if (preview) orderText(main, "p", "order-preview", preview);

  const arrow = orderText(summary, "span", "order-expand", "Деталі  ＋");
  summary.insertBefore(main, arrow);
  card.appendChild(summary);

  const details = document.createElement("div");
  details.className = "order-card-details";
  if (order.basis) {
    const row = orderText(details, "div", "order-detail-row", "");
    orderText(row, "span", "order-detail-label", "Підстава");
    orderText(row, "p", "", order.basis);
  }
  if (order.previous_value || order.new_value) {
    const row = orderText(details, "div", "order-detail-row", "");
    orderText(row, "span", "order-detail-label", "Кадрова зміна");
    orderText(row, "p", "", [order.previous_value, order.new_value].filter(Boolean).join(" → "));
  }
  if (order.additional_text && order.additional_text !== preview) {
    const row = orderText(details, "div", "order-detail-row", "");
    orderText(row, "span", "order-detail-label", "Додаткова інформація");
    orderText(row, "p", "", order.additional_text);
  }
  if (isAdmin) {
    const meta = [order.author && "Автор: " + order.author, order.execution_status, order.status].filter(Boolean);
    if (meta.length) orderText(details, "p", "order-admin-meta", meta.join(" · "));
  }
  const links = document.createElement("div");
  links.className = "order-card-links";
  safeOrderLink(links, order.google_docs_url, "Відкрити Google Docs ↗");
  safeOrderLink(links, order.pdf_url, "Завантажити PDF ↗");
  if (links.childNodes.length) details.appendChild(links);
  if (!details.childNodes.length) orderText(details, "p", "order-empty-details", "Додаткові відомості відсутні.");
  card.appendChild(details);

  card.addEventListener("toggle", async () => {
    const label = card.querySelector(".order-expand");
    if (label) label.textContent = card.open ? "Згорнути  −" : "Деталі  ＋";
    if (card.open && !order._isRead) await markOrderRead(order, card);
  });
  return card;
}

async function markOrderRead(order, card) {
  if (!order.id || order._markingRead) return;
  order._markingRead = true;
  try {
    const response = await fetch("/api/order-reads", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: String(order.id) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося зберегти перегляд наказу.");
    order._isRead = true;
    const badge = card.querySelector(".order-read-status");
    if (badge) { badge.className = "order-read-status is-read"; badge.textContent = "ПЕРЕГЛЯНУТО"; badge.setAttribute("aria-label", "Наказ переглянуто"); }
    updateOrderUnreadSummary(window.sangOrderList || []);
  } catch (error) {
    console.error("SANG order read tracking:", error);
  } finally { order._markingRead = false; }
}

function updateOrderUnreadSummary(orders) {
  const target = document.getElementById("orders-notification-summary");
  if (!target) return;
  const unread = orders.filter(order => !order._isRead).length;
  target.textContent = unread ? "Непрочитаних наказів: " + unread : "Усі доступні накази переглянуто.";
  target.dataset.state = unread ? "unread" : "read";
}

function renderOrders(target, orders, isAdmin) {
  if (!target) return;
  target.replaceChildren();
  const shell = document.createElement("div");
  shell.className = "orders-interface orders-registry";

  const toolbar = document.createElement("div");
  toolbar.className = "orders-toolbar";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "orders-search";
  search.placeholder = "Пошук за номером або ПІБ…";
  search.setAttribute("aria-label", "Пошук наказів");
  toolbar.appendChild(search);

  const filter = document.createElement("select");
  filter.className = "orders-filter";
  filter.setAttribute("aria-label", "Фільтр за типом наказу");
  [["all","Усі типи"],["кадр","Кадрові"],["організ","Організаційні"],["дисципл","Дисциплінарні"],["операц","Оперативні"]].forEach(([v,l]) => {
    const option = document.createElement("option"); option.value=v; option.textContent=l; filter.appendChild(option);
  });
  toolbar.appendChild(filter);
  shell.appendChild(toolbar);

  const count = orderText(shell, "p", "orders-count", "");
  const list = document.createElement("div");
  list.className = "orders-list-inner";
  shell.appendChild(list);

  function update() {
    const q = search.value.trim().toLocaleLowerCase("uk");
    const type = filter.value;
    const filtered = orders.filter(o => {
      const haystack = [o.order_number,o.category,o.full_name,o.service_number,o.basis,o.additional_text].join(" ").toLocaleLowerCase("uk");
      return (!q || haystack.includes(q)) && (type === "all" || String(o.category || "").toLocaleLowerCase("uk").includes(type));
    });
    count.textContent = "Показано: " + filtered.length + " із " + orders.length;
    list.replaceChildren();
    if (!filtered.length) {
      orderText(list, "p", "orders-empty", orders.length ? "За вашим запитом нічого не знайдено." : "Наказів поки немає.");
      return;
    }
    filtered.forEach(o => list.appendChild(createOrderCard(o, isAdmin)));
  }
  search.addEventListener("input", update);
  filter.addEventListener("change", update);
  update();
  target.appendChild(shell);
}

async function loadOrders() {
  const targets = ["orders-list","public-orders-list","faction-orders-list"]
    .map(id => document.getElementById(id)).filter(Boolean);
  if (!targets.length) return;
  try {
    const response = await fetch("/api/orders", {credentials:"same-origin",cache:"no-store"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося завантажити накази.");
    let readIds = [];
    try {
      const readResponse = await fetch("/api/order-reads", {credentials:"same-origin",cache:"no-store"});
      const readData = await readResponse.json();
      if (readResponse.ok) readIds = readData.readOrderIds || [];
    } catch (readError) { console.warn("SANG order read statuses unavailable:", readError); }
    const orders = data.orders || [];
    orders.forEach(order => { order._isRead = readIds.includes(String(order.id)); });
    window.sangOrderList = orders;
    updateOrderUnreadSummary(orders);
    renderOrders(document.getElementById("orders-list"), orders, false);
    renderOrders(document.getElementById("public-orders-list"), data.orders || [], false);
    renderOrders(document.getElementById("faction-orders-list"), data.orders || [], false);

  } catch (error) {
    targets.forEach(t => { t.textContent = error.message; });
  }
}
