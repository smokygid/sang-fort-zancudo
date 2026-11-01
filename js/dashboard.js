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

    loadOwnProfile();
    const adminPanel = document.getElementById("admin-panel");
    if (result.soldier.role === "admin" && adminPanel) {
      adminPanel.hidden = false;
      const auditPanel = document.getElementById("audit-panel");
      if (auditPanel) auditPanel.hidden = false;
      loadAccounts();
      loadAdminProfiles();
      loadAuditLog();
    }

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


async function loadAccounts() {
  const tbody = document.getElementById("accounts-list");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6">Завантаження…</td></tr>';
  try {
    const response = await fetch("/api/admin/accounts", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося завантажити список.");
    tbody.replaceChildren();
    for (const account of data.accounts || []) {
      const tr = document.createElement("tr");
      const values = [
        account.service_number,
        account.personnel_id,
        account.role === "admin" ? "Адміністратор" : "Військовослужбовець",
        account.active ? "Активний" : "Заблокований",
        account.must_change_password ? "Очікує зміни" : "Заданий"
      ];
      for (const value of values) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      }
      const actionCell = document.createElement("td");
      if (account.role !== "admin") {
        const action = document.createElement("button");
        action.type = "button";
        action.className = "cabinet-logout account-status-button";
        action.dataset.accountId = String(account.id);
        action.dataset.nextActive = account.active ? "false" : "true";
        action.textContent = account.active ? "ЗАБЛОКУВАТИ" : "РОЗБЛОКУВАТИ";
        actionCell.appendChild(action);
      } else {
        actionCell.textContent = "—";
      }
      tr.appendChild(actionCell);
      tbody.appendChild(tr);
    }
    if (!data.accounts || !data.accounts.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6; td.textContent = "Облікових записів поки немає."; tr.appendChild(td); tbody.appendChild(tr);
    }
  } catch (error) {
    tbody.replaceChildren();
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6; td.textContent = error.message; tr.appendChild(td); tbody.appendChild(tr);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("account-create-form");
  const refresh = document.getElementById("refresh-accounts");
  if (refresh) refresh.addEventListener("click", loadAccounts);
  const refreshAudit = document.getElementById("refresh-audit");
  if (refreshAudit) refreshAudit.addEventListener("click", loadAuditLog);
  if (!form) return;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.getElementById("admin-message");
    const resultBox = document.getElementById("new-account-result");
    const button = form.querySelector('button[type="submit"]');
    message.textContent = "";
    resultBox.hidden = true;
    button.disabled = true;
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceNumber: form.serviceNumber.value.trim(),
          personnelId: form.personnelId.value.trim()
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося створити доступ.");
      resultBox.replaceChildren();
      const title = document.createElement("strong");
      title.textContent = "Тимчасовий пароль для " + data.serviceNumber;
      const password = document.createElement("code");
      password.textContent = data.temporaryPassword;
      const note = document.createElement("p");
      note.textContent = "Передайте пароль військовослужбовцю особисто. Після першого входу його потрібно змінити. Пароль буде показано лише зараз.";
      resultBox.append(title, password, note);
      resultBox.hidden = false;
      message.textContent = data.message || "Обліковий запис створено.";
      form.reset();
      await loadAccounts();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
});


