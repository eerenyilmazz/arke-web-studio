-- Arke Web Studio ready-made part: personal-data log (core, every app site). Records that a clean-up, an export or an
-- erasure happened and how many records it touched, never whose: the business can show it handles requests.
-- Factory-owned; an applied migration is never edited (add a new file instead).
CREATE TABLE IF NOT EXISTS privacy_log (
  id INTEGER PRIMARY KEY,
  action TEXT NOT NULL,
  count INTEGER NOT NULL,
  at TEXT NOT NULL
);
