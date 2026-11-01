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
    document.getElementById("workspace-service-number").textContent = result.soldier.serviceNumber;
    document.getElementById("personnel-id").textContent = result.soldier.personnelId;
    document.getElementById("soldier-role").textContent = result.soldier.role === "admin" ? "Командування" : "Військовослужбовець";

    loadOwnProfile();
    const adminPanel = document.getElementById("admin-panel");
    if (result.soldier.role === "admin" && adminPanel) {
      adminPanel.hidden = false;
      const auditPanel = document.getElementById("audit-panel");
      if (auditPanel) auditPanel.hidden = true;
      document.getElementById("command-nav-link").hidden = false;
      document.getElementById("audit-nav-link").hidden = false;
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


async function loadRegistrySoldiers() {
  const selector = document.getElementById("registry-soldier-select");
  const details = document.getElementById("registry-soldier-details");
  if (!selector) return;
  selector.replaceChildren(new Option("Завантаження реєстру…", ""));
  try {
    const response = await fetch("/api/admin/accounts?source=registry", {
      credentials: "same-origin",
      cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося завантажити реєстр.");
    selector.replaceChildren();
    selector.appendChild(new Option("Оберіть військовослужбовця", ""));
    for (const soldier of data.soldiers || []) {
      const label = [soldier.fullName, soldier.serviceNumber, soldier.rank].filter(Boolean).join(" · ");
      selector.appendChild(new Option(label, soldier.serviceNumber));
    }
    if (details) {
      details.textContent = data.soldiers?.length
        ? "Доступні лише записи з реєстру, для яких ще немає облікового запису."
        : "Немає доступних записів: усім знайденим військовослужбовцям уже створено доступ або реєстр порожній.";
    }
  } catch (error) {
    selector.replaceChildren(new Option("Не вдалося завантажити список", ""));
    if (details) details.textContent = error.message;
  }
}


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
          serviceNumber: document.getElementById("registry-soldier-select").value
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


function buildRankInsignia(rank) {
  const value = String(rank || "").trim().toLocaleLowerCase("uk");
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 180 92");
  svg.setAttribute("class", "rank-insignia-svg");
  svg.setAttribute("aria-hidden", "true");
  const add = (tag, attrs) => {
    const node = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key, val]) => node.setAttribute(key, val));
    svg.appendChild(node);
  };
  add("rect", {x:2,y:2,width:176,height:88,rx:8,fill:"#263b2d",stroke:"#b9a36a","stroke-width":3});
  add("path", {d:"M8 8 H172 V84 H8 Z",fill:"none",stroke:"#63765c","stroke-width":1});
  const star = (x,y,size=9) => {
    let pts=[]; for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?size*.43:size;pts.push((x+Math.cos(a)*r)+","+(y+Math.sin(a)*r));}
    add("polygon",{points:pts.join(" "),fill:"#e6d39a",stroke:"#8e7742","stroke-width":1});
  };
  const chevron = (y, count=1) => {
    for(let i=0;i<count;i++){const yy=y+i*12;add("path",{d:`M ${48-i*5} ${yy} L90 ${yy+19} L${132+i*5} ${yy}`,fill:"none",stroke:"#d8c28a","stroke-width":7,"stroke-linecap":"square","stroke-linejoin":"miter"});}
  };
  const bar = (x,y,w=28,h=9) => add("rect",{x,y,width:w,height:h,rx:2,fill:"#d8c28a",stroke:"#8e7742","stroke-width":1});
  if (/генерал/.test(value)) {
    const n=value.includes("армії")||value.includes("армии")?5:value.includes("полковник")?4:value.includes("лейтенант")?3:value.includes("майор")?2:1;
    for(let i=0;i<n;i++) star(90-(n-1)*17/2+i*17,46,8);
  } else if (/полковник/.test(value)) {
    add("path",{d:"M90 20 l15 12 -15 12 -15 -12 Z",fill:"#d8c28a",stroke:"#8e7742","stroke-width":2});
  } else if (/підполковник|подполковник/.test(value)) {
    add("path",{d:"M90 22 l15 13 -15 13 -15 -13 Z",fill:"#d8c28a",stroke:"#8e7742","stroke-width":2});
  } else if (/майор/.test(value)) {
    add("path",{d:"M90 28 l14 14 -14 14 -14 -14 Z",fill:"#d8c28a",stroke:"#8e7742","stroke-width":2});
  } else if (/капітан|капитан/.test(value)) { bar(57,37,66,12); }
  else if (/лейтенант/.test(value)) { bar(76,37,28,12); }
  else if (/сержант-майор|перший сержант/.test(value)) { chevron(20,3); bar(77,68,26,8); }
  else if (/старший сержант|штаб-сержант/.test(value)) { chevron(28,3); }
  else if (/сержант|капрал/.test(value)) { chevron(34,/сержант/.test(value)?2:1); }
  else { bar(76,38,28,10); }
  return svg;
}

