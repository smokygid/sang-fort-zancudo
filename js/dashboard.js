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

    const registrationsLink = document.getElementById("registrations-nav-link");
    if (registrationsLink) {
      const isAdmin = result.soldier.role === "admin";
      registrationsLink.hidden = !isAdmin;
      if (isAdmin) registrationsLink.style.removeProperty("display");
      else registrationsLink.style.setProperty("display", "none", "important");
    }

    if (result.soldier.role === "faction_leader") { location.replace("/cabinet/faction/"); return; }
    document.getElementById("soldier-number").textContent = result.soldier.serviceNumber;
    document.getElementById("workspace-service-number").textContent = result.soldier.serviceNumber;
    document.getElementById("personnel-id").textContent = result.soldier.personnelId;
    document.getElementById("soldier-role").textContent = result.soldier.role === "admin" ? "Командування" : "Військовослужбовець";

    loadOwnProfile();
    loadNotifications();
    const adminPanel = document.getElementById("admin-panel");
    if (result.soldier.role === "admin" && adminPanel) {
      // Панелі командування й аудиту відкриваються лише після вибору відповідного пункту меню.
      adminPanel.hidden = true;
      const auditPanel = document.getElementById("audit-panel");
      if (auditPanel) auditPanel.hidden = true;
      document.getElementById("command-nav-link").hidden = false;
      const materialsNavLink = document.getElementById("materials-nav-link");
      if (materialsNavLink) materialsNavLink.hidden = false;
      const contractsNavLink = document.getElementById("contracts-nav-link");
      if (contractsNavLink) contractsNavLink.hidden = false;
      document.getElementById("audit-nav-link").hidden = false;
      if (registrationsLink) { registrationsLink.hidden = false; registrationsLink.style.removeProperty("display"); }
      loadAccounts();
      loadAdminProfiles();
      loadAuditLog();
      loadCommandOrderOverview();
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
  const factionBody = document.getElementById("faction-leaders-list");
  if (!tbody && !factionBody) return;
  if (tbody) tbody.innerHTML = '<tr><td colspan="6">Завантаження…</td></tr>';
  if (factionBody) factionBody.innerHTML = '<tr><td colspan="7">Завантаження…</td></tr>';
  try {
    const response = await fetch("/api/admin/accounts", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося завантажити список.");
    const accounts = data.accounts || [];
    updateCommandAccountStats(accounts);
    if (tbody) {
      tbody.replaceChildren();
      for (const account of accounts.filter(item => item.role !== "faction_leader")) {
        const tr = document.createElement("tr");
        const values = [
          account.service_number || "—",
          account.personnel_id || "—",
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
        } else actionCell.textContent = "—";
        tr.appendChild(actionCell);
        tbody.appendChild(tr);
      }
      if (!accounts.some(item => item.role !== "faction_leader")) {
        const tr = document.createElement("tr"), td = document.createElement("td");
        td.colSpan = 6; td.textContent = "Облікових записів особового складу поки немає.";
        tr.appendChild(td); tbody.appendChild(tr);
      }
    }
    if (factionBody) {
      factionBody.replaceChildren();
      const leaders = accounts.filter(item => item.role === "faction_leader");
      for (const account of leaders) {
        const tr = document.createElement("tr");
        const created = account.created_at ? new Date(String(account.created_at).replace(" ", "T") + (String(account.created_at).endsWith("Z") ? "" : "Z")).toLocaleString("uk-UA") : "—";
        const values = [account.full_name || "—", account.faction_name || "—", account.service_number || "—", account.personnel_id || "—", created, account.active ? "Активний" : "Заблокований"];
        for (const value of values) {
          const td = document.createElement("td");
          td.textContent = value;
          tr.appendChild(td);
        }
        const actionCell = document.createElement("td");
        const action = document.createElement("button");
        action.type = "button";
        action.className = "cabinet-logout account-status-button";
        action.dataset.accountId = String(account.id);
        action.dataset.nextActive = account.active ? "false" : "true";
        action.textContent = account.active ? "ЗАБЛОКУВАТИ" : "РОЗБЛОКУВАТИ";
        actionCell.appendChild(action);
        tr.appendChild(actionCell);
        factionBody.appendChild(tr);
      }
      if (!leaders.length) {
        const tr = document.createElement("tr"), td = document.createElement("td");
        td.colSpan = 7; td.textContent = "Керівники фракцій ще не активували доступ.";
        tr.appendChild(td); factionBody.appendChild(tr);
      }
    }
  } catch (error) {
    for (const target of [tbody, factionBody]) {
      if (!target) continue;
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = target === factionBody ? 7 : 6;
      td.textContent = error.message || "Помилка завантаження.";
      tr.replaceChildren(td); target.replaceChildren(tr);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  ["personnel-search","personnel-filter-rank","personnel-filter-unit","personnel-filter-status"].forEach(id => {
    const control = document.getElementById(id);
    if (control) control.addEventListener("input", renderCommandPersonnel);
    if (control && control.tagName === "SELECT") control.addEventListener("change", renderCommandPersonnel);
  });
  const resetPersonnelFilters = document.getElementById("personnel-reset-filters");
  if (resetPersonnelFilters) resetPersonnelFilters.addEventListener("click", () => {
    ["personnel-search","personnel-filter-rank","personnel-filter-unit","personnel-filter-status"].forEach(id => {
      const control = document.getElementById(id);
      if (control) control.value = "";
    });
    const quick = document.getElementById("personnel-quick-profile");
    if (quick) quick.hidden = true;
    renderCommandPersonnel();
  });

  const form = document.getElementById("account-create-form");
  const refresh = document.getElementById("refresh-accounts");
  const refreshFactions = document.getElementById("refresh-accounts-factions");
  if (refresh) refresh.addEventListener("click", loadAccounts);
  if (refreshFactions) refreshFactions.addEventListener("click", loadAccounts);
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
    const personalForm = document.getElementById("personal-profile-form");
    if (personalForm) {
      personalForm.dataset.saved = JSON.stringify({fullName:p.fullName || "",age:String(p.age ?? ""),contact:p.contact || ""});
      const saveButton = personalForm.querySelector('button[type="submit"]');
      if (saveButton) saveButton.hidden = true;
    }
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
    loadOwnServiceRecords();
    loadOwnContract();
  } catch (error) {
    document.getElementById("personal-profile-message").textContent = error.message;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const personalForm = document.getElementById("personal-profile-form");
  if (personalForm) {
    const saveButton = personalForm.querySelector('button[type="submit"]');
    const readValues = () => ({
      fullName: document.getElementById("profile-full-name").value.trim(),
      age: document.getElementById("profile-age").value,
      contact: document.getElementById("profile-contact").value.trim()
    });
    const updateSaveButton = () => {
      const saved = JSON.parse(personalForm.dataset.saved || "{}");
      const current = readValues();
      const changed = current.fullName !== (saved.fullName || "") ||
        current.age !== String(saved.age ?? "") ||
        current.contact !== (saved.contact || "");
      saveButton.hidden = !changed;
    };
    personalForm.querySelectorAll("input").forEach(input => input.addEventListener("input", updateSaveButton));
    personalForm.addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.getElementById("personal-profile-message");
    const button = saveButton;
    button.disabled = true; message.textContent = "";
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(readValues())
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося зберегти дані.");
      message.textContent = data.message;
      personalForm.dataset.saved = JSON.stringify(readValues());
      updateSaveButton();
      const displayName = document.getElementById("profile-display-name");
      const sidebarName = document.getElementById("sidebar-soldier-name");
      if (displayName) displayName.textContent = readValues().fullName || "Не зазначено";
      if (sidebarName) sidebarName.textContent = readValues().fullName || "Військовослужбовець SANG";
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
    });
  }

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

let commandPersonnelProfiles = [];

function populatePersonnelFilter(id, values, placeholder) {
  const select = document.getElementById(id);
  if (!select) return;
  const previous = select.value;
  select.replaceChildren(new Option(placeholder, ""));
  [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "uk"))
    .forEach(value => select.add(new Option(value, value)));
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
}

function renderCommandPersonnel() {
  const tbody = document.getElementById("service-profiles-list");
  if (!tbody) return;
  const query = (document.getElementById("personnel-search")?.value || "").trim().toLocaleLowerCase("uk");
  const rank = document.getElementById("personnel-filter-rank")?.value || "";
  const unit = document.getElementById("personnel-filter-unit")?.value || "";
  const status = document.getElementById("personnel-filter-status")?.value || "";
  const filtered = commandPersonnelProfiles.filter(p => {
    const haystack = [p.full_name, p.service_number].filter(Boolean).join(" ").toLocaleLowerCase("uk");
    return (!query || haystack.includes(query)) &&
      (!rank || (p.rank || "") === rank) &&
      (!unit || (p.unit || "") === unit) &&
      (!status || (p.service_status || "") === status);
  });
  tbody.replaceChildren();
  for (const p of filtered) {
    const row = document.createElement("tr");
    const values = [p.service_number || "—", p.full_name || "—", p.rank || "—", p.unit || "—", p.mos || "—", p.service_status || "—", p.lookup_error ? "Помилка API" : (p.found_in_registry ? "Знайдено" : "Немає запису")];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }
    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "personnel-open-profile";
    button.textContent = "ПРОФІЛЬ";
    button.addEventListener("click", () => showCommandPersonnelProfile(p));
    actionCell.appendChild(button);
    row.appendChild(actionCell);
    tbody.appendChild(row);
  }
  const count = document.getElementById("personnel-results-count");
  if (count) count.textContent = "Знайдено: " + filtered.length + " із " + commandPersonnelProfiles.length;
  if (!filtered.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.textContent = commandPersonnelProfiles.length ? "За заданими параметрами військовослужбовців не знайдено." : "Облікових записів військовослужбовців поки немає.";
    row.appendChild(cell);
    tbody.appendChild(row);
  }
}

