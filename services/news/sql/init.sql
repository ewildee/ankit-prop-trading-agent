CREATE TABLE IF NOT EXISTS calendar_items (
  id TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  date TEXT NOT NULL,
  instant_ms INTEGER NOT NULL,
  title TEXT NOT NULL,
  impact TEXT NOT NULL,
  instrument TEXT NOT NULL,
  restriction INTEGER NOT NULL CHECK (restriction IN (0, 1)),
  event_type TEXT NOT NULL,
  forecast TEXT,
  previous TEXT,
  actual TEXT,
  youtube_link TEXT,
  article_link TEXT
) WITHOUT ROWID;

DROP INDEX IF EXISTS idx_calendar_items_date;

DROP INDEX IF EXISTS idx_calendar_items_instrument_date;

CREATE INDEX IF NOT EXISTS idx_calendar_items_instant_ms
  ON calendar_items(instant_ms);

CREATE INDEX IF NOT EXISTS idx_calendar_items_instrument_instant
  ON calendar_items(instrument, instant_ms);

PRAGMA user_version = 2;