document.addEventListener("click", async event => {
  const button = event.target.closest(".account-status-button");
  if (!button) return;
  const accountId = Number(button.dataset.accountId);
  const active = button.dataset.nextActive === "true";
  const action = active ? "розблокувати" : "заблокувати";
  if (!Number.isSafeInteger(accountId) || !confirm("Підтвердити: " + action + " цей обліковий запис?")) return;
  button.disabled = true;
  try {
    const response = await fetch("/api/admin/accounts", {
      method: "PATCH", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, active })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося змінити статус.");
    await loadAccounts();
    const message = document.getElementById("admin-message");
    if (message) message.textContent = data.message;
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
});


async function loadOwnProfile() {
  try {
    const response = await fetch("/api/profile", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося завантажити профіль.");
    const p = data.profile || {};
    document.getElementById("profile-full-name").value = p.fullName || "";
    document.getElementById("profile-age").value = p.age ?? "";
    document.getElementById("profile-contact").value = p.contact || "";
    document.getElementById("profile-rank").textContent = p.rank || "Не зазначено";
    document.getElementById("profile-unit").textContent = p.unit || "Не зазначено";
    document.getElementById("profile-mos").textContent = p.mos || "Не зазначено";
    document.getElementById("profile-service-status").textContent = p.serviceStatus || "Не зазначено";
    document.getElementById("profile-service-note").textContent = p.serviceNote || "Службові примітки відсутні.";
  } catch (error) {
    document.getElementById("personal-profile-message").textContent = error.message;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const personalForm = document.getElementById("personal-profile-form");
  if (personalForm) personalForm.addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.getElementById("personal-profile-message");
    const button = personalForm.querySelector('button[type="submit"]');
    button.disabled = true; message.textContent = "";
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: document.getElementById("profile-full-name").value,
          age: document.getElementById("profile-age").value,
          contact: document.getElementById("profile-contact").value
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося зберегти дані.");
      message.textContent = data.message;
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });

  const serviceForm = document.getElementById("service-profile-form");
  if (serviceForm) serviceForm.addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.getElementById("service-profile-message");
    const button = serviceForm.querySelector('button[type="submit"]');
    const accountId = Number(document.getElementById("service-profile-account").value);
    if (!accountId) { message.textContent = "Оберіть військовослужбовця."; return; }
    button.disabled = true; message.textContent = "";
    try {
      const response = await fetch("/api/admin/profiles", {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          rank: document.getElementById("service-profile-rank").value,
          unit: document.getElementById("service-profile-unit").value,
          mos: document.getElementById("service-profile-mos").value,
          serviceStatus: document.getElementById("service-profile-status").value,
          serviceNote: document.getElementById("service-profile-note").value
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося зберегти службові дані.");
      message.textContent = data.message;
      await loadAdminProfiles();
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });

  const selector = document.getElementById("service-profile-account");
  if (selector) selector.addEventListener("change", () => {
    const selected = window.sangProfiles?.find(p => String(p.id) === selector.value);
    if (!selected) return;
    document.getElementById("service-profile-rank").value = selected.rank || "";
    document.getElementById("service-profile-unit").value = selected.unit || "";
    document.getElementById("service-profile-mos").value = selected.mos || "";
    document.getElementById("service-profile-status").value = selected.service_status || "";
    document.getElementById("service-profile-note").value = selected.service_note || "";
  });
});

async function loadAdminProfiles() {
  const tbody = document.getElementById("service-profiles-list");
  const message = document.getElementById("service-profile-message");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7">Завантаження реєстру…</td></tr>';
  if (message) message.textContent = "";
  try {
    const response = await fetch("/api/admin/profiles", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося завантажити реєстр.");
    tbody.replaceChildren();
    for (const p of data.profiles || []) {
      const row = document.createElement("tr");
      const values = [
        p.service_number || "—",
        p.full_name || "—",
        p.rank || "—",
        p.unit || "—",
        p.mos || "—",
        p.service_status || "—",
        p.lookup_error ? "Помилка API" : (p.found_in_registry ? "Знайдено" : "Немає запису")
      ];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }
    if (!data.profiles || !data.profiles.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.textContent = "Облікових записів військовослужбовців поки немає.";
      row.appendChild(cell);
      tbody.appendChild(row);
    }
  } catch (error) {
    tbody.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = error.message || "Помилка завантаження реєстру.";
    row.appendChild(cell);
    tbody.appendChild(row);
    if (message) message.textContent = error.message;
  }
}


const AUDIT_ACTION_LABELS = {
  account_created: "Створено обліковий запис",
  account_activated: "Обліковий запис розблоковано",
  account_deactivated: "Обліковий запис заблоковано",
  personal_profile_updated: "Оновлено особисті дані",
  service_profile_updated: "Оновлено службовий профіль"
};

let auditEntries = [];

function renderAuditLog() {
  const tbody = document.getElementById("audit-list");
  if (!tbody) return;
  const soldier = document.getElementById("audit-filter-soldier")?.value || "";
  const action = document.getElementById("audit-filter-action")?.value || "";
  const from = document.getElementById("audit-filter-from")?.value || "";
  const to = document.getElementById("audit-filter-to")?.value || "";

  const filtered = auditEntries.filter(entry => {
    const target = entry.target_service_number || "";
    const rawDate = entry.created_at ? String(entry.created_at).replace(" ", "T") : "";
    const day = rawDate.slice(0, 10);
    return (!soldier || target === soldier) &&
      (!action || entry.action === action) &&
      (!from || day >= from) &&
      (!to || day <= to);
  });

  tbody.replaceChildren();
  for (const entry of filtered) {
    const row = document.createElement("tr");
    const rawDate = entry.created_at ? String(entry.created_at).replace(" ", "T") : "";
    const date = rawDate ? new Date(rawDate.endsWith("Z") ? rawDate : rawDate + "Z").toLocaleString("uk-UA") : "—";
    const values = [date, entry.actor_service_number || "Невідомо", AUDIT_ACTION_LABELS[entry.action] || entry.action || "Невідома дія", entry.target_service_number || "—"];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }
    tbody.appendChild(row);
  }
  if (!filtered.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = auditEntries.length ? "За вибраними фільтрами записів не знайдено." : "Записів поки немає.";
    row.appendChild(cell);
    tbody.appendChild(row);
  }
}

function setupAuditFilters() {
  const soldier = document.getElementById("audit-filter-soldier");
  const action = document.getElementById("audit-filter-action");
  const from = document.getElementById("audit-filter-from");
  const to = document.getElementById("audit-filter-to");
  if (!soldier || soldier.dataset.ready) return;
  soldier.dataset.ready = "true";
  if (action.options.length <= 1) {
    for (const [key, label] of Object.entries(AUDIT_ACTION_LABELS)) action.appendChild(new Option(label, key));
  }
  [soldier, action, from, to].forEach(control => control.addEventListener("change", renderAuditLog));
  document.getElementById("audit-filter-reset")?.addEventListener("click", () => {
    soldier.value = ""; action.value = ""; from.value = ""; to.value = "";
    renderAuditLog();
  });
}

async function loadAuditLog() {
  const tbody = document.getElementById("audit-list");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4">Завантаження…</td></tr>';
  try {
    const response = await fetch("/api/admin/audit", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося завантажити журнал.");
    auditEntries = data.entries || [];
    const soldier = document.getElementById("audit-filter-soldier");
    if (soldier) {
      const selected = soldier.value;
      soldier.replaceChildren(new Option("Усі військовослужбовці", ""));
      for (const id of [...new Set(auditEntries.map(e => e.target_service_number).filter(Boolean))].sort()) soldier.appendChild(new Option(id, id));
      if ([...soldier.options].some(o => o.value === selected)) soldier.value = selected;
    }
    setupAuditFilters();
    renderAuditLog();
  } catch (error) {
    tbody.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = error.message || "Помилка завантаження журналу.";
    row.appendChild(cell);
    tbody.appendChild(row);
  }
}
