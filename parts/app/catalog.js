// Arke Web Studio ready-made part: catalogue (products, services or menu items, with categories and images).
// Factory-owned (app/parts/catalog.js); the agent never writes it. Tables: migration 0002_catalog.sql.
import { HttpError, int, json, nowIso, randomKey, readJson, text } from "./core.js";

const CURRENCIES = new Set(["TRY", "EUR", "USD", "GBP"]);
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
const IMAGE_LIMIT_BYTES = 5 * 1024 * 1024;
const MEDIA_KEY = /^[A-Za-z0-9_-]{8,40}\.(jpg|png|webp|avif)$/;
const PUBLIC_CACHE = "public, max-age=60";

function itemView(row, { admin = false } = {}) {
  const view = {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price_minor,
    currency: row.currency,
    image: row.image_key ? `/media/${row.image_key}` : null,
    category: row.category_slug ?? null,
    duration: row.duration_min,
  };
  return admin ? { ...view, categoryId: row.category_id, active: row.active === 1, position: row.position, imageKey: row.image_key } : view;
}

const ITEMS_SQL = `SELECT i.*, c.slug AS category_slug FROM catalog_items i LEFT JOIN catalog_categories c ON c.id = i.category_id`;

async function publicCatalog(_request, env) {
  const [cats, items] = await env.DB.batch([
    env.DB.prepare("SELECT slug, name FROM catalog_categories ORDER BY position, id"),
    env.DB.prepare(`${ITEMS_SQL} WHERE i.active = 1 ORDER BY i.position, i.id`),
  ]);
  return json(200, { categories: cats.results, items: items.results.map((r) => itemView(r)) }, { "Cache-Control": PUBLIC_CACHE });
}

async function adminCatalog(_request, env) {
  const [cats, items] = await env.DB.batch([
    env.DB.prepare("SELECT id, slug, name, position FROM catalog_categories ORDER BY position, id"),
    env.DB.prepare(`${ITEMS_SQL} ORDER BY i.position, i.id`),
  ]);
  return json(200, { categories: cats.results, items: items.results.map((r) => itemView(r, { admin: true })) });
}

function itemFields(body) {
  const currency = text(body, "currency", { max: 3 }).toUpperCase() || "TRY";
  if (!CURRENCIES.has(currency)) throw new HttpError(400, "Para birimi desteklenmiyor.");
  const imageKey = text(body, "imageKey", { max: 60 }) || null;
  if (imageKey && !MEDIA_KEY.test(imageKey)) throw new HttpError(400, "Görsel geçersiz.");
  return {
    name: text(body, "name", { max: 160, required: true }),
    description: text(body, "description", { max: 2000 }),
    price: int(body, "price", { min: 0, max: 1_000_000_000 }),
    currency,
    imageKey,
    categoryId: int(body, "categoryId", { min: 1 }),
    duration: int(body, "duration", { min: 1, max: 24 * 60 }),
    active: body.active === false || body.active === "false" || body.active === 0 ? 0 : 1,
    position: int(body, "position", { min: 0, max: 100_000 }) ?? 0,
  };
}

async function createItem(request, env) {
  const f = itemFields(await readJson(request));
  const row = await env.DB.prepare(
    `INSERT INTO catalog_items (category_id, name, description, price_minor, currency, image_key, duration_min, active, position, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(f.categoryId, f.name, f.description, f.price, f.currency, f.imageKey, f.duration, f.active, f.position, nowIso())
    .first();
  return json(201, { id: row.id });
}

async function updateItem(request, env, _ctx, m) {
  const f = itemFields(await readJson(request));
  const r = await env.DB.prepare(
    `UPDATE catalog_items SET category_id = ?, name = ?, description = ?, price_minor = ?, currency = ?, image_key = ?,
     duration_min = ?, active = ?, position = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(f.categoryId, f.name, f.description, f.price, f.currency, f.imageKey, f.duration, f.active, f.position, nowIso(), Number(m[1]))
    .run();
  if (!r.meta?.changes) throw new HttpError(404, "Kayıt bulunamadı.");
  return json(200, { ok: true });
}

async function deleteItem(_request, env, _ctx, m) {
  const r = await env.DB.prepare("DELETE FROM catalog_items WHERE id = ?").bind(Number(m[1])).run();
  if (!r.meta?.changes) throw new HttpError(404, "Kayıt bulunamadı.");
  return json(200, { ok: true });
}

function categoryFields(body) {
  const name = text(body, "name", { max: 80, required: true });
  const slug =
    text(body, "slug", { max: 60 }) ||
    name
      .toLocaleLowerCase("tr")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ı/g, "i")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  if (!SLUG.test(slug)) throw new HttpError(400, "Kategori kısa adı geçersiz.");
  return { name, slug, position: int(body, "position", { min: 0, max: 100_000 }) ?? 0 };
}

