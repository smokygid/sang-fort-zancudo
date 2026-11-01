document.addEventListener("DOMContentLoaded", async () => {
  const status = document.getElementById("dashboard-status");
  const content = document.getElementById("dashboard-content");
  const logout = document.getElementById("logout-button");

  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    });
    if (response.status === 401) {
      location.replace("/cabinet/");
      return;
    }
    const result = await response.json();
    if (!response.ok || !result.authenticated) {
      throw new Error(result.message || "Не вдалося перевірити авторизацію.");
    }
    document.getElementById("soldier-number").textContent = result.soldier.serviceNumber;
    document.getElementById("personnel-id").textContent = result.soldier.personnelId;
    document.getElementById("soldier-role").textContent =
      result.soldier.role === "admin" ? "Командування" : "Військовослужбовець";
    content.hidden = false;
    status.textContent = "Сесію підтверджено. Вітаємо у службовому кабінеті.";
  } catch (error) {
    status.textContent = error.message || "Помилка завантаження кабінету.";
  }

  logout.addEventListener("click", async () => {
    logout.disabled = true;
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
    } finally {
      location.replace("/cabinet/");
    }
  });
});
