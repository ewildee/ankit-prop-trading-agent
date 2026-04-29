CREATE TABLE IF NOT EXISTS calendar_event (
  id TEXT PRIMARY KEY,
  event_ts_utc TEXT NOT NULL,
  currency TEXT NOT NULL,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  impact TEXT NOT NULL,
  instrument TEXT NOT NULL,
  instrument_tags TEXT NOT NULL,
  restricted INTEGER NOT NULL CHECK (restricted IN (0, 1)),
  event_type TEXT NOT NULL,
  forecast TEXT,
  previous TEXT,
  actual TEXT,
  youtube_link TEXT,
  article_link TEXT,
  upserted_at_utc TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_calendar_event_ts_utc
  ON calendar_event(event_ts_utc);

CREATE INDEX IF NOT EXISTS idx_calendar_event_currency
  ON calendar_event(currency);

INSERT INTO meta(key, value)
VALUES ('schema_version', '1')
ON CONFLICT(key) DO NOTHING;
