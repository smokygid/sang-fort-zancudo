document.addEventListener("DOMContentLoaded", async () => {
  const panel = document.getElementById("verify-result");
  const status = document.getElementById("verify-status");
  const message = document.getElementById("verify-message");
  const fields = document.getElementById("verify-fields");
  const token = new URLSearchParams(location.search).get("token") || "";
  if (!token) {
    panel.dataset.valid = "false";
    status.textContent = "ПОСИЛАННЯ НЕПОВНЕ";
    message.textContent = "У QR-коді відсутній токен перевірки.";
    return;
  }
  try {
    const response = await fetch("/api/verify-id-card?token=" + encodeURIComponent(token), { cache: "no-store" });
    const data = await response.json();
    panel.dataset.valid = data.valid ? "true" : "false";
    status.textContent = data.valid ? "ДОКУМЕНТ ДІЙСНИЙ" : "ДОКУМЕНТ НЕ ПІДТВЕРДЖЕНО";
    message.textContent = data.valid
      ? "Підпис документа підтверджено. Запис військовослужбовця знайдено в реєстрі SANG."
      : (data.message || "Не вдалося підтвердити документ.");
    if (data.valid && data.card) {
      const values = [
        ["ПІБ", data.card.fullName],
        ["ВІЙСЬКОВИЙ НОМЕР", data.card.serviceNumber],
        ["ВІЙСЬКОВЕ ЗВАННЯ", data.card.rank],
        ["ПІДРОЗДІЛ", data.card.unit],
        ["MOS", data.card.mos],
        ["СТАТУС СЛУЖБИ", data.card.serviceStatus]
      ];
      fields.replaceChildren();
      for (const [label, value] of values) {
        const item = document.createElement("div");
        item.className = "verify-field";
        const caption = document.createElement("small");
        caption.textContent = label;
        const content = document.createElement("strong");
        content.textContent = value || "Не зазначено";
        item.append(caption, content);
        fields.appendChild(item);
      }
      fields.hidden = false;
    }
  } catch {
    panel.dataset.valid = "false";
    status.textContent = "ПОМИЛКА ПЕРЕВІРКИ";
    message.textContent = "Сервіс перевірки тимчасово недоступний. Спробуйте пізніше.";
  }
});
