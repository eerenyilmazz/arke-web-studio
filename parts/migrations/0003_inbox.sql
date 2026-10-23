-- Arke Web Studio ready-made part: notifications inbox (form messages, later orders and bookings).
-- Factory-owned; never edited once applied.
CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inbox_status ON inbox (status, id);
