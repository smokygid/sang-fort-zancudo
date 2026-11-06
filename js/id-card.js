document.addEventListener("DOMContentLoaded", () => {
  const openButton = document.getElementById("open-electronic-id-card");
  const panel = document.getElementById("electronic-id-card-panel");
  const message = document.getElementById("id-card-message");
  const closeButton = document.getElementById("close-electronic-id-card");
  const printButton = document.getElementById("print-electronic-id-card");
  if (!openButton || !panel) return;

  const text = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value || "—";
  };
  const formatDate = value => {
    if (!value) return "—";
    const date = new Date(String(value).length === 10 ? value + "T00:00:00" : value);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("uk-UA", {day:"2-digit",month:"2-digit",year:"numeric"}).format(date);
  };

  let loaded = false;
  openButton.addEventListener("click", async () => {
    panel.hidden = false;
    panel.scrollIntoView({behavior:"smooth",block:"start"});
    if (loaded) return;
    openButton.disabled = true;
    message.textContent = "Формуємо документ за актуальними даними реєстру…";
    try {
      const response = await fetch("/api/id-card", {credentials:"same-origin",cache:"no-store"});
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Не вдалося сформувати документ.");
      const card = data.card || {};
      text("id-card-number", card.serviceNumber);
      text("id-card-name", card.fullName || "Ім’я не зазначено");
      text("id-card-rank", card.rank || "Звання не зазначено");
      text("id-card-status", card.serviceStatus || "Статус не зазначено");
      text("id-card-service-number", card.serviceNumber);
      text("id-card-unit", card.unit);
      text("id-card-mos", card.mos);
      text("id-card-contract-start", formatDate(card.contractStart));
      text("id-card-contract-end", formatDate(card.contractEnd));
      text("id-card-issued", formatDate(card.issuedAt));

      const qr = document.getElementById("id-card-qr");
      qr.replaceChildren();
      if (typeof QRCode === "function") {
        new QRCode(qr, {text:data.verifyUrl,width:94,height:94,colorDark:"#07111d",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});
      } else {
        qr.textContent = "QR недоступний";
      }
      message.textContent = "Документ сформовано. QR-код містить підписане посилання для онлайн-перевірки.";
      loaded = true;
    } catch (error) {
      message.textContent = error.message || "Сталася помилка під час формування документа.";
    } finally {
      openButton.disabled = false;
    }
  });

  closeButton?.addEventListener("click", () => {
    panel.hidden = true;
    openButton.focus();
  });
  printButton?.addEventListener("click", () => {
    document.body.classList.add("id-card-print-mode");
    window.addEventListener("afterprint", () => document.body.classList.remove("id-card-print-mode"), {once:true});
    window.print();
  });
});
