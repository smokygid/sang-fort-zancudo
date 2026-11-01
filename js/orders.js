document.addEventListener("DOMContentLoaded", () => {
  loadOrders();
});

function addText(parent, tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value || "";
  parent.appendChild(element);
  return element;
}

function addDocumentLink(parent, url, label) {
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "text-link";
  link.textContent = label;
  parent.appendChild(link);
}

function renderOrders(target, orders, isAdmin) {
  if (!target) return;
  target.replaceChildren();
  if (!orders.length) {
    addText(target, "p", "", "Документів поки немає.");
    return;
  }

  for (const order of orders) {
    const article = document.createElement("article");
    article.className = "order-item";
    const top = document.createElement("div");
    top.className = "order-item-top";
    addText(top, "strong", "", order.order_number || "Без номера");
    addText(top, "time", "", order.issued_at || order.order_date);
    article.appendChild(top);

    addText(article, "h3", "", order.category || "Наказ");
    if (order.full_name || order.service_number) {
      addText(article, "p", "order-meta", [order.full_name, order.service_number].filter(Boolean).join(" · "));
    }
    if (order.basis) addText(article, "p", "order-body", "Підстава: " + order.basis);
    if (order.additional_text) addText(article, "p", "order-body", order.additional_text);
    if (order.previous_value || order.new_value) {
      addText(article, "p", "order-meta", "Кадрова зміна: " + [order.previous_value, order.new_value].filter(Boolean).join(" → "));
    }
    if (isAdmin && (order.status || order.execution_status)) {
      addText(article, "p", "order-meta", [order.status, order.execution_status].filter(Boolean).join(" · "));
    }

    const actions = document.createElement("div");
    actions.className = "order-actions";
    addDocumentLink(actions, order.google_docs_url, "Google Docs ↗");
    addDocumentLink(actions, order.pdf_url, "PDF ↗");
    if (actions.childNodes.length) article.appendChild(actions);
    target.appendChild(article);
  }
}

async function loadOrders() {
  const targets = [
    document.getElementById("orders-list"),
    document.getElementById("admin-orders-list"),
    document.getElementById("public-orders-list")
  ].filter(Boolean);
  if (!targets.length) return;

  try {
    const response = await fetch("/api/orders", {
      credentials: "same-origin",
      cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося завантажити документи.");
    renderOrders(document.getElementById("orders-list"), data.orders || [], false);
    renderOrders(document.getElementById("public-orders-list"), data.orders || [], false);
    renderOrders(document.getElementById("admin-orders-list"), data.orders || [], true);
  } catch (error) {
    targets.forEach(target => { target.textContent = error.message; });
  }
}
