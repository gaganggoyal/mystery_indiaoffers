CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  last_login    TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mystery_orders (
  id               TEXT PRIMARY KEY,
  order_code       TEXT UNIQUE NOT NULL,
  plan_id          TEXT NOT NULL,
  plan_name        TEXT NOT NULL,
  price_inr        INTEGER NOT NULL,
  status           TEXT DEFAULT 'pending_payment',
  client_name      TEXT NOT NULL,
  client_email     TEXT NOT NULL,
  client_phone     TEXT,
  client_company   TEXT,
  brand_url        TEXT NOT NULL,
  competitor_urls  TEXT,
  platform         TEXT,
  category         TEXT,
  product_notes    TEXT,
  special_brief    TEXT,
  shipping_city    TEXT DEFAULT 'Delhi NCR',
  shipping_pincode TEXT,
  payment_method   TEXT,
  payment_ref      TEXT,
  payment_proof    TEXT,
  payment_claimed_at TEXT,                 -- client submitted a UTR/screenshot (unverified)
  payment_verified_by TEXT,                -- admin who matched it to the bank statement
  paid_at          TEXT,                   -- set ONLY on admin confirmation

  amount_paid      INTEGER,
  product_deposit_inr INTEGER DEFAULT 0,   -- seller-funded product cart (esp. customized plan)
  return_addon     INTEGER DEFAULT 0,      -- 1 if custom plan + return test add-on
  assigned_to      TEXT,
  admin_notes      TEXT,
  eta_date         TEXT,
  access_token     TEXT NOT NULL,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mystery_reports (
  id                 TEXT PRIMARY KEY,
  order_id           TEXT UNIQUE NOT NULL REFERENCES mystery_orders(id),
  overall_score      INTEGER,
  verdict            TEXT,
  executive_summary  TEXT,
  top_fixes          TEXT,
  scores_json        TEXT,
  sections_json      TEXT,
  evidence_notes     TEXT,
  would_buy_again    INTEGER,
  is_published       INTEGER DEFAULT 0,
  published_at       TEXT,
  created_at         TEXT DEFAULT (datetime('now')),
  updated_at         TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ms_status ON mystery_orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ms_email  ON mystery_orders(client_email);
