document.addEventListener("DOMContentLoaded", async () => {
  const status = document.getElementById("dashboard-status");
  const content = document.getElementById("dashboard-content");
  const passwordPanel = document.getElementById("password-change");
  const passwordForm = document.getElementById("password-change-form");
  const passwordMessage = document.getElementById("password-message");
  const logout = document.getElementById("logout-button");

  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
    if (response.status === 401) { location.replace("/cabinet/"); return; }
    const result = await response.json();
    if (!response.ok || !result.authenticated) throw new Error(result.message || "Не вдалося перевірити авторизацію.");

    document.getElementById("soldier-number").textContent = result.soldier.serviceNumber;
    document.getElementById("personnel-id").textContent = result.soldier.personnelId;
    document.getElementById("soldier-role").textContent = result.soldier.role === "admin" ? "Командування" : "Військовослужбовець";

    if (result.soldier.mustChangePassword) {
      passwordPanel.hidden = false;
      status.textContent = "Для продовження роботи необхідно змінити тимчасовий пароль.";
    } else {
      content.hidden = false;
      status.textContent = "Сесію підтверджено. Вітаємо у службовому кабінеті.";
    }
  } catch (error) { status.textContent = error.message || "Помилка завантаження кабінету."; }

  passwordForm.addEventListener("submit", async event => {
    event.preventDefault();
    passwordMessage.textContent = "";
    const currentPassword = document.getElementById("current-password").value;
    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    if (newPassword !== confirmPassword) { passwordMessage.textContent = "Нові паролі не збігаються."; return; }
    const submit = passwordForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося змінити пароль.");
      passwordPanel.hidden = true;
      content.hidden = false;
      status.textContent = "Пароль змінено. Сесію підтверджено.";
    } catch (error) { passwordMessage.textContent = error.message; }
    finally { submit.disabled = false; }
  });

  logout.addEventListener("click", async () => {
    logout.disabled = true;
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
    } finally { location.replace("/cabinet/"); }
  });
});
