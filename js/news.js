document.addEventListener("DOMContentLoaded", () => {
  const featuredTarget = document.getElementById("featured-news");
  const gridTarget = document.getElementById("news-grid");
  const announcementsTarget = document.getElementById("announcements-list");
  const announcementsSection = document.getElementById("announcements-section");
  if (!featuredTarget || !gridTarget || !announcementsTarget) return;

  const formatDate = value => {
    const match = String(value || "").match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
    return match ? match[3] + "." + match[2] + "." + match[1] : String(value || "");
  };
  const excerpt = item => item.excerpt || String(item.body || "").replace(/\\s+/g," ").slice(0,220) + (String(item.body || "").length > 220 ? "…" : "");
  const element = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  function addImage(container, url, className) {
    if (!url) return;
    const wrap = element("div", className);
    const img = document.createElement("img");
    img.src = url;
    img.alt = "Ілюстрація до публікації";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => wrap.remove();
    wrap.appendChild(img);
    container.appendChild(wrap);
  }
  function renderFeatured(item) {
    featuredTarget.replaceChildren();
    if (!item) {
      featuredTarget.appendChild(element("p","news-empty","Наразі немає опублікованих повідомлень. Нові публікації командування з’являтимуться тут."));
      return;
    }
    const card = element("article","news-feature-card");
    const copy = element("div","news-feature-copy");
    copy.appendChild(element("span","news-category-live",item.category));
    copy.appendChild(element("h2","",item.title));
    copy.appendChild(element("p","",excerpt(item)));
    copy.appendChild(element("time","news-date-live",formatDate(item.news_date)));
    card.appendChild(copy);
    addImage(card,item.image_url,"news-feature-image");
    featuredTarget.appendChild(card);
  }
  function renderCards(items) {
    gridTarget.replaceChildren();
    if (!items.length) {
      gridTarget.appendChild(element("p","news-empty","Інших новин поки немає. Слідкуйте за офіційними повідомленнями командування."));
      return;
    }
    for (const item of items) {
      const card = element("article","news-card-live");
      addImage(card,item.image_url,"news-card-image");
      const copy = element("div","news-card-copy");
      const meta = element("div","news-card-meta");
      meta.appendChild(element("span","news-category-live",item.category));
      const time = document.createElement("time");
      time.dateTime = item.news_date || "";
      time.textContent = formatDate(item.news_date);
      meta.appendChild(time);
      copy.appendChild(meta);
      copy.appendChild(element("h3","",item.title));
      copy.appendChild(element("p","",excerpt(item)));
      const details = element("details","news-details");
      const summary = element("summary","news-read-more","ЧИТАТИ ПОВНІСТЮ");
      const body = element("p","news-full-body",item.body || "");
      details.append(summary,body);
      copy.appendChild(details);
      card.appendChild(copy);
      gridTarget.appendChild(card);
    }
  }
  function renderAnnouncements(items) {
    announcementsTarget.replaceChildren();
    announcementsSection.hidden = !items.length;
    for (const item of items) {
      const row = element("article","news-announcement-live");
      row.appendChild(element("span","news-announcement-mark","!"));
      const content = element("div","");
      content.appendChild(element("span","news-category-live",item.category));
      content.appendChild(element("h3","",item.title));
      content.appendChild(element("p","",excerpt(item)));
      const date = document.createElement("time");
      date.dateTime = item.news_date || "";
      date.textContent = formatDate(item.news_date);
      content.appendChild(date);
      row.appendChild(content);
      const link = element("a","news-announcement-link","ДЕТАЛЬНІШЕ");
      link.href = "#news-grid";
      row.appendChild(link);
      announcementsTarget.appendChild(row);
    }
  }

  fetch("/api/news",{cache:"no-store"})
    .then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Не вдалося завантажити новини.");
      return data.news || [];
    })
    .then(items => {
      const featured = items.find(item => Number(item.is_featured) === 1) || items[0] || null;
      const rest = items.filter(item => !featured || String(item.id) !== String(featured.id));
      renderFeatured(featured);
      renderCards(rest.filter(item => Number(item.is_announcement) !== 1));
      renderAnnouncements(rest.filter(item => Number(item.is_announcement) === 1));
    })
    .catch(error => {
      featuredTarget.replaceChildren(element("p","news-empty",error.message));
      gridTarget.replaceChildren();
      announcementsSection.hidden = true;
    });
});
