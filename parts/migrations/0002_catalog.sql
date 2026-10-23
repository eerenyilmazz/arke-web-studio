-- Site Factory ready-made part: catalogue (products, services, menu items). Prices are whole minor units
-- (kuruş, cents). Factory-owned; never edited once applied.
CREATE TABLE IF NOT EXISTS catalog_categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS catalog_items (
  id INTEGER PRIMARY KEY,
  category_id INTEGER REFERENCES catalog_categories (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_minor INTEGER,
  currency TEXT NOT NULL DEFAULT 'TRY',
  image_key TEXT,
  duration_min INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS catalog_items_list ON catalog_items (active, position, id);
