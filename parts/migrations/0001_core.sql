-- Arke Web Studio ready-made part: core (admin sign-in attempts and form rate limits). Factory-owned; never edited
-- once applied: changes come as new migration files.
CREATE TABLE IF NOT EXISTS rate_hits (
  bucket TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_hits_bucket_at ON rate_hits (bucket, at);
