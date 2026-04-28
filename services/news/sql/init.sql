CREATE TABLE IF NOT EXISTS calendar_items (
  id TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  date TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_calendar_items_date
  ON calendar_items(date);

CREATE INDEX IF NOT EXISTS idx_calendar_items_instrument_date
  ON calendar_items(instrument, date);
