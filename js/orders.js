document.addEventListener("DOMContentLoaded", () => {
  loadOrders();
  const form = document.getElementById("order-create-form");
  if (!form) return;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter;
    const message = document.getElementById("order-admin-message");
    const buttons = [...form.querySelectorAll('button[type="submit"]')];
    buttons.forEach(item => item.disabled = true);
    message.textContent = "";
    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: document.getElementById("order-number").value,
          title: document.getElementById("order-title").value,
          category: document.getElementById("order-category").value,
          orderDate: document.getElementById("order-date").value,
          body: document.getElementById("order-body").value,
          status: button?.value === "published" ? "published" : "draft"
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося зберегти документ.");
      message.textContent = data.message;
      form.reset();
      await loadOrders();
    } catch (error) { message.textContent = error.message; }
    finally { buttons.forEach(item => item.disabled = false); }
  });
});

function renderOrders(target, orders, isAdmin) {
  if (!target) return;
  target.replaceChildren();
  if (!orders.length) {
    const empty = document.createElement("p");
    empty.textContent = "Документів поки немає.";
    target.appendChild(empty);
    return;
  }
  for (const order of orders) {
    const article = document.createElement("article");
    article.className = "order-item";
    const top = document.createElement("div"); top.className = "order-item-top";
    const number = document.createElement("strong"); number.textContent = order.order_number;
    const date = document.createElement("time"); date.textContent = order.order_date;
    top.append(number, date);
    const title = document.createElement("h3"); title.textContent = order.title;
    const meta = document.createElement("p"); meta.className = "order-meta";
    meta.textContent = order.category + (isAdmin ? " · " + (order.status === "published" ? "Опубліковано" : order.status === "archived" ? "Архів" : "Чернетка") : "");
    const body = document.createElement("p"); body.className = "order-body"; body.textContent = order.body;
    article.append(top, title, meta, body);
    target.appendChild(article);
  }
}

async function loadOrders() {
  const publicList = document.getElementById("orders-list");
  const adminList = document.getElementById("admin-orders-list");
  try {
    const response = await fetch("/api/orders", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося завантажити документи.");
    renderOrders(publicList, data.orders || [], false);
    renderOrders(adminList, data.orders || [], true);
  } catch (error) {
    [publicList, adminList].forEach(target => { if (target) target.textContent = error.message; });
  }
}