function showCommandPersonnelProfile(p) {
  const panel = document.getElementById("personnel-quick-profile");
  if (!panel) return;
  panel.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "personnel-quick-heading";
  const title = document.createElement("strong");
  title.textContent = p.full_name || "Військовослужбовець";
  const number = document.createElement("span");
  number.textContent = p.service_number || "Номер не зазначено";
  heading.append(title, number);
  const grid = document.createElement("div");
  grid.className = "personnel-quick-grid";
  const fields = [["Звання",p.rank],["Підрозділ",p.unit],["MOS",p.mos],["Статус служби",p.service_status],["Запис у реєстрі",p.lookup_error ? "Помилка API" : (p.found_in_registry ? "Знайдено" : "Не знайдено")]];
  for (const [label,value] of fields) {
    const item = document.createElement("div");
    const caption = document.createElement("small");
    caption.textContent = label;
    const content = document.createElement("b");
    content.textContent = value || "Не зазначено";
    item.append(caption,content);
    grid.appendChild(item);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.className = "cabinet-logout";
  close.textContent = "ЗАКРИТИ";
  close.addEventListener("click", () => { panel.hidden = true; });
  panel.append(heading,grid,close);
  panel.hidden = false;
  panel.scrollIntoView({behavior:"smooth",block:"nearest"});
}

async function loadAdminProfiles() {
  const tbody = document.getElementById("service-profiles-list");
  const message = document.getElementById("service-profile-message");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8">Завантаження реєстру…</td></tr>';
  if (message) message.textContent = "";
  try {
    const response = await fetch("/api/admin/profiles", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося завантажити реєстр.");
    commandPersonnelProfiles = data.profiles || [];
    populateServiceRecordSoldiers(commandPersonnelProfiles);
    populateContractSoldiers(commandPersonnelProfiles);
    loadAdminContracts();
    populatePersonnelFilter("personnel-filter-rank", commandPersonnelProfiles.map(p => p.rank), "Усі звання");
    populatePersonnelFilter("personnel-filter-unit", commandPersonnelProfiles.map(p => p.unit), "Усі підрозділи");
    populatePersonnelFilter("personnel-filter-status", commandPersonnelProfiles.map(p => p.service_status), "Усі статуси");
    renderCommandPersonnel();
  } catch (error) {
    tbody.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
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
  service_profile_updated: "Оновлено службовий профіль",
  service_record_created: "Додано запис до особової справи",
  service_record_deleted: "Видалено запис з особової справи",
  order_deleted: "Видалено службовий документ",
  contract_created: "Оформлено / продовжено контракт"
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

function updateCommandAccountStats(accounts) {
  const total = accounts.length;
  const active = accounts.filter(account => account.active).length;
  const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = String(value); };
  set("overview-total-accounts", total);
  set("overview-active-accounts", active);
  set("overview-blocked-accounts", total - active);
  const stamp = document.getElementById("command-overview-updated");
  if (stamp) stamp.textContent = "Оновлено: " + new Date().toLocaleTimeString("uk-UA", {hour:"2-digit",minute:"2-digit"});
}

function renderOverviewFeed(targetId, entries, emptyText, renderEntry) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "overview-empty";
    empty.textContent = emptyText;
    target.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    const item = document.createElement("div");
    item.className = "overview-feed-item";
    renderEntry(item, entry);
    target.appendChild(item);
  }
}

async function loadCommandOrderOverview() {
  const target = document.getElementById("overview-latest-orders");
  if (!target) return;
  try {
    const response = await fetch("/api/orders", {credentials:"same-origin",cache:"no-store"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Не вдалося завантажити накази.");
    const orders = (data.orders || []).slice(0, 4);
    renderOverviewFeed("overview-latest-orders", orders, "Опублікованих наказів поки немає.", (item, order) => {
      const title = document.createElement("strong");
      title.textContent = [order.order_number, order.title].filter(Boolean).join(" · ") || "Службовий документ";
      const meta = document.createElement("small");
      meta.textContent = [order.order_date || order.issued_at || "", order.status || "Опубліковано"].filter(Boolean).join(" · ");
      item.append(title, meta);
    });
  } catch (error) {
    target.textContent = error.message || "Помилка завантаження наказів.";
  }
}

function renderCommandAuditOverview() {
  const entries = (auditEntries || []).slice(0, 4);
  renderOverviewFeed("overview-latest-audit", entries, "Нових записів у журналі немає.", (item, entry) => {
    const title = document.createElement("strong");
    title.textContent = entry.action_label || entry.action || "Службова дія";
    const meta = document.createElement("small");
    meta.textContent = [entry.created_at || entry.timestamp || "", entry.actor_name || entry.actor_service_number || "", entry.target_service_number || ""].filter(Boolean).join(" · ");
    item.append(title, meta);
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
    renderCommandAuditOverview();
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
  const form = document.getElementById("faction-invite-form");
  if (!form) return;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.getElementById("faction-invite-message");
    const result = document.getElementById("faction-invite-result");
    const button = form.querySelector('button[type="submit"]');
    message.textContent = ""; result.hidden = true; button.disabled = true;
    try {
      const response = await fetch("/api/admin/faction-invites", { method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ factionName:document.getElementById("invite-faction-name").value, contactName:document.getElementById("invite-contact-name").value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося створити запрошення.");
      result.hidden = false; result.replaceChildren();
      const link = document.createElement("a"); link.href = data.inviteUrl; link.textContent = data.inviteUrl; link.target = "_blank"; link.rel = "noopener";
      result.append("Посилання дійсне до " + new Date(data.expiresAt).toLocaleString("uk-UA") + ": ", link);
      message.textContent = data.message;
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });
});

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
    document.querySelectorAll(".cabinet-topnav a:not(#command-nav-link):not(#audit-nav-link):not(#registrations-nav-link), .dashboard-nav a").forEach(link => {
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
  document.querySelectorAll(".cabinet-topnav a:not(#command-nav-link):not(#audit-nav-link):not(#registrations-nav-link), .dashboard-nav a").forEach((link,index) => {
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
  const contractsLink = document.getElementById("contracts-nav-link");
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
    document.querySelectorAll(".cabinet-topnav a:not(#command-nav-link):not(#audit-nav-link):not(#registrations-nav-link), .dashboard-nav a").forEach(link => {
      link.classList.remove("topnav-active", "active");
      link.removeAttribute("aria-current");
    });
    const title = document.querySelector(".workspace-heading h1");
    if (title) title.textContent = showAudit ? "Журнал аудиту дій" : "Панель командування";
    history.replaceState(null, "", showAudit ? "#audit" : "#command");
  }
  commandLink.addEventListener("click", e => { e.preventDefault(); showAdminSection("command"); });
  auditLink.addEventListener("click", e => { e.preventDefault(); showAdminSection("audit"); });
  contractsLink?.addEventListener("click", e => {
    e.preventDefault();
    showAdminSection("command");
    history.replaceState(null, "", "#command-contracts");
    document.getElementById("command-contracts")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

const SERVICE_RECORD_LABELS = { award:"НАГОРОДА / ЗАОХОЧЕННЯ", reprimand:"ДИСЦИПЛІНАРНЕ СТЯГНЕННЯ", history:"ПОДІЯ ПРОХОДЖЕННЯ СЛУЖБИ" };

function renderServiceRecordItems(target, records) {
  target.replaceChildren();
  if (!records.length) { const empty=document.createElement("div"); empty.className="service-record-empty"; empty.textContent="У службовій історії поки немає записів."; target.appendChild(empty); return; }
  for (const record of records) {
    const item=document.createElement("article"); item.className="service-record-item"; item.dataset.type=record.record_type;
    const top=document.createElement("div"); top.className="service-record-top";
    const type=document.createElement("span"); type.className="service-record-type"; type.textContent=SERVICE_RECORD_LABELS[record.record_type] || "СЛУЖБОВИЙ ЗАПИС";
    const date=document.createElement("time"); date.className="service-record-date"; date.textContent=record.record_date ? new Date(record.record_date+"T00:00:00").toLocaleDateString("uk-UA") : "Дата не зазначена";
    top.append(type,date); const title=document.createElement("h3"); title.textContent=record.title || "Без назви"; item.append(top,title);
    if(record.description){const description=document.createElement("p");description.textContent=record.description;item.appendChild(description);}
    if(record.document_number){const doc=document.createElement("div");doc.className="service-record-document";doc.textContent="Підстава: "+record.document_number;item.appendChild(doc);}
    target.appendChild(item);
  }
}

async function loadOwnServiceRecords() {
  const target=document.getElementById("own-service-records"); if(!target)return;
  try { const response=await fetch("/api/service-records",{credentials:"same-origin",cache:"no-store"}); const data=await response.json(); if(!response.ok)throw new Error(data.message||"Не вдалося завантажити службову історію."); const records=data.records||[]; const count=document.getElementById("service-record-count"); if(count)count.textContent=String(records.length); renderServiceRecordItems(target,records); }
  catch(error){target.textContent=error.message||"Помилка завантаження службової історії.";}
}

function populateServiceRecordSoldiers(profiles) {
  const select=document.getElementById("service-record-soldier"); if(!select)return;
  select.replaceChildren(new Option("Оберіть військовослужбовця",""));
  for(const p of profiles){const label=[p.full_name,p.service_number].filter(Boolean).join(" · ");select.appendChild(new Option(label||p.service_number,String(p.id)));}
}

document.addEventListener("DOMContentLoaded", () => {
  const form=document.getElementById("service-record-form"); if(!form)return;
  const soldier=document.getElementById("service-record-soldier");
  const dateInput=document.getElementById("service-record-date");
  const list=document.getElementById("service-record-admin-list");
  const message=document.getElementById("service-record-admin-message");
  if(dateInput)dateInput.value=new Date().toISOString().slice(0,10);

  async function loadSelectedServiceRecords() {
    if(!list || !soldier.value){if(list)list.textContent="Оберіть військовослужбовця для перегляду записів.";return;}
    list.textContent="Завантаження записів…";
    try{
      const response=await fetch("/api/service-records?accountId="+encodeURIComponent(soldier.value),{credentials:"same-origin",cache:"no-store"});
      const data=await response.json();if(!response.ok)throw new Error(data.message||"Не вдалося завантажити записи.");
      list.replaceChildren();
      const records=data.records||[];
      if(!records.length){list.textContent="У цього військовослужбовця записів поки немає.";return;}
      for(const record of records){
        const card=document.createElement("article");card.className="service-record-item";
        const heading=document.createElement("h4");heading.textContent=(SERVICE_RECORD_LABELS[record.record_type]||"СЛУЖБОВИЙ ЗАПИС")+" · "+(record.record_date||"");
        const title=document.createElement("strong");title.textContent=record.title||"Без назви";
        const description=document.createElement("p");description.textContent=[record.description,record.document_number?"Підстава: "+record.document_number:""].filter(Boolean).join(" · ");
        const remove=document.createElement("button");remove.type="button";remove.className="cabinet-logout admin-delete-button";remove.textContent="ВИДАЛИТИ ЗАПИС";
        remove.addEventListener("click",async()=>{
          if(!confirm("Видалити запис «"+(record.title||"Без назви")+"» з особової справи? Цю дію неможливо скасувати."))return;
          remove.disabled=true;
          try{
            const deletion=await fetch("/api/service-records",{method:"DELETE",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:record.id})});
            const result=await deletion.json();if(!deletion.ok)throw new Error(result.message||"Не вдалося видалити запис.");
            message.textContent=result.message;await loadSelectedServiceRecords();
          }catch(error){message.textContent=error.message;remove.disabled=false;}
        });
        card.append(heading,title);if(description.textContent)card.appendChild(description);card.appendChild(remove);list.appendChild(card);
      }
    }catch(error){list.textContent=error.message||"Помилка завантаження записів.";}
  }

  soldier.addEventListener("change",loadSelectedServiceRecords);
  form.addEventListener("submit",async event=>{
    event.preventDefault();const button=form.querySelector('button[type="submit"]');button.disabled=true;message.textContent="";
    try{
      const response=await fetch("/api/service-records",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:soldier.value,recordType:document.getElementById("service-record-type").value,title:document.getElementById("service-record-title").value,recordDate:document.getElementById("service-record-date").value,documentNumber:document.getElementById("service-record-document").value,description:document.getElementById("service-record-description").value})});
      const data=await response.json();if(!response.ok)throw new Error(data.message||"Не вдалося додати запис.");
      message.textContent=data.message||"Запис додано.";const selectedSoldier=soldier.value;form.reset();soldier.value=selectedSoldier;if(dateInput)dateInput.value=new Date().toISOString().slice(0,10);await loadSelectedServiceRecords();
    }catch(error){message.textContent=error.message;}finally{button.disabled=false;}
  });
});


// Personnel contracts: current term and retained contract history.
let adminContractRows = [];

function formatContractDate(value) {
  if (!value) return "—";
  const parts=String(value).split("-");
  return parts.length===3 ? parts[2]+"."+parts[1]+"."+parts[0] : value;
}

function localDateInputValue(date=new Date()) {
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+d;
}

function renderPersonalContract(data) {
  const current=document.getElementById("personal-contract-current");
  const history=document.getElementById("personal-contract-history");
  if(!current)return;
  const c=data.current;
  current.replaceChildren();
  if(!c){
    const empty=document.createElement("p");empty.className="contract-empty";empty.textContent="Чинний контракт у системі ще не оформлено.";current.appendChild(empty);
  }else{
    const grid=document.createElement("div");grid.className="contract-personal-grid";
    const fields=[["ПОЧАТОК",formatContractDate(c.start_date)],["ТЕРМІН",c.duration_days+" днів"],["ЗАВЕРШЕННЯ",formatContractDate(c.end_date)],["ЗАЛИШИЛОСЯ",c.status==="expired"?"0 днів":c.days_left+" днів"]];
    for(const [label,value] of fields){const cell=document.createElement("div");const small=document.createElement("small");small.textContent=label;const strong=document.createElement("strong");strong.textContent=value;cell.append(small,strong);grid.appendChild(cell);}
    const status=document.createElement("p");status.className="contract-status "+(c.status==="expired"?"is-expired":Number(c.days_left)<=3?"is-warning":"is-active");status.textContent=c.status==="expired"?"ТЕРМІН КОНТРАКТУ ЗАВЕРШИВСЯ":Number(c.days_left)<=3?"УВАГА: КОНТРАКТ ЗАВЕРШУЄТЬСЯ":"КОНТРАКТ ДІЄ";
    current.append(grid,status);
  }
  if(history){
    history.replaceChildren();
    const old=(data.history||[]).slice(1);
    if(old.length){
      const heading=document.createElement("h4");heading.textContent="ПОПЕРЕДНІ КОНТРАКТИ";history.appendChild(heading);
      for(const item of old){const line=document.createElement("p");line.textContent=formatContractDate(item.start_date)+" — "+formatContractDate(item.end_date)+" · "+item.duration_days+" днів";history.appendChild(line);}
    }
  }
}

async function loadOwnContract() {
  const target=document.getElementById("personal-contract-current");if(!target)return;
  try{const response=await fetch("/api/contracts",{credentials:"same-origin",cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.message||"Не вдалося завантажити контракт.");renderPersonalContract(data);}
  catch(error){target.textContent=error.message||"Помилка завантаження контракту.";}
}

function populateContractSoldiers(profiles) {
  const select=document.getElementById("contract-soldier");if(!select)return;
  select.replaceChildren(new Option("Оберіть військовослужбовця",""));
  for(const p of profiles){const label=[p.full_name,p.service_number].filter(Boolean).join(" · ");select.appendChild(new Option(label||p.service_number,String(p.id)));}
}

function renderAdminContracts(rows) {
  const tbody=document.getElementById("contracts-admin-list");if(!tbody)return;
  tbody.replaceChildren();
  if(!rows.length){const row=document.createElement("tr"),cell=document.createElement("td");cell.colSpan=7;cell.textContent="Контракти ще не оформлені.";row.appendChild(cell);tbody.appendChild(row);return;}
  for(const c of rows){
    const row=document.createElement("tr");
    const days=c.id===null||c.id===undefined?"—":c.status==="expired"?"0":String(c.days_left);
    let status=c.status==="missing"?"Не оформлено":c.status==="expired"?"Завершено":Number(c.days_left)<=3?"Завершується":"Діє";
    const values=[c.service_number||"—",c.full_name||"Не зазначено",formatContractDate(c.start_date),c.duration_days?c.duration_days+" днів":"—",formatContractDate(c.end_date),days,status];
    for(const value of values){const cell=document.createElement("td");cell.textContent=value;row.appendChild(cell);}
    if(c.status==="expired")row.dataset.contractStatus="expired";else if(c.status==="missing")row.dataset.contractStatus="missing";else if(Number(c.days_left)<=3)row.dataset.contractStatus="warning";
    tbody.appendChild(row);
  }
}

async function loadAdminContracts() {
  const tbody=document.getElementById("contracts-admin-list");if(!tbody)return;
  try{const response=await fetch("/api/contracts",{credentials:"same-origin",cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.message||"Не вдалося завантажити контракти.");adminContractRows=data.contracts||[];renderAdminContracts(adminContractRows);}
  catch(error){tbody.replaceChildren();const row=document.createElement("tr"),cell=document.createElement("td");cell.colSpan=7;cell.textContent=error.message||"Помилка завантаження контрактів.";row.appendChild(cell);tbody.appendChild(row);}
}

document.addEventListener("DOMContentLoaded",()=>{
  const form=document.getElementById("contract-form");if(!form)return;
  const soldier=document.getElementById("contract-soldier");
  const start=document.getElementById("contract-start-date");
  const duration=document.getElementById("contract-duration");
  const hint=document.getElementById("contract-date-hint");
  const message=document.getElementById("contract-admin-message");
  const today=localDateInputValue();if(start)start.value=today;
  const updatePreview=()=>{
    const begin=start.value;
    if(!begin){hint.textContent="Оберіть дату початку контракту.";return;}
    const end=new Date(Date.parse(begin+"T00:00:00Z")+Number(duration.value)*86400000).toISOString().slice(0,10);
    hint.textContent="Орієнтовна дата завершення: "+formatContractDate(end)+".";
  };
  soldier.addEventListener("change",()=>{
    const existing=adminContractRows.find(row=>String(row.account_id)===soldier.value);
    if(existing&&existing.end_date&&existing.end_date>=today){
      const next=new Date(Date.parse(existing.end_date+"T00:00:00Z")+86400000).toISOString().slice(0,10);
      start.value=next;
      hint.textContent="Продовження: новий контракт почнеться наступного дня після завершення чинного — "+formatContractDate(next)+".";
    }else{start.value=today;updatePreview();}
  });
  start.addEventListener("change",updatePreview);duration.addEventListener("change",updatePreview);updatePreview();
  form.addEventListener("submit",async event=>{
    event.preventDefault();const button=form.querySelector('button[type="submit"]');button.disabled=true;message.textContent="";
    try{
      const response=await fetch("/api/contracts",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:soldier.value,startDate:start.value,durationDays:Number(duration.value)})});
      const data=await response.json();if(!response.ok)throw new Error(data.message||"Не вдалося оформити контракт.");
      message.textContent=data.message+" Дата завершення: "+formatContractDate(data.endDate)+".";
      await loadAdminContracts();
      start.value=today;updatePreview();
    }catch(error){message.textContent=error.message||"Помилка збереження контракту.";}
    finally{button.disabled=false;}
  });
  document.getElementById("refresh-contracts")?.addEventListener("click",loadAdminContracts);
});


// Unified personal notification center.
let currentNotifications = [];

function formatNotificationDate(value) {
  if (!value) return "Дата не зазначена";
  const date = new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("uk-UA", { dateStyle:"short", timeStyle:"short" });
}

function renderNotifications(data) {
  const list=document.getElementById("notifications-list");
  const count=document.getElementById("notifications-unread-count");
  const status=document.getElementById("notifications-status");
  const markAll=document.getElementById("notifications-mark-all");
  if(!list)return;
  currentNotifications=Array.isArray(data.notifications)?data.notifications:[];
  const unread=Number(data.unreadCount||0);
  if(count)count.textContent=String(unread);
  if(markAll)markAll.hidden=unread===0;
  if(status)status.textContent=unread ? "Непрочитаних сповіщень: "+unread : "Усі сповіщення переглянуті.";
  list.replaceChildren();
  if(!currentNotifications.length){
    const empty=document.createElement("p");empty.className="notifications-empty";empty.textContent="Нових службових повідомлень поки немає.";list.appendChild(empty);return;
  }
  for(const item of currentNotifications){
    const card=document.createElement("article");card.className="notification-item"+(Number(item.is_read)===1?" is-read":" is-unread");
    const top=document.createElement("div");top.className="notification-item-top";
    const label=document.createElement("span");label.className="notification-type";
    const labels={contract:"КОНТРАКТ",award:"ВІДЗНАКА",reprimand:"СТЯГНЕННЯ",history:"СЛУЖБОВА ІСТОРІЯ",system:"СИСТЕМА"};
    label.textContent=labels[item.notification_type]||"СПОВІЩЕННЯ";
    const date=document.createElement("time");date.textContent=formatNotificationDate(item.created_at);
    top.append(label,date);
    const title=document.createElement("h3");title.textContent=item.title||"Службове сповіщення";
    const message=document.createElement("p");message.textContent=item.message||"";
    card.append(top,title,message);
    const actions=document.createElement("div");actions.className="notification-actions";
    if(item.link && /^#[a-zA-Z0-9_-]+$/.test(item.link)){
      const link=document.createElement("a");link.href=item.link;link.textContent="ПЕРЕЙТИ ДО РОЗДІЛУ";actions.appendChild(link);
    }
    if(Number(item.is_read)!==1){
      const button=document.createElement("button");button.type="button";button.className="cabinet-logout";button.textContent="ПОЗНАЧИТИ ПРОЧИТАНИМ";
      button.addEventListener("click",()=>markNotificationRead(item.id,button));actions.appendChild(button);
    }else{
      const read=document.createElement("span");read.className="notification-read-label";read.textContent="ПРОЧИТАНО";actions.appendChild(read);
    }
    card.appendChild(actions);list.appendChild(card);
  }
}

async function loadNotifications() {
  const list=document.getElementById("notifications-list");if(!list)return;
  try{
    const response=await fetch("/api/notifications",{credentials:"same-origin",cache:"no-store"});
    const data=await response.json();if(!response.ok)throw new Error(data.message||"Не вдалося завантажити сповіщення.");
    renderNotifications(data);
  }catch(error){
    list.textContent=error.message||"Помилка завантаження сповіщень.";
    const status=document.getElementById("notifications-status");if(status)status.textContent="Центр сповіщень тимчасово недоступний.";
  }
}

async function markNotificationRead(id,button) {
  if(button)button.disabled=true;
  try{
    const response=await fetch("/api/notifications",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({notificationId:id})});
    const data=await response.json();if(!response.ok)throw new Error(data.message||"Не вдалося оновити сповіщення.");
    await loadNotifications();
  }catch(error){
    if(button){button.disabled=false;button.textContent="ПОВТОРИТИ";}
    const status=document.getElementById("notifications-status");if(status)status.textContent=error.message;
  }
}

document.addEventListener("DOMContentLoaded",()=>{
  const markAll=document.getElementById("notifications-mark-all");
  markAll?.addEventListener("click",async()=>{
    markAll.disabled=true;
    try{
      const response=await fetch("/api/notifications",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({markAll:true})});
      const data=await response.json();if(!response.ok)throw new Error(data.message||"Не вдалося оновити сповіщення.");
      await loadNotifications();
    }catch(error){
      const status=document.getElementById("notifications-status");if(status)status.textContent=error.message;
    }finally{markAll.disabled=false;}
  });
});
