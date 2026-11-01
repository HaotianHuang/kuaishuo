-- The kuaishuo D1 database: the daily totals phones send (functions/api/count.js), one row a send, never a row of play
-- and nothing about the sender but the country Cloudflare puts it in. A day's totals are the sum of its rows (json_each).
--   wrangler d1 execute kuaishuo --remote --file=schema.sql   (--local for wrangler pages dev)
CREATE TABLE IF NOT EXISTS beats (
  id INTEGER PRIMARY KEY,
  day TEXT NOT NULL,      -- the phone's day (4 am to 4 am), YYYY-MM-DD
  country TEXT,           -- two letters, from Cloudflare (request.cf.country)
  n TEXT NOT NULL         -- {"key": count, …}: the keys count.js allows
);
CREATE INDEX IF NOT EXISTS beats_day ON beats (day);