async function loadOwnProfile() {
  try {
    const response = await fetch("/api/profile", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося завантажити профіль.");
    const p = data.profile || {};
    document.getElementById("profile-full-name").value = p.fullName || "";
    const displayName = document.getElementById("profile-display-name");
    const sidebarName = document.getElementById("sidebar-soldier-name");
    if (displayName) displayName.textContent = p.fullName || "Не зазначено";
    if (sidebarName) sidebarName.textContent = p.fullName || "Військовослужбовець SANG";
    document.getElementById("profile-age").value = p.age ?? "";
    document.getElementById("profile-contact").value = p.contact || "";
    document.getElementById("profile-rank").textContent = p.rank || "Не зазначено";
    const insignia = document.getElementById("identity-rank-insignia");
    if (insignia) { insignia.replaceChildren(buildRankInsignia(p.rank)); insignia.setAttribute("aria-label", "Знаки розрізнення: " + (p.rank || "звання не зазначено")); insignia.title = p.rank || "Звання не зазначено"; }
    document.getElementById("profile-unit").textContent = p.unit || "Не зазначено";
    const sidebarRank = document.getElementById("sidebar-soldier-rank");
    const rankCopy = document.getElementById("profile-rank-copy");
    const unitCopy = document.getElementById("profile-unit-copy");
    const mosCopy = document.getElementById("profile-mos-copy");
    if (sidebarRank) sidebarRank.textContent = p.rank || "Особовий склад";
    if (rankCopy) rankCopy.textContent = p.rank || "Не зазначено";
    if (unitCopy) unitCopy.textContent = p.unit || "Не зазначено";
    if (mosCopy) mosCopy.textContent = p.mos || "Не зазначено";
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


document.addEventListener("DOMContentLoaded", () => {
  const selector = document.getElementById("registry-soldier-select");
  const refresh = document.getElementById("refresh-registry-soldiers");
  if (selector) {
    loadRegistrySoldiers();
    selector.addEventListener("change", () => {
      const option = selector.selectedOptions[0];
      const details = document.getElementById("registry-soldier-details");
      if (option && option.value && details) details.textContent = "Обрано: " + option.textContent + ". Дані буде повторно перевірено на сервері перед створенням доступу.";
    });
  }
  if (refresh) refresh.addEventListener("click", loadRegistrySoldiers);
});


function setupCabinetTabs() {
  const layout = document.querySelector("#dashboard-content .dashboard-workspace");
  const grid = layout?.querySelector(".dashboard-content-grid");
  const identity = layout?.querySelector("#profile-section");
  if (!layout || !grid || !identity || layout.dataset.tabsReady) return;
  layout.dataset.tabsReady = "true";

  const profile = grid.querySelector(".profile-card");
  const orders = grid.querySelector(".orders-card");
  const awards = grid.querySelector(".awards-card");
  const service = profile?.querySelector("#service-section");
  const panels = document.createElement("div");
  panels.className = "cabinet-tab-panels";
  panels.innerHTML = '<section class="cabinet-tab-panel" data-panel="profile"></section><section class="cabinet-tab-panel" data-panel="orders" hidden></section><section class="cabinet-tab-panel" data-panel="awards" hidden></section><section class="cabinet-tab-panel" data-panel="service" hidden></section>';
  identity.after(panels);
  panels.querySelector('[data-panel="profile"]').appendChild(profile);
  panels.querySelector('[data-panel="orders"]').appendChild(orders);
  panels.querySelector('[data-panel="awards"]').appendChild(awards);
  const servicePanel = panels.querySelector('[data-panel="service"]');
  if (service) {
    const serviceCard = document.createElement("article");
    serviceCard.className = "dashboard-card service-tab-card";
    serviceCard.appendChild(service);
    servicePanel.appendChild(serviceCard);
  }

  const labels = {profile:"Мій профіль",orders:"Накази та розпорядження",awards:"Нагороди та стягнення",service:"Службові відомості"};
  const heading = layout.querySelector(".workspace-heading h1");
  function activate(name) {
    if (!panels.querySelector('[data-panel="' + name + '"]')) name = "profile";
    panels.querySelectorAll(".cabinet-tab-panel").forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
    const command = document.getElementById("admin-panel");
    const audit = document.getElementById("audit-panel");
    const dashboardContent = document.getElementById("dashboard-content");
    if (dashboardContent) dashboardContent.hidden = false;
    const workspace = dashboardContent?.querySelector(".dashboard-workspace");
    workspace?.querySelector(".workspace-heading")?.removeAttribute("hidden");
    workspace?.querySelector("#profile-section")?.removeAttribute("hidden");
    workspace?.querySelector(".cabinet-tab-panels")?.removeAttribute("hidden");
    if (command) command.hidden = true;
    if (audit) audit.hidden = true;
    document.querySelectorAll(".cabinet-topnav a:not(#command-nav-link):not(#audit-nav-link), .dashboard-nav a").forEach(link => {
      const key = link.dataset.cabinetTab;
      link.classList.toggle("topnav-active", key === name);
      link.classList.toggle("active", key === name);
      if (key === name) link.setAttribute("aria-current","page"); else link.removeAttribute("aria-current");
    });
    document.getElementById("command-nav-link")?.classList.remove("topnav-active");
    document.getElementById("audit-nav-link")?.classList.remove("topnav-active");
    if (heading) heading.textContent = labels[name];
    history.replaceState(null,"", "#" + name);
  }
  document.querySelectorAll(".cabinet-topnav a:not(#command-nav-link):not(#audit-nav-link), .dashboard-nav a").forEach((link,index) => {
    const href = link.getAttribute("href") || "";
    const key = href.includes("orders") ? "orders" : href.includes("awards") ? "awards" : href.includes("service") ? "service" : "profile";
    link.dataset.cabinetTab = key;
    link.setAttribute("href","#" + key);
    link.addEventListener("click", event => { event.preventDefault(); activate(key); });
  });
  activate("profile");
}
document.addEventListener("DOMContentLoaded", setupCabinetTabs);

document.addEventListener("DOMContentLoaded", () => {
  const command = document.getElementById("admin-panel");
  const audit = document.getElementById("audit-panel");
  const commandLink = document.getElementById("command-nav-link");
  const auditLink = document.getElementById("audit-nav-link");
  if (!command || !audit || !commandLink || !auditLink) return;
  function showAdminSection(section) {
    const showAudit = section === "audit";
    const dashboardContent = document.getElementById("dashboard-content");
    if (dashboardContent) dashboardContent.hidden = false;
    const workspace = dashboardContent?.querySelector(".dashboard-workspace");
    if (workspace) {
      workspace.querySelector(".workspace-heading")?.setAttribute("hidden", "");
      workspace.querySelector("#profile-section")?.setAttribute("hidden", "");
      workspace.querySelector(".cabinet-tab-panels")?.setAttribute("hidden", "");
    }
    command.hidden = showAudit;
    audit.hidden = !showAudit;
    commandLink.classList.toggle("topnav-active", !showAudit);
    auditLink.classList.toggle("topnav-active", showAudit);
    document.querySelectorAll(".cabinet-topnav a:not(#command-nav-link):not(#audit-nav-link), .dashboard-nav a").forEach(link => {
      link.classList.remove("topnav-active", "active");
      link.removeAttribute("aria-current");
    });
    const title = document.querySelector(".workspace-heading h1");
    if (title) title.textContent = showAudit ? "Журнал аудиту дій" : "Панель командування";
    history.replaceState(null, "", showAudit ? "#audit" : "#command");
  }
  commandLink.addEventListener("click", e => { e.preventDefault(); showAdminSection("command"); });
  auditLink.addEventListener("click", e => { e.preventDefault(); showAdminSection("audit"); });
});
