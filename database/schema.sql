PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  login                 TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash         TEXT NOT NULL,
  password_salt         TEXT NOT NULL,
  name                  TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
  salary_kopecks        INTEGER NOT NULL DEFAULT 0 CHECK (salary_kopecks >= 0),
  bonus_rate            REAL NOT NULL DEFAULT 0 CHECK (bonus_rate >= 0),
  min_plan_kopecks      INTEGER NOT NULL DEFAULT 0 CHECK (min_plan_kopecks >= 0),
  target_plan_kopecks   INTEGER NOT NULL DEFAULT 0 CHECK (target_plan_kopecks >= 0),
  max_plan_kopecks      INTEGER NOT NULL DEFAULT 0 CHECK (max_plan_kopecks >= 0),
  min_multiplier        REAL NOT NULL DEFAULT 1 CHECK (min_multiplier >= 0),
  target_multiplier     REAL NOT NULL DEFAULT 1 CHECK (target_multiplier >= 0),
  max_multiplier        REAL NOT NULL DEFAULT 1 CHECK (max_multiplier >= 0),
  created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS monthly_plans (
  user_id               TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  month                 TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  salary_kopecks        INTEGER NOT NULL CHECK (salary_kopecks >= 0),
  bonus_rate            REAL NOT NULL CHECK (bonus_rate >= 0),
  min_plan_kopecks      INTEGER NOT NULL CHECK (min_plan_kopecks >= 0),
  target_plan_kopecks   INTEGER NOT NULL CHECK (target_plan_kopecks >= 0),
  max_plan_kopecks      INTEGER NOT NULL CHECK (max_plan_kopecks >= 0),
  min_multiplier        REAL NOT NULL CHECK (min_multiplier >= 0),
  target_multiplier     REAL NOT NULL CHECK (target_multiplier >= 0),
  max_multiplier        REAL NOT NULL CHECK (max_multiplier >= 0),
  created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, month)
) STRICT;

CREATE TABLE IF NOT EXISTS leads (
  id                    TEXT PRIMARY KEY,
  lead_date             TEXT NOT NULL,
  name                  TEXT NOT NULL,
  phone                 TEXT NOT NULL DEFAULT '',
  telegram              TEXT NOT NULL DEFAULT '',
  income                 TEXT NOT NULL DEFAULT '',
  request                TEXT NOT NULL DEFAULT '',
  raw_status             TEXT NOT NULL DEFAULT '',
  status                 TEXT NOT NULL CHECK (status IN ('new', 'work', 'kp', 'paid', 'closed')),
  tariff                 TEXT NOT NULL DEFAULT '',
  amount_kopecks         INTEGER NOT NULL DEFAULT 0,
  net_amount_kopecks     INTEGER NOT NULL DEFAULT 0,
  payment_method         TEXT NOT NULL DEFAULT '',
  paid_at                TEXT NOT NULL DEFAULT '',
  comment                TEXT NOT NULL DEFAULT '',
  manager_id             TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  source                 TEXT NOT NULL DEFAULT 'manual',
  external_id            TEXT NOT NULL DEFAULT '',
  created_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS payments (
  id                    TEXT PRIMARY KEY,
  order_no              INTEGER NOT NULL UNIQUE,
  lead_id               TEXT REFERENCES leads(id) ON UPDATE CASCADE ON DELETE SET NULL,
  customer_name         TEXT NOT NULL,
  contact               TEXT NOT NULL DEFAULT '',
  tariff                 TEXT NOT NULL DEFAULT '',
  revenue_kopecks        INTEGER NOT NULL DEFAULT 0,
  net_kopecks            INTEGER NOT NULL DEFAULT 0,
  debt_kopecks           INTEGER NOT NULL DEFAULT 0,
  payment_method         TEXT NOT NULL DEFAULT '',
  paid_at                TEXT NOT NULL,
  manager_id             TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  payment_schedule      TEXT NOT NULL DEFAULT '',
  created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS telegram_notifications (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id               TEXT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  attempts              INTEGER NOT NULL DEFAULT 0,
  last_error            TEXT NOT NULL DEFAULT '',
  created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at               TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS telegram_contacts (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL UNIQUE,
  chat_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS telegram_chats (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL UNIQUE REFERENCES telegram_contacts(id) ON DELETE CASCADE,
  manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS lead_telegram_links (
  lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES telegram_contacts(id) ON DELETE SET NULL,
  start_token TEXT NOT NULL UNIQUE,
  linked_at TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS telegram_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES telegram_chats(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK(direction IN ('incoming','outgoing','system')),
  message_type TEXT NOT NULL CHECK(message_type IN ('text','document','photo','sticker','system')),
  text TEXT NOT NULL DEFAULT '',
  telegram_message_id TEXT NOT NULL DEFAULT '',
  sender_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  telegram_file_id TEXT NOT NULL DEFAULT '',
  local_path TEXT NOT NULL DEFAULT '',
  invoice_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('received','queued','sent','failed')),
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS telegram_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  name TEXT NOT NULL,
  inn TEXT NOT NULL,
  kpp TEXT NOT NULL DEFAULT '',
  ogrn TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL,
  bik TEXT NOT NULL,
  checking_account TEXT NOT NULL,
  correspondent_account TEXT NOT NULL,
  director TEXT NOT NULL DEFAULT '',
  is_test INTEGER NOT NULL DEFAULT 1 CHECK(is_test IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS invoice_counters (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_no TEXT NOT NULL UNIQUE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount_kopecks INTEGER NOT NULL CHECK(amount_kopecks > 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  due_date TEXT NOT NULL DEFAULT '',
  vat_mode TEXT NOT NULL DEFAULT 'none' CHECK(vat_mode IN ('none','included')),
  vat_rate INTEGER NOT NULL DEFAULT 0,
  vat_amount_kopecks INTEGER NOT NULL DEFAULT 0,
  comment TEXT NOT NULL DEFAULT '',
  payment_purpose TEXT NOT NULL DEFAULT '',
  company_snapshot TEXT NOT NULL,
  customer_snapshot TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('generating','saved','sent','paid','cancelled','failed')),
  is_test INTEGER NOT NULL DEFAULT 1 CHECK(is_test IN (0,1)),
  current_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS invoice_versions (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  pdf_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(invoice_id, version)
) STRICT;

CREATE TABLE IF NOT EXISTS invoice_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_manager_date ON leads(manager_id, lead_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_external_source ON leads(source, external_id) WHERE external_id <> '';
CREATE INDEX IF NOT EXISTS idx_payments_manager_date ON payments(manager_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_payments_lead ON payments(lead_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_month ON monthly_plans(month);
CREATE INDEX IF NOT EXISTS idx_telegram_notifications_status ON telegram_notifications(status, created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_chats_manager ON telegram_chats(manager_id, last_message_at);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_chat ON telegram_messages(chat_id, created_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_incoming_message ON telegram_messages(chat_id, telegram_message_id, direction) WHERE telegram_message_id <> '';
CREATE INDEX IF NOT EXISTS idx_invoices_lead ON invoices(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_manager ON invoices(manager_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice ON invoice_events(invoice_id, created_at);