async function createCategory(request, env) {
  const f = categoryFields(await readJson(request));
  try {
    const row = await env.DB.prepare("INSERT INTO catalog_categories (slug, name, position) VALUES (?, ?, ?) RETURNING id").bind(f.slug, f.name, f.position).first();
    return json(201, { id: row.id });
  } catch {
    throw new HttpError(409, "Bu kısa adla bir kategori zaten var.");
  }
}

async function updateCategory(request, env, _ctx, m) {
  const f = categoryFields(await readJson(request));
  const r = await env.DB.prepare("UPDATE catalog_categories SET slug = ?, name = ?, position = ? WHERE id = ?").bind(f.slug, f.name, f.position, Number(m[1])).run();
  if (!r.meta?.changes) throw new HttpError(404, "Kategori bulunamadı.");
  return json(200, { ok: true });
}

async function deleteCategory(_request, env, _ctx, m) {
  const id = Number(m[1]);
  // Items stay; they only lose the category.
  await env.DB.batch([
    env.DB.prepare("UPDATE catalog_items SET category_id = NULL WHERE category_id = ?").bind(id),
    env.DB.prepare("DELETE FROM catalog_categories WHERE id = ?").bind(id),
  ]);
  return json(200, { ok: true });
}

// ---------------------------------------------------------------- images (R2 bucket MEDIA)

async function uploadImage(request, env) {
  if (!env.MEDIA) throw new HttpError(503, "Görsel deposu bağlı değil.");
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[type];
  if (!ext) throw new HttpError(415, "Yalnızca JPG, PNG, WebP veya AVIF yüklenebilir.");
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > IMAGE_LIMIT_BYTES) throw new HttpError(413, "Görsel en fazla 5 MB olabilir.");
  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > IMAGE_LIMIT_BYTES) throw new HttpError(413, "Görsel boş ya da 5 MB'tan büyük.");
  const key = `${randomKey(15)}.${ext}`;
  await env.MEDIA.put(key, body, { httpMetadata: { contentType: type } });
  return json(201, { key, url: `/media/${key}` });
}

async function serveImage(_request, env, _ctx, m) {
  if (!env.MEDIA) throw new HttpError(404, "Bulunamadı.");
  const obj = await env.MEDIA.get(m[1]);
  if (!obj) throw new HttpError(404, "Bulunamadı.");
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default {
  id: "catalog",
  routes: [
    { method: "GET", path: /^\/api\/catalog$/, handle: publicCatalog },
    { method: "GET", path: /^\/media\/([A-Za-z0-9_-]{8,40}\.(?:jpg|png|webp|avif))$/, handle: serveImage },
    { method: "GET", path: /^\/api\/admin\/catalog$/, admin: true, handle: adminCatalog },
    { method: "POST", path: /^\/api\/admin\/catalog\/items$/, admin: true, handle: createItem },
    { method: "PUT", path: /^\/api\/admin\/catalog\/items\/(\d{1,10})$/, admin: true, handle: updateItem },
    { method: "DELETE", path: /^\/api\/admin\/catalog\/items\/(\d{1,10})$/, admin: true, handle: deleteItem },
    { method: "POST", path: /^\/api\/admin\/catalog\/categories$/, admin: true, handle: createCategory },
    { method: "PUT", path: /^\/api\/admin\/catalog\/categories\/(\d{1,10})$/, admin: true, handle: updateCategory },
    { method: "DELETE", path: /^\/api\/admin\/catalog\/categories\/(\d{1,10})$/, admin: true, handle: deleteCategory },
    { method: "POST", path: /^\/api\/admin\/media$/, admin: true, handle: uploadImage },
  ],
};
