document.addEventListener("DOMContentLoaded", () => {
  const target = document.getElementById("sang-ops-announcement");
  if (!target) return;

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const formatDate = value => {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? match[3] + "." + match[2] + "." + match[1] : String(value || "");
  };

  fetch("/api/news", { cache: "no-store" })
    .then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error("Не вдалося отримати повідомлення.");
      return Array.isArray(data.news) ? data.news : [];
    })
    .then(items => {
      const announcements = items
        .filter(item => Number(item.is_announcement) === 1)
        .sort((a, b) => {
          const dateCompare = String(b.news_date || "").localeCompare(String(a.news_date || ""));
          return dateCompare || Number(b.id || 0) - Number(a.id || 0);
        });
      const item = announcements[0];
      target.replaceChildren();

      if (!item) {
        target.append(
          make("h3", "", "Нових оголошень наразі немає"),
          make("p", "", "Слідкуйте за офіційними повідомленнями командування у розділі новин.")
        );
        return;
      }

      target.append(
        make("h3", "", item.title || "Повідомлення командування"),
        make("p", "", item.excerpt || String(item.body || "").replace(/\s+/g, " ").slice(0, 260) + (String(item.body || "").length > 260 ? "…" : ""))
      );

      if (item.news_date) {
        const time = make("time", "", formatDate(item.news_date));
        time.dateTime = item.news_date;
        target.appendChild(time);
      }
    })
    .catch(() => {
      target.replaceChildren(
        make("h3", "", "Офіційні повідомлення SANG"),
        make("p", "", "Перегляньте актуальні публікації командування в офіційному архіві новин.")
      );
    });
});