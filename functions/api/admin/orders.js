import { json, readCookie, tokenDigest, COOKIE } from "../auth/_session.js";

async function requireAdmin(request, env) {
  if (!env.DB) return { error: json({ message: "База даних недоступна." }, 503) };
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return { error: json({ message: "Запит відхилено." }, 403) };
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 128) return { error: json({ message: "Потрібна авторизація." }, 401) };
  const actor = await env.DB.prepare(
    "SELECT a.id, a.role FROM cabinet_sessions s JOIN personnel_accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.active=1 LIMIT 1"
  ).bind(await tokenDigest(token), new Date().toISOString()).first();
  if (!actor || actor.role !== "admin") return { error: json({ message: "Недостатньо прав." }, 403) };
  return { actor };
}

function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function loadOrders(env) {
  const result = await env.DB.prepare(
    `SELECT o.*, a.service_number AS author_service_number
     FROM sang_orders o
     LEFT JOIN personnel_accounts a ON a.id=o.created_by
     ORDER BY o.created_at DESC, o.id DESC LIMIT 300`
  ).all();
  const orders = result.results || [];
  if (!orders.length) return [];
  const recipients = await env.DB.prepare(
    `SELECT r.order_id, a.id AS account_id, a.service_number, COALESCE(p.full_name,'') AS full_name
     FROM sang_order_recipients r
     JOIN personnel_accounts a ON a.id=r.account_id
     LEFT JOIN personnel_profiles p ON p.account_id=a.id
     WHERE r.order_id IN (${orders.map(() => "?").join(",")})`
  ).bind(...orders.map(order => order.id)).all();
  const byOrder = new Map();
  for (const row of recipients.results || []) {
    if (!byOrder.has(row.order_id)) byOrder.set(row.order_id, []);
    byOrder.get(row.order_id).push({
      accountId: row.account_id,
      serviceNumber: row.service_number,
      fullName: row.full_name
    });
  }
  return orders.map(order => ({
    id: order.id,
    order_number: order.order_number,
    title: order.title,
    category: order.category,
    order_date: order.order_date,
    body: order.body,
    status: order.status,
    audience_type: order.audience_faction ? "faction" : (order.audience_type || "all"),
    audience_faction: order.audience_faction || "",
    recipients: byOrder.get(order.id) || [],
    author: order.author_service_number || "Командування",
    created_at: order.created_at,
    published_at: order.published_at
  }));
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;
    const [orders, roster, factions] = await Promise.all([
      loadOrders(env),
      env.DB.prepare(
        `SELECT a.id AS accountId, a.service_number AS serviceNumber,
          COALESCE(p.full_name,'') AS fullName, COALESCE(p.rank,'') AS rank,
          COALESCE(p.unit,'') AS unit
         FROM personnel_accounts a
         LEFT JOIN personnel_profiles p ON p.account_id=a.id
         WHERE a.role='soldier' AND a.active=1
         ORDER BY p.full_name ASC, a.service_number ASC`
      ).all(),
      env.DB.prepare(
        `SELECT DISTINCT faction_name AS name FROM personnel_accounts
         WHERE role='faction_leader' AND active=1 AND faction_name IS NOT NULL AND TRIM(faction_name)<>''
         ORDER BY faction_name ASC`
      ).all()
    ]);
    return json({ success: true, orders, soldiers: roster.results || [], factions: factions.results || [] });
  } catch (error) {
    console.error("SANG admin orders list error:", error);
    return json({ message: "Не вдалося завантажити документи командування. Перевірте застосування міграцій бази даних." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;
    let body;
    try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }

    const orderNumber = cleanText(body.orderNumber, 40);
    const title = cleanText(body.title, 180);
    const category = cleanText(body.category, 40) || "Наказ";
    const orderDate = cleanText(body.orderDate, 10);
    const documentBody = typeof body.body === "string" ? body.body.trim() : "";
    const audienceType = body.audienceType;
    const factionName = cleanText(body.factionName, 80);
    const storedAudienceType = audienceType === "faction" ? "all" : audienceType;
    const status = body.status === "published" ? "published" : "draft";
    const recipientIds = Array.isArray(body.recipientAccountIds)
      ? [...new Set(body.recipientAccountIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))]
      : [];

    if (!orderNumber || !title || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate) || !documentBody) {
      return json({ message: "Заповніть номер, назву, дату та текст документа." }, 400);
    }
    if (!["all", "person", "group", "faction"].includes(audienceType)) return json({ message: "Оберіть адресатів документа." }, 400);
    if (audienceType === "faction" && (!factionName || recipientIds.length)) return json({ message: "Оберіть державну фракцію для документа." }, 400);
    if (audienceType !== "faction" && factionName) return json({ message: "Некоректний адресат документа." }, 400);
    if (audienceType === "person" && recipientIds.length !== 1) return json({ message: "Для персонального наказу оберіть одного військовослужбовця." }, 400);
    if (audienceType === "group" && recipientIds.length < 2) return json({ message: "Для групового наказу оберіть щонайменше двох військовослужбовців." }, 400);
    if (audienceType === "all" && recipientIds.length) return json({ message: "Для загального наказу список адресатів має бути порожнім." }, 400);
    if (audienceType === "faction") {
      const leader = await env.DB.prepare("SELECT id FROM personnel_accounts WHERE role='faction_leader' AND active=1 AND faction_name=? LIMIT 1").bind(factionName).first();
      if (!leader) return json({ message: "Для цієї фракції немає активного керівника з доступом." }, 400);
    }

    if (recipientIds.length) {
      const placeholders = recipientIds.map(() => "?").join(",");
      const found = await env.DB.prepare(
        `SELECT id FROM personnel_accounts WHERE role='soldier' AND active=1 AND id IN (${placeholders})`
      ).bind(...recipientIds).all();
      if ((found.results || []).length !== recipientIds.length) return json({ message: "Список адресатів містить неактивний або невідомий обліковий запис." }, 400);
    }

    const inserted = await env.DB.prepare(
      `INSERT INTO sang_orders
       (order_number,title,category,order_date,body,status,audience_type,audience_faction,created_by,updated_by,published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='published' THEN CURRENT_TIMESTAMP ELSE NULL END)`
    ).bind(orderNumber,title,category,orderDate,documentBody,status,storedAudienceType,audienceType === "faction" ? factionName : null,auth.actor.id,auth.actor.id,status).run();
    const orderId = inserted.meta?.last_row_id;
    if (!orderId) throw new Error("Не вдалося отримати ID документа після збереження.");

    for (const accountId of recipientIds) {
      await env.DB.prepare("INSERT INTO sang_order_recipients (order_id,account_id) VALUES (?,?)").bind(orderId,accountId).run();
    }
    await env.DB.prepare(
      "INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?, ?, NULL)"
    ).bind(auth.actor.id, status === "published" ? "order_published" : "order_draft_saved").run();

    return json({ success: true, id: orderId, message: status === "published" ? "Документ опубліковано для вибраних адресатів." : "Чернетку документа збережено." }, 201);
  } catch (error) {
    if (String(error).includes("UNIQUE")) return json({ message: "Документ із таким номером уже існує." }, 409);
    console.error("SANG order create error:", error);
    return json({ message: "Не вдалося зберегти документ. Переконайтеся, що міграції 0004 та 0005 застосовані." }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;
    let body;
    try { body = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id < 1) return json({ message: "Некоректний ID документа." }, 400);

    // Редагування документа без зміни його поточного статусу.
    if (Object.prototype.hasOwnProperty.call(body, "orderNumber")) {
      const current = await env.DB.prepare("SELECT id,status FROM sang_orders WHERE id=? LIMIT 1").bind(id).first();
      if (!current) return json({ message: "Документ не знайдено." }, 404);
      const orderNumber = cleanText(body.orderNumber, 40);
      const title = cleanText(body.title, 180);
      const category = cleanText(body.category, 40) || "Наказ";
      const orderDate = cleanText(body.orderDate, 10);
      const documentBody = typeof body.body === "string" ? body.body.trim() : "";
      const audienceType = body.audienceType;
      const factionName = cleanText(body.factionName, 80);
      const storedAudienceType = audienceType === "faction" ? "all" : audienceType;
      const recipientIds = Array.isArray(body.recipientAccountIds)
        ? [...new Set(body.recipientAccountIds.map(Number).filter(value => Number.isSafeInteger(value) && value > 0))]
        : [];
      if (!orderNumber || !title || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate) || !documentBody) {
        return json({ message: "Заповніть номер, назву, дату та текст документа." }, 400);
      }
      if (!["all", "person", "group", "faction"].includes(audienceType)) return json({ message: "Оберіть адресатів документа." }, 400);
      if (audienceType === "faction" && (!factionName || recipientIds.length)) return json({ message: "Оберіть державну фракцію для документа." }, 400);
      if (audienceType !== "faction" && factionName) return json({ message: "Некоректний адресат документа." }, 400);
      if (audienceType === "person" && recipientIds.length !== 1) return json({ message: "Для персонального документа оберіть одного військовослужбовця." }, 400);
      if (audienceType === "group" && recipientIds.length < 2) return json({ message: "Для групового документа оберіть щонайменше двох військовослужбовців." }, 400);
      if (audienceType === "all" && recipientIds.length) return json({ message: "Для загального документа список адресатів має бути порожнім." }, 400);
      if (audienceType === "faction") {
        const leader = await env.DB.prepare("SELECT id FROM personnel_accounts WHERE role='faction_leader' AND active=1 AND faction_name=? LIMIT 1").bind(factionName).first();
        if (!leader) return json({ message: "Для цієї фракції немає активного керівника з доступом." }, 400);
      }
      if (recipientIds.length) {
        const placeholders = recipientIds.map(() => "?").join(",");
        const found = await env.DB.prepare(
          `SELECT id FROM personnel_accounts WHERE role='soldier' AND active=1 AND id IN (${placeholders})`
        ).bind(...recipientIds).all();
        if ((found.results || []).length !== recipientIds.length) return json({ message: "Список адресатів містить неактивний або невідомий обліковий запис." }, 400);
      }
      await env.DB.prepare(
        "UPDATE sang_orders SET order_number=?,title=?,category=?,order_date=?,body=?,audience_type=?,audience_faction=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(orderNumber,title,category,orderDate,documentBody,storedAudienceType,audienceType === "faction" ? factionName : null,auth.actor.id,id).run();
      await env.DB.prepare("DELETE FROM sang_order_recipients WHERE order_id=?").bind(id).run();
      for (const accountId of recipientIds) {
        await env.DB.prepare("INSERT INTO sang_order_recipients (order_id,account_id) VALUES (?,?)").bind(id,accountId).run();
      }
      await env.DB.prepare(
        "INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?, ?, NULL)"
      ).bind(auth.actor.id, "order_updated").run();
      return json({ success: true, message: "Зміни документа збережено." });
    }

    // Керування життєвим циклом: чернетка → опубліковано → архів → чернетка.
    const status = body.status;
    if (!["published", "archived", "draft"].includes(status)) {
      return json({ message: "Некоректний статус документа." }, 400);
    }
    const current = await env.DB.prepare("SELECT id,status FROM sang_orders WHERE id=? LIMIT 1").bind(id).first();
    if (!current) return json({ message: "Документ не знайдено." }, 404);
    await env.DB.prepare(
      "UPDATE sang_orders SET status=?, updated_by=?, updated_at=CURRENT_TIMESTAMP, published_at=CASE WHEN ?='published' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END WHERE id=?"
    ).bind(status,auth.actor.id,status,id).run();
    const action = status === "published" ? "order_published" : status === "archived" ? "order_archived" : "order_restored_to_draft";
    await env.DB.prepare(
      "INSERT INTO cabinet_audit_log (actor_account_id,action,target_account_id) VALUES (?, ?, NULL)"
    ).bind(auth.actor.id,action).run();
    const message = status === "published" ? "Документ опубліковано." : status === "archived" ? "Публікацію документа скасовано. Документ переміщено до архіву." : "Документ відновлено до чернеток.";
    return json({ success: true, message });
  } catch (error) {
    if (String(error).includes("UNIQUE")) return json({ message: "Документ із таким номером уже існує." }, 409);
    console.error("SANG order management error:", error);
    return json({ message: "Не вдалося оновити документ." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return json({ message: "Метод не підтримується." }, 405, { Allow: "GET, POST, PATCH" });
}
