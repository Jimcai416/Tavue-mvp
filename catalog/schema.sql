PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS photo_dishes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cuisine TEXT NOT NULL DEFAULT '',
  primary_photo_id TEXT
);
CREATE TABLE IF NOT EXISTS photo_aliases (
  alias TEXT PRIMARY KEY,
  dish_id TEXT NOT NULL REFERENCES photo_dishes(id)
);
CREATE TABLE IF NOT EXISTS approved_photos (
  id TEXT PRIMARY KEY,
  dish_id TEXT NOT NULL REFERENCES photo_dishes(id),
  status TEXT NOT NULL CHECK(status IN ('approved','withdrawn')),
  sha256 TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
  metadata_json TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS approved_photos_dish ON approved_photos(dish_id,status);
