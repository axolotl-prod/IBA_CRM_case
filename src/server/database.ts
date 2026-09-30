import "@tanstack/react-start/server-only";

import { execFile } from "node:child_process";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import type {
  CrmData,
  CrmMutation,
  InvoiceCompanyDetails,
  InvoiceDraftInput,
  InvoicePageData,
  InvoiceStatus,
  InvoiceSummary,
  Lead,
  Payment,
  PlanConfig,
  Role,
  TelegramChatMessage,
  TelegramChatsData,
  TelegramChatSummary,
  TelegramLeadConnection,
  User,
} from "../lib/crm-types";

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, login TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager')), salary_kopecks INTEGER NOT NULL DEFAULT 0, bonus_rate REAL NOT NULL DEFAULT 0, min_plan_kopecks INTEGER NOT NULL DEFAULT 0, target_plan_kopecks INTEGER NOT NULL DEFAULT 0, max_plan_kopecks INTEGER NOT NULL DEFAULT 0, min_multiplier REAL NOT NULL DEFAULT 1, target_multiplier REAL NOT NULL DEFAULT 1, max_multiplier REAL NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;
CREATE TABLE IF NOT EXISTS monthly_plans (user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE, month TEXT NOT NULL, salary_kopecks INTEGER NOT NULL, bonus_rate REAL NOT NULL, min_plan_kopecks INTEGER NOT NULL, target_plan_kopecks INTEGER NOT NULL, max_plan_kopecks INTEGER NOT NULL, min_multiplier REAL NOT NULL, target_multiplier REAL NOT NULL, max_multiplier REAL NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id, month)) STRICT;
CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, lead_date TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', telegram TEXT NOT NULL DEFAULT '', income TEXT NOT NULL DEFAULT '', request TEXT NOT NULL DEFAULT '', raw_status TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('new','work','kp','paid','closed')), tariff TEXT NOT NULL DEFAULT '', amount_kopecks INTEGER NOT NULL DEFAULT 0, net_amount_kopecks INTEGER NOT NULL DEFAULT 0, payment_method TEXT NOT NULL DEFAULT '', paid_at TEXT NOT NULL DEFAULT '', comment TEXT NOT NULL DEFAULT '', manager_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL, source TEXT NOT NULL DEFAULT 'manual', external_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, order_no INTEGER NOT NULL UNIQUE, lead_id TEXT REFERENCES leads(id) ON UPDATE CASCADE ON DELETE SET NULL, customer_name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', tariff TEXT NOT NULL DEFAULT '', revenue_kopecks INTEGER NOT NULL DEFAULT 0, net_kopecks INTEGER NOT NULL DEFAULT 0, debt_kopecks INTEGER NOT NULL DEFAULT 0, payment_method TEXT NOT NULL DEFAULT '', paid_at TEXT NOT NULL, manager_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL, payment_schedule TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;
CREATE TABLE IF NOT EXISTS telegram_notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id TEXT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent')), attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at TEXT) STRICT;
CREATE TABLE IF NOT EXISTS telegram_contacts (id TEXT PRIMARY KEY, telegram_user_id TEXT NOT NULL UNIQUE, chat_id TEXT NOT NULL UNIQUE, username TEXT NOT NULL DEFAULT '', first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;
CREATE TABLE IF NOT EXISTS telegram_chats (id TEXT PRIMARY KEY, contact_id TEXT NOT NULL UNIQUE REFERENCES telegram_contacts(id) ON DELETE CASCADE, manager_id TEXT REFERENCES users(id) ON DELETE SET NULL, unread_count INTEGER NOT NULL DEFAULT 0, last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;
CREATE TABLE IF NOT EXISTS lead_telegram_links (lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE, contact_id TEXT REFERENCES telegram_contacts(id) ON DELETE SET NULL, start_token TEXT NOT NULL UNIQUE, linked_at TEXT) STRICT;
CREATE TABLE IF NOT EXISTS telegram_messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES telegram_chats(id) ON DELETE CASCADE, direction TEXT NOT NULL CHECK(direction IN ('incoming','outgoing','system')), message_type TEXT NOT NULL CHECK(message_type IN ('text','document','photo','sticker','system')), text TEXT NOT NULL DEFAULT '', telegram_message_id TEXT NOT NULL DEFAULT '', sender_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, file_name TEXT NOT NULL DEFAULT '', mime_type TEXT NOT NULL DEFAULT '', file_size INTEGER NOT NULL DEFAULT 0, telegram_file_id TEXT NOT NULL DEFAULT '', local_path TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('received','queued','sent','failed')), error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;
CREATE TABLE IF NOT EXISTS telegram_state (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS company_settings (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL, inn TEXT NOT NULL, kpp TEXT NOT NULL DEFAULT '', ogrn TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', bank_name TEXT NOT NULL, bik TEXT NOT NULL, checking_account TEXT NOT NULL, correspondent_account TEXT NOT NULL, director TEXT NOT NULL DEFAULT '', is_test INTEGER NOT NULL DEFAULT 1 CHECK(is_test IN (0,1)), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;
CREATE TABLE IF NOT EXISTS invoice_counters (year INTEGER PRIMARY KEY, last_number INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, invoice_no TEXT NOT NULL UNIQUE, lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE RESTRICT, manager_id TEXT REFERENCES users(id) ON DELETE SET NULL, description TEXT NOT NULL, amount_kopecks INTEGER NOT NULL CHECK(amount_kopecks>0), quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>0), due_date TEXT NOT NULL DEFAULT '', vat_mode TEXT NOT NULL DEFAULT 'none' CHECK(vat_mode IN ('none','included')), vat_rate INTEGER NOT NULL DEFAULT 0, vat_amount_kopecks INTEGER NOT NULL DEFAULT 0, comment TEXT NOT NULL DEFAULT '', payment_purpose TEXT NOT NULL DEFAULT '', company_snapshot TEXT NOT NULL, customer_snapshot TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('generating','saved','sent','paid','cancelled','failed')), is_test INTEGER NOT NULL DEFAULT 1 CHECK(is_test IN (0,1)), current_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at TEXT) STRICT;
CREATE TABLE IF NOT EXISTS invoice_versions (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, version INTEGER NOT NULL, pdf_path TEXT NOT NULL, sha256 TEXT NOT NULL, file_size INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(invoice_id,version)) STRICT;
CREATE TABLE IF NOT EXISTS invoice_events (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, event_type TEXT NOT NULL, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_manager_date ON leads(manager_id, lead_date);
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
`;

const databasePath = resolve(process.env.CRM_DATABASE_PATH || "data/crm.sqlite");
const GOOGLE_SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQtMpUuOPhKwODFRWZpclCpeaJv3uVOHia_MJg8IuPYrdRYmN45-OyfyFxGe6h50d9jfBsGYSS6waEd/pub?gid=1863668531&single=true&output=csv";
const telegramFilesPath = resolve("data/telegram-files");
const invoiceFilesPath = resolve("data/invoices");
const invoicePreviewsPath = resolve(tmpdir(), "salesspark-invoice-previews");
mkdirSync(dirname(databasePath), { recursive: true });
mkdirSync(telegramFilesPath, { recursive: true });
mkdirSync(invoiceFilesPath, { recursive: true });
mkdirSync(invoicePreviewsPath, { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
db.exec(SCHEMA);

const leadColumns = new Set((db.prepare("PRAGMA table_info(leads)").all() as Array<{ name: string }>).map((column) => column.name));
if (!leadColumns.has("source")) db.exec("ALTER TABLE leads ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
if (!leadColumns.has("external_id")) db.exec("ALTER TABLE leads ADD COLUMN external_id TEXT NOT NULL DEFAULT ''");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_external_source ON leads(source, external_id) WHERE external_id <> ''");
const telegramMessageColumns = new Set((db.prepare("PRAGMA table_info(telegram_messages)").all() as Array<{ name: string }>).map((column) => column.name));
if (!telegramMessageColumns.has("invoice_id")) db.exec("ALTER TABLE telegram_messages ADD COLUMN invoice_id TEXT NOT NULL DEFAULT ''");

type Row = Record<string, string | number | null>;
function numericValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let normalized = String(value ?? "").trim().replace(/\s/g, "").replace(/[^\d,.-]/g, "").replace(/^[.,]+/, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else {
    normalized = normalized.replace(",", ".");
  }
  return Number(normalized) || 0;
}
const money = (value: unknown) => Math.round(numericValue(value) * 100);
const rubles = (value: unknown) => Number(value || 0) / 100;
const id = (prefix: string) => `${prefix}_${Date.now()}_${randomBytes(4).toString("hex")}`;

function passwordRecord(password: string) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

function managerId(name: string): string | null {
  const row = db.prepare("SELECT id FROM users WHERE name = ?").get(name) as Row | undefined;
  return (row?.id as string) || null;
}

function initializeSystemUsers() {
  const count = db.prepare("SELECT COUNT(*) AS total FROM users").get() as Row;
  if (Number(count.total) > 0) return;

  const defaults: User[] = [
    { id: "u_vasya", login: "admin", password: "admin123", name: "Вася", role: "admin", salary: 80000, bonusRate: 5, minPlan: 500000, targetPlan: 1000000, maxPlan: 1500000, minMultiplier: 1.2, targetMultiplier: 1.5, maxMultiplier: 2 },
    { id: "u_alina", login: "alina", password: "manager123", name: "Алина", role: "manager", salary: 50000, bonusRate: 8, minPlan: 800000, targetPlan: 1200000, maxPlan: 1800000, minMultiplier: 1.2, targetMultiplier: 1.5, maxMultiplier: 2 },
    { id: "u_pasha", login: "pasha", password: "manager123", name: "Паша", role: "manager", salary: 50000, bonusRate: 8, minPlan: 800000, targetPlan: 1200000, maxPlan: 1800000, minMultiplier: 1.2, targetMultiplier: 1.5, maxMultiplier: 2 },
  ];

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const user of defaults) upsertUser(user);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function initializeCompanySettings() {
  const digits = (length: number) => Array.from(randomBytes(length), (byte) => String(byte % 10)).join("");
  const existing = db.prepare("SELECT id,inn,is_test FROM company_settings WHERE id=1").get() as Row | undefined;
  if (existing) {
    if (existing.is_test && existing.inn === "0000000000") {
      db.prepare("UPDATE company_settings SET inn=?,kpp=?,ogrn=?,bik=?,checking_account=?,correspondent_account=?,updated_at=CURRENT_TIMESTAMP WHERE id=1")
        .run(digits(10), digits(9), digits(13), digits(9), digits(20), digits(20));
    }
    return;
  }
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  db.prepare(`INSERT INTO company_settings (id,name,inn,kpp,ogrn,address,bank_name,bik,checking_account,correspondent_account,director,is_test) VALUES (1,?,?,?,?,?,?,?,?,?,?,1)`)
    .run(`ООО «Учебная компания Альфа-${suffix}»`, digits(10), digits(9), digits(13), "г. Москва, Тестовая улица, дом 1", "АО «Тестовый банк»", digits(9), digits(20), digits(20), "Иванов И. И.");
}

function upsertUser(user: User) {
  const existing = db.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").get(user.id) as Row | undefined;
  const credentials = user.password ? passwordRecord(user.password) : existing ? { hash: String(existing.password_hash), salt: String(existing.password_salt) } : passwordRecord(randomBytes(24).toString("hex"));
  db.prepare(`INSERT INTO users (id,login,password_hash,password_salt,name,role,salary_kopecks,bonus_rate,min_plan_kopecks,target_plan_kopecks,max_plan_kopecks,min_multiplier,target_multiplier,max_multiplier)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login,password_hash=excluded.password_hash,password_salt=excluded.password_salt,name=excluded.name,role=excluded.role,salary_kopecks=excluded.salary_kopecks,bonus_rate=excluded.bonus_rate,min_plan_kopecks=excluded.min_plan_kopecks,target_plan_kopecks=excluded.target_plan_kopecks,max_plan_kopecks=excluded.max_plan_kopecks,min_multiplier=excluded.min_multiplier,target_multiplier=excluded.target_multiplier,max_multiplier=excluded.max_multiplier,updated_at=CURRENT_TIMESTAMP`)
    .run(user.id, user.login, credentials.hash, credentials.salt, user.name, user.role, money(user.salary), user.bonusRate, money(user.minPlan), money(user.targetPlan), money(user.maxPlan), user.minMultiplier, user.targetMultiplier, user.maxMultiplier);
}

function insertLead(lead: Lead) {
  db.prepare(`INSERT INTO leads (id,lead_date,name,phone,telegram,income,request,raw_status,status,tariff,amount_kopecks,net_amount_kopecks,payment_method,paid_at,comment,manager_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(lead.id, lead.date || "", lead.name, lead.phone || "", lead.tg || "", lead.income || "", lead.request || "", lead.raw_status || "", lead.status, lead.tariff || "", money(lead.sum), money(lead.net), lead.payment || "", lead.payDate || "", lead.comment || "", managerId(lead.manager));
}

function insertPayment(payment: Payment, leadId: string | null = null) {
  db.prepare(`INSERT INTO payments (id,order_no,lead_id,customer_name,contact,tariff,revenue_kopecks,net_kopecks,debt_kopecks,payment_method,paid_at,manager_id,payment_schedule) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(payment.id, payment.order, leadId, payment.name, payment.contact || "", payment.tariff || "", money(payment.revenue), money(payment.net), money(payment.debt), payment.payment || "", payment.date || "", managerId(payment.manager), payment.schedule || "");
}

initializeSystemUsers();
initializeCompanySettings();

export function authenticateUser(login: string, password: string): string | null {
  const row = db.prepare("SELECT id,password_hash,password_salt FROM users WHERE login = ? COLLATE NOCASE").get(login.trim()) as Row | undefined;
  if (!row) return null;
  const actual = scryptSync(password, String(row.password_salt), 64);
  const expected = Buffer.from(String(row.password_hash), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? String(row.id) : null;
}

export interface GoogleSheetsSyncResult {
  configured: boolean;
  received: number;
  added: number;
  skipped: number;
  notificationsSent: number;
  notificationsPending: number;
}

interface TelegramDeliveryResult {
  configured: boolean;
  sent: number;
  failed: number;
  pending: number;
}

async function sendTelegramText(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) throw new Error("TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не настроены");
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Не удалось соединиться с Telegram Bot API");
  }
  const payload = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.description || `Telegram вернул HTTP ${response.status}`);
  }
}

export async function sendTelegramTestNotification(): Promise<void> {
  await sendTelegramText("✅ FinanceCRM подключена к Telegram. Уведомления о новых заявках из Google Sheets включены.");
}

export async function flushTelegramNotifications(): Promise<TelegramDeliveryResult> {
  const configured = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
  const pendingBefore = Number((db.prepare("SELECT COUNT(*) total FROM telegram_notifications WHERE status='pending'").get() as Row).total);
  if (!configured) return { configured: false, sent: 0, failed: 0, pending: pendingBefore };

  const notifications = db.prepare(`SELECT n.id,l.name,l.phone,l.telegram,l.request,l.tariff,l.lead_date,COALESCE(u.name,'—') manager FROM telegram_notifications n JOIN leads l ON l.id=n.lead_id LEFT JOIN users u ON u.id=l.manager_id WHERE n.status='pending' ORDER BY n.created_at,n.id LIMIT 50`).all() as Array<Row>;
  let sent = 0;
  let failed = 0;
  for (const notification of notifications) {
    const message = [
      "🔥 Новая заявка из Google Sheets",
      "",
      `Клиент: ${notification.name}`,
      `Тариф: ${notification.tariff || "—"}`,
      `Телефон: ${notification.phone || "—"}`,
      `Telegram: ${notification.telegram || "—"}`,
      `Запрос: ${notification.request || "—"}`,
      `Менеджер: ${notification.manager}`,
      `Дата: ${notification.lead_date}`,
    ].join("\n");
    try {
      await sendTelegramText(message);
      db.prepare("UPDATE telegram_notifications SET status='sent',attempts=attempts+1,last_error='',sent_at=CURRENT_TIMESTAMP WHERE id=?").run(notification.id);
      sent++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Неизвестная ошибка Telegram";
      db.prepare("UPDATE telegram_notifications SET attempts=attempts+1,last_error=? WHERE id=?").run(reason.slice(0, 500), notification.id);
      failed++;
    }
  }
  const pending = Number((db.prepare("SELECT COUNT(*) total FROM telegram_notifications WHERE status='pending'").get() as Row).total);
  return { configured: true, sent, failed, pending };
}

type TelegramApiResponse<T> = { ok: boolean; result?: T; description?: string };
type TelegramUserPayload = { id: number; username?: string; first_name?: string; last_name?: string };
type TelegramFilePayload = { file_id: string; file_unique_id?: string; file_name?: string; mime_type?: string; file_size?: number };
type TelegramMessagePayload = {
  message_id: number;
  date: number;
  chat: { id: number };
  from?: TelegramUserPayload;
  text?: string;
  caption?: string;
  contact?: { phone_number: string };
  document?: TelegramFilePayload;
  photo?: Array<TelegramFilePayload>;
  sticker?: TelegramFilePayload & { emoji?: string };
};
type TelegramUpdatePayload = { update_id: number; message?: TelegramMessagePayload };

function telegramToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не настроен");
  return token;
}

async function telegramApi<T>(method: string, body?: Record<string, unknown> | FormData, timeout = 20_000): Promise<T> {
  const multipart = body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${telegramToken()}/${method}`, {
      method: "POST",
      headers: multipart ? undefined : { "content-type": "application/json" },
      body: multipart ? body : JSON.stringify(body || {}),
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new Error("Не удалось соединиться с Telegram Bot API");
  }
  const payload = await response.json().catch(() => null) as TelegramApiResponse<T> | null;
  if (!response.ok || !payload?.ok || payload.result === undefined) {
    throw new Error(payload?.description || `Telegram вернул HTTP ${response.status}`);
  }
  return payload.result;
}

function stateValue(key: string): string {
  return String((db.prepare("SELECT value FROM telegram_state WHERE key=?").get(key) as Row | undefined)?.value || "");
}

function setStateValue(key: string, value: string) {
  db.prepare("INSERT INTO telegram_state (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}

async function botUsername(): Promise<string> {
  const configured = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  if (configured) return configured;
  const cached = stateValue("bot_username");
  if (cached) return cached;
  const me = await telegramApi<TelegramUserPayload>("getMe");
  const username = me.username || "";
  if (username) setStateValue("bot_username", username);
  return username;
}

function normalizedPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8")) ? digits.slice(1) : digits;
}

function canAccessChat(userId: string, chatId: string): boolean {
  const row = db.prepare(`SELECT u.role,tc.manager_id FROM users u CROSS JOIN telegram_chats tc WHERE u.id=? AND tc.id=?`).get(userId, chatId) as Row | undefined;
  return Boolean(row && (row.role === "admin" || row.manager_id === userId));
}

function ensureLeadLink(leadId: string): Row {
  let link = db.prepare("SELECT * FROM lead_telegram_links WHERE lead_id=?").get(leadId) as Row | undefined;
  if (!link) {
    db.prepare("INSERT INTO lead_telegram_links (lead_id,start_token) VALUES (?,?)").run(leadId, randomBytes(24).toString("base64url"));
    link = db.prepare("SELECT * FROM lead_telegram_links WHERE lead_id=?").get(leadId) as Row;
  }
  return link;
}

async function leadConnection(leadId: string): Promise<TelegramLeadConnection | null> {
  const lead = db.prepare("SELECT id,name FROM leads WHERE id=?").get(leadId) as Row | undefined;
  if (!lead) return null;
  const link = ensureLeadLink(leadId);
  const username = await botUsername();
  const chat = link.contact_id
    ? db.prepare("SELECT id FROM telegram_chats WHERE contact_id=?").get(link.contact_id) as Row | undefined
    : undefined;
  return {
    leadId: String(lead.id),
    leadName: String(lead.name),
    connected: Boolean(link.contact_id && chat),
    chatId: chat ? String(chat.id) : "",
    inviteUrl: username ? `https://t.me/${username}?start=${link.start_token}` : "",
    botUsername: username,
  };
}

function visibleChatRows(userId: string): Row[] {
  const user = db.prepare("SELECT role FROM users WHERE id=?").get(userId) as Row | undefined;
  if (!user) return [];
  return db.prepare(`SELECT ch.id,ch.contact_id,ch.unread_count,ch.last_message_at,
      trim(co.first_name || ' ' || co.last_name) contact_name,co.username,co.phone,
      COALESCE(u.name,'') manager,
      COALESCE((SELECT l.id FROM lead_telegram_links ll JOIN leads l ON l.id=ll.lead_id WHERE ll.contact_id=co.id ORDER BY COALESCE(ll.linked_at,l.created_at) DESC LIMIT 1),'') lead_id,
      COALESCE((SELECT l.name FROM lead_telegram_links ll JOIN leads l ON l.id=ll.lead_id WHERE ll.contact_id=co.id ORDER BY COALESCE(ll.linked_at,l.created_at) DESC LIMIT 1),'') lead_name,
      COALESCE((SELECT l.tariff FROM lead_telegram_links ll JOIN leads l ON l.id=ll.lead_id WHERE ll.contact_id=co.id ORDER BY COALESCE(ll.linked_at,l.created_at) DESC LIMIT 1),'') tariff,
      COALESCE((SELECT CASE WHEN m.message_type IN ('document','photo') THEN '📎 ' || m.file_name WHEN m.message_type='sticker' THEN 'Стикер ' || m.text ELSE m.text END FROM telegram_messages m WHERE m.chat_id=ch.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1),'') last_message
    FROM telegram_chats ch JOIN telegram_contacts co ON co.id=ch.contact_id LEFT JOIN users u ON u.id=ch.manager_id
    WHERE ?='admin' OR ch.manager_id=? ORDER BY ch.last_message_at DESC`).all(user.role, userId) as Row[];
}

export async function readTelegramChats(userId: string, selectedChatId = "", leadId = ""): Promise<TelegramChatsData> {
  const rows = visibleChatRows(userId);
  const chats: TelegramChatSummary[] = rows.map((row) => ({
    id: String(row.id), contactId: String(row.contact_id), name: String(row.contact_name || row.username || "Новый контакт"),
    username: String(row.username), phone: String(row.phone), manager: String(row.manager), leadId: String(row.lead_id),
    leadName: String(row.lead_name), tariff: String(row.tariff), lastMessage: String(row.last_message),
    lastMessageAt: String(row.last_message_at), unreadCount: Number(row.unread_count), connected: true,
  }));
  let connection: TelegramLeadConnection | null = null;
  if (leadId) {
    connection = await leadConnection(leadId);
    const connectedChatId = connection?.chatId;
    if (connectedChatId && chats.some((chat) => chat.id === connectedChatId)) selectedChatId = connectedChatId;
  }
  if (!selectedChatId && !leadId) selectedChatId = chats[0]?.id || "";
  if (selectedChatId && canAccessChat(userId, selectedChatId)) {
    db.prepare("UPDATE telegram_chats SET unread_count=0 WHERE id=?").run(selectedChatId);
    const selected = chats.find((chat) => chat.id === selectedChatId);
    if (selected) selected.unreadCount = 0;
  } else if (selectedChatId) selectedChatId = "";
  const messages = selectedChatId ? (db.prepare(`SELECT m.*,COALESCE(u.name,'') sender_name FROM telegram_messages m LEFT JOIN users u ON u.id=m.sender_user_id WHERE m.chat_id=? ORDER BY m.created_at,m.id`).all(selectedChatId) as Row[]).map((row): TelegramChatMessage => ({
    id: String(row.id), chatId: String(row.chat_id), direction: row.direction as TelegramChatMessage["direction"], messageType: row.message_type as TelegramChatMessage["messageType"],
    text: String(row.text), senderName: String(row.sender_name), fileName: String(row.file_name), mimeType: String(row.mime_type), fileSize: Number(row.file_size),
    status: row.status as TelegramChatMessage["status"], error: String(row.error), createdAt: String(row.created_at),
  })) : [];
  return { chats, messages, selectedChatId, leadConnection: connection };
}

export function telegramUnreadCount(userId: string): number {
  return visibleChatRows(userId).reduce((sum, row) => sum + Number(row.unread_count), 0);
}

async function sendMessageToTelegramChat(chatId: string, text: string): Promise<{ message_id: number }> {
  return telegramApi("sendMessage", { chat_id: chatId, text });
}

export async function sendTelegramChatMessage(userId: string, chatId: string, text: string): Promise<void> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error("Введите сообщение");
  if (!canAccessChat(userId, chatId)) throw new Error("Нет доступа к этому чату");
  const row = db.prepare(`SELECT co.chat_id telegram_chat_id,u.name FROM telegram_chats ch JOIN telegram_contacts co ON co.id=ch.contact_id JOIN users u ON u.id=? WHERE ch.id=?`).get(userId, chatId) as Row | undefined;
  if (!row) throw new Error("Telegram-чат не найден");
  const messageId = id("tm");
  db.prepare(`INSERT INTO telegram_messages (id,chat_id,direction,message_type,text,sender_user_id,status) VALUES (?,?,'outgoing','text',?,?,'queued')`).run(messageId, chatId, cleanText, userId);
  try {
    const sent = await sendMessageToTelegramChat(String(row.telegram_chat_id), `${row.name}:\n\n${cleanText}`);
    db.prepare("UPDATE telegram_messages SET status='sent',telegram_message_id=? WHERE id=?").run(String(sent.message_id), messageId);
    db.prepare("UPDATE telegram_chats SET last_message_at=CURRENT_TIMESTAMP WHERE id=?").run(chatId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Ошибка Telegram";
    db.prepare("UPDATE telegram_messages SET status='failed',error=? WHERE id=?").run(reason.slice(0, 500), messageId);
    throw error;
  }
}

function safeFileName(name: string): string {
  return basename(name || "file").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 150) || "file";
}

export async function sendTelegramChatFile(userId: string, chatId: string, file: File, caption = ""): Promise<void> {
  if (!canAccessChat(userId, chatId)) throw new Error("Нет доступа к этому чату");
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("Размер файла должен быть не больше 20 МБ");
  const row = db.prepare(`SELECT co.chat_id telegram_chat_id,u.name FROM telegram_chats ch JOIN telegram_contacts co ON co.id=ch.contact_id JOIN users u ON u.id=? WHERE ch.id=?`).get(userId, chatId) as Row | undefined;
  if (!row) throw new Error("Telegram-чат не найден");
  const messageId = id("tm");
  const name = safeFileName(file.name);
  const directory = resolve(telegramFilesPath, chatId);
  mkdirSync(directory, { recursive: true });
  const localPath = resolve(directory, `${messageId}-${name}`);
  const bytes = Buffer.from(await file.arrayBuffer());
  writeFileSync(localPath, bytes);
  db.prepare(`INSERT INTO telegram_messages (id,chat_id,direction,message_type,text,sender_user_id,file_name,mime_type,file_size,local_path,status) VALUES (?,?,'outgoing','document',?,?,?,?,?,?,'queued')`).run(messageId, chatId, caption.trim(), userId, name, file.type || "application/octet-stream", file.size, localPath);
  try {
    const form = new FormData();
    form.set("chat_id", String(row.telegram_chat_id));
    form.set("document", new Blob([bytes], { type: file.type || "application/octet-stream" }), name);
    if (caption.trim()) form.set("caption", `${row.name}:\n\n${caption.trim()}`);
    const sent = await telegramApi<{ message_id: number; document?: TelegramFilePayload }>("sendDocument", form, 60_000);
    db.prepare("UPDATE telegram_messages SET status='sent',telegram_message_id=?,telegram_file_id=? WHERE id=?").run(String(sent.message_id), sent.document?.file_id || "", messageId);
    db.prepare("UPDATE telegram_chats SET last_message_at=CURRENT_TIMESTAMP WHERE id=?").run(chatId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Ошибка Telegram";
    db.prepare("UPDATE telegram_messages SET status='failed',error=? WHERE id=?").run(reason.slice(0, 500), messageId);
    throw error;
  }
}

export function readTelegramAttachment(userId: string, messageId: string): { name: string; mime: string; base64: string } {
  const row = db.prepare("SELECT chat_id,file_name,mime_type,local_path FROM telegram_messages WHERE id=?").get(messageId) as Row | undefined;
  if (!row || !row.local_path || !canAccessChat(userId, String(row.chat_id))) throw new Error("Файл не найден");
  return { name: String(row.file_name), mime: String(row.mime_type || "application/octet-stream"), base64: readFileSync(String(row.local_path)).toString("base64") };
}

function findLeadForTelegram(username: string, phone: string): Row | undefined {
  if (username) {
    const matches = db.prepare("SELECT id,manager_id FROM leads WHERE lower(ltrim(telegram,'@'))=lower(?) ORDER BY created_at DESC").all(username.replace(/^@/, "")) as Row[];
    if (matches.length === 1) return matches[0];
  }
  const normalized = normalizedPhone(phone);
  if (normalized) {
    const matches = (db.prepare("SELECT id,manager_id,phone FROM leads ORDER BY created_at DESC").all() as Row[]).filter((lead) => normalizedPhone(String(lead.phone)) === normalized);
    if (matches.length === 1) return matches[0];
  }
  return undefined;
}

async function downloadTelegramFile(file: TelegramFilePayload, chatId: string, messageId: string): Promise<string> {
  if (Number(file.file_size || 0) > 20 * 1024 * 1024) return "";
  const info = await telegramApi<{ file_path: string }>("getFile", { file_id: file.file_id });
  const response = await fetch(`https://api.telegram.org/file/bot${telegramToken()}/${info.file_path}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Не удалось скачать файл Telegram: HTTP ${response.status}`);
  const directory = resolve(telegramFilesPath, chatId);
  mkdirSync(directory, { recursive: true });
  const name = safeFileName(file.file_name || basename(info.file_path));
  const localPath = resolve(directory, `${messageId}-${name}`);
  writeFileSync(localPath, Buffer.from(await response.arrayBuffer()));
  return localPath;
}

async function processTelegramMessage(message: TelegramMessagePayload): Promise<void> {
  if (!message.from) return;
  const username = message.from.username || "";
  const phone = message.contact?.phone_number || "";
  const startToken = message.text?.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})/)?.[1] || "";
  const tokenLink = startToken ? db.prepare("SELECT ll.lead_id,l.manager_id FROM lead_telegram_links ll JOIN leads l ON l.id=ll.lead_id WHERE ll.start_token=?").get(startToken) as Row | undefined : undefined;
  const matchedLead = tokenLink || findLeadForTelegram(username, phone);
  const contactId = `tgc_${message.from.id}`;
  db.prepare(`INSERT INTO telegram_contacts (id,telegram_user_id,chat_id,username,first_name,last_name,phone) VALUES (?,?,?,?,?,?,?) ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id=excluded.chat_id,username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,phone=CASE WHEN excluded.phone<>'' THEN excluded.phone ELSE telegram_contacts.phone END,updated_at=CURRENT_TIMESTAMP`).run(contactId, String(message.from.id), String(message.chat.id), username, message.from.first_name || "", message.from.last_name || "", phone);
  const manager = matchedLead?.manager_id || null;
  const chatId = `tch_${message.from.id}`;
  db.prepare(`INSERT INTO telegram_chats (id,contact_id,manager_id) VALUES (?,?,?) ON CONFLICT(contact_id) DO UPDATE SET manager_id=COALESCE(excluded.manager_id,telegram_chats.manager_id)`).run(chatId, contactId, manager);
  if (matchedLead?.id) {
    ensureLeadLink(String(matchedLead.id));
    db.prepare("UPDATE lead_telegram_links SET contact_id=?,linked_at=CURRENT_TIMESTAMP WHERE lead_id=?").run(contactId, matchedLead.id);
  }

  let messageType: TelegramChatMessage["messageType"] = "text";
  let file: TelegramFilePayload | undefined;
  let text = message.text || message.caption || "";
  if (message.document) { messageType = "document"; file = message.document; }
  else if (message.photo?.length) { messageType = "photo"; file = message.photo[message.photo.length - 1]; file.file_name ||= `photo_${message.message_id}.jpg`; file.mime_type ||= "image/jpeg"; }
  else if (message.sticker) { messageType = "sticker"; file = message.sticker; text = message.sticker.emoji || ""; }
  const incomingId = `tgm_${message.chat.id}_${message.message_id}`;
  let localPath = "";
  if (file && messageType !== "sticker") {
    try { localPath = await downloadTelegramFile(file, chatId, incomingId); } catch { localPath = ""; }
  }
  const result = db.prepare(`INSERT OR IGNORE INTO telegram_messages (id,chat_id,direction,message_type,text,telegram_message_id,file_name,mime_type,file_size,telegram_file_id,local_path,status,created_at) VALUES (?,?,'incoming',?,?,?,?,?,?,?,?, 'received',?)`).run(incomingId, chatId, messageType, text, String(message.message_id), file?.file_name || "", file?.mime_type || "", file?.file_size || 0, file?.file_id || "", localPath, new Date(message.date * 1000).toISOString());
  if (Number(result.changes) > 0) db.prepare("UPDATE telegram_chats SET unread_count=unread_count+1,last_message_at=? WHERE id=?").run(new Date(message.date * 1000).toISOString(), chatId);

  if (startToken && tokenLink && Number(result.changes) > 0) {
    const welcome = "Готово! Telegram подключён к вашей заявке. Напишите сообщение — менеджер увидит его в CRM.";
    try {
      const sent = await sendMessageToTelegramChat(String(message.chat.id), welcome);
      db.prepare(`INSERT INTO telegram_messages (id,chat_id,direction,message_type,text,telegram_message_id,status) VALUES (?,?,'system','system',?,?,'sent')`).run(id("tm"), chatId, welcome, String(sent.message_id));
    } catch { /* The incoming message remains safely stored. */ }
  }
}

export async function pollTelegramUpdatesOnce(): Promise<number> {
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) return 0;
  const offset = Number(stateValue("update_offset") || 0);
  const updates = await telegramApi<TelegramUpdatePayload[]>("getUpdates", { offset, timeout: 20, allowed_updates: ["message"] }, 28_000);
  for (const update of updates) {
    try { if (update.message) await processTelegramMessage(update.message); }
    finally { setStateValue("update_offset", String(update.update_id + 1)); }
  }
  return updates.length;
}

function pollingDelay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => {
    const timer = setTimeout(resolveDelay, milliseconds);
    timer.unref?.();
  });
}

export function startTelegramPolling() {
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || process.env.TELEGRAM_POLLING_ENABLED === "false") return;
  const globalState = globalThis as typeof globalThis & { __financeCrmTelegramPolling?: boolean };
  if (globalState.__financeCrmTelegramPolling) return;
  globalState.__financeCrmTelegramPolling = true;
  void (async () => {
    try { await botUsername(); } catch { /* Retried by polling. */ }
    while (globalState.__financeCrmTelegramPolling) {
      try {
        await pollTelegramUpdatesOnce();
        setStateValue("polling_error", "");
      } catch (error) {
        setStateValue("polling_error", (error instanceof Error ? error.message : "Ошибка Telegram polling").slice(0, 500));
        await pollingDelay(5_000);
      }
    }
  })();
}

const execFileAsync = promisify(execFile);

function companyDetails(): InvoiceCompanyDetails {
  const row = db.prepare("SELECT * FROM company_settings WHERE id=1").get() as Row;
  return {
    name: String(row.name), inn: String(row.inn), kpp: String(row.kpp), ogrn: String(row.ogrn), address: String(row.address),
    bankName: String(row.bank_name), bik: String(row.bik), checkingAccount: String(row.checking_account),
    correspondentAccount: String(row.correspondent_account), director: String(row.director), isTest: Boolean(row.is_test),
  };
}

function canAccessLead(userId: string, leadId: string): boolean {
  const row = db.prepare("SELECT u.role,l.manager_id FROM users u CROSS JOIN leads l WHERE u.id=? AND l.id=?").get(userId, leadId) as Row | undefined;
  return Boolean(row && (row.role === "admin" || row.manager_id === userId));
}

function invoiceLead(leadId: string): Row {
  const lead = db.prepare(`SELECT l.*,COALESCE(u.name,'') manager FROM leads l LEFT JOIN users u ON u.id=l.manager_id WHERE l.id=?`).get(leadId) as Row | undefined;
  if (!lead) throw new Error("Заявка не найдена");
  return lead;
}

function mapInvoice(row: Row): InvoiceSummary {
  return {
    id: String(row.id), number: String(row.invoice_no), leadId: String(row.lead_id), leadName: String(row.lead_name),
    manager: String(row.manager), description: String(row.description), amount: rubles(row.amount_kopecks), dueDate: String(row.due_date),
    status: row.status as InvoiceStatus, isTest: Boolean(row.is_test), version: Number(row.current_version), createdAt: String(row.created_at), sentAt: String(row.sent_at || ""), telegramConnected: Boolean(row.telegram_connected),
  };
}

export function readInvoicePageData(userId: string, leadId = ""): InvoicePageData {
  const user = db.prepare("SELECT role FROM users WHERE id=?").get(userId) as Row | undefined;
  if (!user) throw new Error("Пользователь не найден");
  if (leadId && !canAccessLead(userId, leadId)) throw new Error("Нет доступа к заявке");
  const rows = db.prepare(`SELECT i.*,l.name lead_name,COALESCE(u.name,'') manager,EXISTS(SELECT 1 FROM lead_telegram_links ll JOIN telegram_chats ch ON ch.contact_id=ll.contact_id WHERE ll.lead_id=i.lead_id) telegram_connected FROM invoices i JOIN leads l ON l.id=i.lead_id LEFT JOIN users u ON u.id=i.manager_id WHERE (?='admin' OR i.manager_id=?) AND (?='' OR i.lead_id=?) ORDER BY i.created_at DESC`).all(user.role, userId, leadId, leadId) as Row[];
  const lead = leadId ? invoiceLead(leadId) : undefined;
  const selectedLead = lead ? {
    id: String(lead.id), date: String(lead.lead_date), name: String(lead.name), phone: String(lead.phone), tg: String(lead.telegram), income: String(lead.income), request: String(lead.request), raw_status: String(lead.raw_status), status: lead.status as Lead["status"], tariff: String(lead.tariff), sum: rubles(lead.amount_kopecks), net: rubles(lead.net_amount_kopecks), payment: String(lead.payment_method), payDate: String(lead.paid_at), comment: String(lead.comment), manager: String(lead.manager),
  } satisfies Lead : null;
  const connected = leadId ? Boolean(db.prepare(`SELECT ch.id FROM lead_telegram_links ll JOIN telegram_chats ch ON ch.contact_id=ll.contact_id WHERE ll.lead_id=?`).get(leadId)) : false;
  return { invoices: rows.map(mapInvoice), company: companyDetails(), selectedLead, telegramConnected: connected };
}

function validateInvoiceDraft(input: InvoiceDraftInput) {
  if (!input.leadId) throw new Error("Не выбрана заявка");
  if (!input.description.trim()) throw new Error("Укажите описание счёта");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Сумма должна быть больше нуля");
  if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new Error("Количество должно быть целым положительным числом");
  if (input.amount > 100_000_000) throw new Error("Сумма счёта слишком велика");
  if (input.vatMode === "included" && ![0, 5, 7, 10, 20, 22].includes(input.vatRate)) throw new Error("Некорректная ставка НДС");
}

function html(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

function formatInvoiceMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " ₽";
}

const SMALL_NUMBERS = ["ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять", "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
function tripletWords(value: number, feminine = false): string[] {
  const result: string[] = [];
  if (value >= 100) result.push(HUNDREDS[Math.floor(value / 100)]);
  const rest = value % 100;
  if (rest < 20) { if (rest) result.push(SMALL_NUMBERS[rest]); }
  else { result.push(TENS[Math.floor(rest / 10)]); if (rest % 10) result.push(SMALL_NUMBERS[rest % 10]); }
  if (feminine) return result.map((word) => word === "один" ? "одна" : word === "два" ? "две" : word);
  return result;
}
function plural(value: number, one: string, few: string, many: string): string {
  const mod100 = value % 100; const mod10 = value % 10;
  return mod100 >= 11 && mod100 <= 19 ? many : mod10 === 1 ? one : mod10 >= 2 && mod10 <= 4 ? few : many;
}
function amountInWords(amount: number): string {
  const rublesValue = Math.floor(amount); const kopecks = Math.round((amount - rublesValue) * 100);
  if (rublesValue === 0) return `Ноль рублей ${String(kopecks).padStart(2, "0")} копеек`;
  const groups = [rublesValue % 1000, Math.floor(rublesValue / 1000) % 1000, Math.floor(rublesValue / 1_000_000) % 1000, Math.floor(rublesValue / 1_000_000_000) % 1000];
  const words: string[] = [];
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index]; if (!group) continue;
    words.push(...tripletWords(group, index === 1));
    if (index === 1) words.push(plural(group, "тысяча", "тысячи", "тысяч"));
    if (index === 2) words.push(plural(group, "миллион", "миллиона", "миллионов"));
    if (index === 3) words.push(plural(group, "миллиард", "миллиарда", "миллиардов"));
  }
  words.push(plural(rublesValue, "рубль", "рубля", "рублей"));
  const phrase = words.join(" ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1) + ` ${String(kopecks).padStart(2, "0")} копеек`;
}

function invoiceHtml(input: InvoiceDraftInput, lead: Row, company: InvoiceCompanyDetails, invoiceNo: string, preview: boolean): string {
  const amount = input.amount;
  const unitPrice = amount / input.quantity;
  const vat = input.vatMode === "included" && input.vatRate > 0 ? amount * input.vatRate / (100 + input.vatRate) : 0;
  const issueDate = new Intl.DateTimeFormat("ru-RU").format(new Date());
  const watermark = preview ? "ПРЕДВАРИТЕЛЬНЫЙ" : company.isTest ? "ТЕСТОВЫЙ ДОКУМЕНТ · НЕ ДЛЯ ОПЛАТЫ" : "";
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,"Segoe UI",sans-serif;color:#111;font-size:12px;line-height:1.4;margin:0}.watermark{position:fixed;top:42%;left:5%;width:90%;text-align:center;transform:rotate(-28deg);font-size:42px;font-weight:700;color:rgba(190,0,0,.13);z-index:-1}.test{color:#b91c1c;font-weight:700;border:2px solid #b91c1c;padding:7px;text-align:center;margin-bottom:12px}.bank{width:100%;border-collapse:collapse;margin-bottom:18px}.bank td{border:1px solid #222;padding:5px;vertical-align:top}.muted{font-size:9px;color:#555}.title{font-size:22px;font-weight:700;border-bottom:2px solid #111;padding-bottom:7px;margin:18px 0}.details{margin:8px 0}.items{width:100%;border-collapse:collapse;margin-top:14px}.items th,.items td{border:1px solid #222;padding:7px}.items th{background:#f1f5f9}.right{text-align:right}.totals{margin:15px 0 15px auto;width:310px}.totals div{display:flex;justify-content:space-between;padding:3px 0}.grand{font-size:15px;font-weight:700;border-top:1px solid #222;margin-top:4px;padding-top:6px!important}.words{border-top:1px solid #222;border-bottom:1px solid #222;padding:9px 0;font-weight:700}.footer{margin-top:28px;display:flex;justify-content:space-between}.sign{width:44%;border-bottom:1px solid #222;padding-bottom:5px}.note{margin-top:20px;font-size:10px;color:#555}
  </style></head><body>${watermark ? `<div class="watermark">${html(watermark)}</div>` : ""}${company.isTest ? `<div class="test">ТЕСТОВЫЙ ДОКУМЕНТ — НЕ ДЛЯ ОПЛАТЫ</div>` : ""}
  <table class="bank"><tr><td rowspan="2"><b>${html(company.bankName)}</b><div class="muted">Банк получателя</div></td><td>БИК<br><b>${html(company.bik)}</b></td><td rowspan="2">Сч. №<br><b>${html(company.correspondentAccount)}</b></td></tr><tr><td>Корр. счёт</td></tr><tr><td>ИНН ${html(company.inn)} &nbsp; КПП ${html(company.kpp)}<br><b>${html(company.name)}</b><div class="muted">Получатель</div></td><td>Сч. №</td><td><b>${html(company.checkingAccount)}</b></td></tr></table>
  <div class="title">Счёт на оплату ${preview ? "(предпросмотр)" : `№ ${html(invoiceNo)}`} от ${issueDate}</div>
  <div class="details"><b>Поставщик:</b> ${html(company.name)}, ИНН ${html(company.inn)}, КПП ${html(company.kpp)}, ${html(company.address)}</div>
  <div class="details"><b>Покупатель:</b> ${html(lead.name)}, телефон ${html(lead.phone || "—")}, Telegram ${html(lead.telegram || "—")}</div>
  <table class="items"><thead><tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody><tr><td>1</td><td>${html(input.description)}</td><td class="right">${input.quantity}</td><td class="right">${formatInvoiceMoney(unitPrice)}</td><td class="right">${formatInvoiceMoney(amount)}</td></tr></tbody></table>
  <div class="totals"><div><span>Итого:</span><b>${formatInvoiceMoney(amount)}</b></div><div><span>${input.vatMode === "none" ? "Без НДС" : `В том числе НДС ${input.vatRate}%:`}</span><b>${input.vatMode === "none" ? "—" : formatInvoiceMoney(vat)}</b></div><div class="grand"><span>Всего к оплате:</span><span>${formatInvoiceMoney(amount)}</span></div></div>
  <div class="words">Всего наименований 1, на сумму ${formatInvoiceMoney(amount)}<br>${html(amountInWords(amount))}</div>
  ${input.dueDate ? `<p><b>Срок оплаты:</b> до ${html(input.dueDate.split("-").reverse().join("."))}</p>` : ""}<p><b>Назначение платежа:</b> ${html(input.paymentPurpose || `Оплата по счёту ${preview ? "" : invoiceNo} за ${input.description}`)}</p>${input.comment ? `<p><b>Комментарий:</b> ${html(input.comment)}</p>` : ""}
  <div class="footer"><div class="sign">Руководитель: ${html(company.director)}</div><div class="sign">Менеджер: ${html(lead.manager || "")}</div></div><div class="note">Счёт на оплату не является кассовым чеком или счётом-фактурой.</div></body></html>`;
}

function edgeExecutable(): string {
  const candidates = [process.env.EDGE_PATH?.trim(), "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean) as string[];
  const found = candidates.find(existsSync);
  if (!found) throw new Error("Для генерации PDF не найден Microsoft Edge. Укажите EDGE_PATH в .env");
  return found;
}

async function renderInvoicePdf(outputPath: string, markup: string): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true });
  const runId = randomBytes(8).toString("hex");
  const htmlPath = resolve(invoicePreviewsPath, `${runId}.html`);
  const profilePath = resolve(invoicePreviewsPath, `edge-${runId}`);
  writeFileSync(htmlPath, markup, "utf8");
  try {
    await execFileAsync(edgeExecutable(), ["--headless", "--no-sandbox", "--disable-gpu", "--disable-gpu-sandbox", "--disable-dev-shm-usage", "--no-pdf-header-footer", `--user-data-dir=${profilePath}`, `--print-to-pdf=${outputPath}`, pathToFileURL(htmlPath).href], { timeout: 45_000, windowsHide: true });
    if (!existsSync(outputPath) || statSync(outputPath).size < 500) throw new Error("PDF не был создан");
  } finally {
    rmSync(htmlPath, { force: true });
    rmSync(profilePath, { recursive: true, force: true });
  }
}

export async function previewInvoicePdf(userId: string, input: InvoiceDraftInput): Promise<{ name: string; mime: string; base64: string }> {
  validateInvoiceDraft(input);
  if (!canAccessLead(userId, input.leadId)) throw new Error("Нет доступа к заявке");
  const outputPath = resolve(invoicePreviewsPath, `preview-${randomBytes(10).toString("hex")}.pdf`);
  await renderInvoicePdf(outputPath, invoiceHtml(input, invoiceLead(input.leadId), companyDetails(), "", true));
  try { return { name: "Предпросмотр-счета.pdf", mime: "application/pdf", base64: readFileSync(outputPath).toString("base64") }; }
  finally { rmSync(outputPath, { force: true }); }
}

function nextInvoiceNumber(): { year: number; sequence: number; number: string } {
  const year = new Date().getFullYear();
  db.prepare("INSERT OR IGNORE INTO invoice_counters (year,last_number) VALUES (?,0)").run(year);
  db.prepare("UPDATE invoice_counters SET last_number=last_number+1 WHERE year=?").run(year);
  const sequence = Number((db.prepare("SELECT last_number FROM invoice_counters WHERE year=?").get(year) as Row).last_number);
  return { year, sequence, number: `СЧ-${year}-${String(sequence).padStart(5, "0")}` };
}

export async function saveInvoice(userId: string, input: InvoiceDraftInput): Promise<string> {
  validateInvoiceDraft(input);
  if (!canAccessLead(userId, input.leadId)) throw new Error("Нет доступа к заявке");
  const lead = invoiceLead(input.leadId); const company = companyDetails(); const invoiceId = id("inv");
  let invoiceNo = "";
  db.exec("BEGIN IMMEDIATE");
  try {
    invoiceNo = nextInvoiceNumber().number;
    const vatKopecks = input.vatMode === "included" && input.vatRate > 0 ? Math.round(money(input.amount) * input.vatRate / (100 + input.vatRate)) : 0;
    db.prepare(`INSERT INTO invoices (id,invoice_no,lead_id,manager_id,description,amount_kopecks,quantity,due_date,vat_mode,vat_rate,vat_amount_kopecks,comment,payment_purpose,company_snapshot,customer_snapshot,status,is_test) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'generating',?)`).run(invoiceId, invoiceNo, input.leadId, lead.manager_id, input.description.trim(), money(input.amount), input.quantity, input.dueDate || "", input.vatMode, input.vatRate, vatKopecks, input.comment.trim(), input.paymentPurpose.trim(), JSON.stringify(company), JSON.stringify({ name: lead.name, phone: lead.phone, telegram: lead.telegram }), company.isTest ? 1 : 0);
    db.prepare("INSERT INTO invoice_events (invoice_id,event_type,user_id,details) VALUES (?,'created',?,?)").run(invoiceId, userId, "Счёт подтверждён менеджером");
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  const outputPath = resolve(invoiceFilesPath, String(new Date().getFullYear()), `${invoiceId}.pdf`);
  try {
    await renderInvoicePdf(outputPath, invoiceHtml(input, lead, company, invoiceNo, false));
    const content = readFileSync(outputPath); const checksum = createHash("sha256").update(content).digest("hex");
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO invoice_versions (id,invoice_id,version,pdf_path,sha256,file_size) VALUES (?,?,1,?,?,?)").run(id("iv"), invoiceId, outputPath, checksum, content.length);
    db.prepare("UPDATE invoices SET status='saved',current_version=1 WHERE id=?").run(invoiceId);
    db.prepare("INSERT INTO invoice_events (invoice_id,event_type,user_id,details) VALUES (?,'saved',?,'PDF сохранён в карточке клиента')").run(invoiceId, userId);
    db.exec("COMMIT");
    return invoiceId;
  } catch (error) {
    db.prepare("UPDATE invoices SET status='failed' WHERE id=?").run(invoiceId);
    db.prepare("INSERT INTO invoice_events (invoice_id,event_type,user_id,details) VALUES (?,'generation_failed',?,?)").run(invoiceId, userId, (error instanceof Error ? error.message : "Ошибка PDF").slice(0, 500));
    throw error;
  }
}

function invoiceFileForUser(userId: string, invoiceId: string): Row {
  const row = db.prepare(`SELECT i.*,v.pdf_path,v.file_size,l.name lead_name,l.manager_id FROM invoices i JOIN leads l ON l.id=i.lead_id JOIN invoice_versions v ON v.invoice_id=i.id AND v.version=i.current_version WHERE i.id=?`).get(invoiceId) as Row | undefined;
  if (!row || !canAccessLead(userId, String(row.lead_id))) throw new Error("Счёт не найден");
  if (!existsSync(String(row.pdf_path))) throw new Error("PDF-файл счёта отсутствует");
  return row;
}

export function readInvoicePdf(userId: string, invoiceId: string): { name: string; mime: string; base64: string } {
  const row = invoiceFileForUser(userId, invoiceId);
  return { name: `${row.invoice_no}.pdf`, mime: "application/pdf", base64: readFileSync(String(row.pdf_path)).toString("base64") };
}

export async function sendInvoiceToTelegram(userId: string, invoiceId: string): Promise<void> {
  const invoice = invoiceFileForUser(userId, invoiceId);
  if (!["saved", "sent"].includes(String(invoice.status))) throw new Error("Счёт ещё не готов к отправке");
  const chat = db.prepare(`SELECT ch.id crm_chat_id,co.chat_id telegram_chat_id FROM lead_telegram_links ll JOIN telegram_chats ch ON ch.contact_id=ll.contact_id JOIN telegram_contacts co ON co.id=ch.contact_id WHERE ll.lead_id=?`).get(invoice.lead_id) as Row | undefined;
  if (!chat) throw new Error("Клиент ещё не подключил Telegram-бота");
  if (!canAccessChat(userId, String(chat.crm_chat_id))) throw new Error("Нет доступа к Telegram-чату клиента");
  const sender = db.prepare("SELECT name FROM users WHERE id=?").get(userId) as Row;
  const content = readFileSync(String(invoice.pdf_path));
  const caption = `${sender.name}:\n\nСчёт ${invoice.invoice_no} на сумму ${formatInvoiceMoney(rubles(invoice.amount_kopecks))}.${invoice.is_test ? "\n\nТЕСТОВЫЙ ДОКУМЕНТ — НЕ ДЛЯ ОПЛАТЫ." : ""}`;
  const form = new FormData();
  form.set("chat_id", String(chat.telegram_chat_id));
  form.set("document", new Blob([content], { type: "application/pdf" }), `${invoice.invoice_no}.pdf`);
  form.set("caption", caption);
  try {
    const sent = await telegramApi<{ message_id: number; document?: TelegramFilePayload }>("sendDocument", form, 60_000);
    const messageId = id("tm");
    db.prepare(`INSERT INTO telegram_messages (id,chat_id,direction,message_type,text,telegram_message_id,sender_user_id,file_name,mime_type,file_size,telegram_file_id,local_path,status,invoice_id) VALUES (?,?,'outgoing','document',?,?,?,?,?,?,?,?, 'sent',?)`).run(messageId, chat.crm_chat_id, `Счёт ${invoice.invoice_no} на сумму ${formatInvoiceMoney(rubles(invoice.amount_kopecks))}`, String(sent.message_id), userId, `${invoice.invoice_no}.pdf`, "application/pdf", content.length, sent.document?.file_id || "", invoice.pdf_path, invoiceId);
    db.prepare("UPDATE telegram_chats SET last_message_at=CURRENT_TIMESTAMP WHERE id=?").run(chat.crm_chat_id);
    db.prepare("UPDATE invoices SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=?").run(invoiceId);
    db.prepare("INSERT INTO invoice_events (invoice_id,event_type,user_id,details) VALUES (?,'sent',?,?)").run(invoiceId, userId, `Telegram message_id=${sent.message_id}`);
  } catch (error) {
    db.prepare("INSERT INTO invoice_events (invoice_id,event_type,user_id,details) VALUES (?,'send_failed',?,?)").run(invoiceId, userId, (error instanceof Error ? error.message : "Ошибка Telegram").slice(0, 500));
    throw error;
  }
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value); rows.push(row); row = []; value = ""; }
    else if (char !== "\r") value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function googleTimestampDate(value: string): string {
  const match = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return new Date().toISOString().slice(0, 10);
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

export async function syncGoogleSheetLeads(): Promise<GoogleSheetsSyncResult> {
  const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL?.trim() || GOOGLE_SHEETS_CSV_URL;

  const response = await fetch(csvUrl, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheets вернул HTTP ${response.status}`);
  const rows = parseCsv(await response.text());
  const headers = (rows.shift() || []).map((header) => header.replace(/^\uFEFF/, "").trim());
  const column = (name: string) => {
    const index = headers.indexOf(name);
    if (index < 0) throw new Error(`В Google Sheets отсутствует колонка «${name}»`);
    return index;
  };
  const columns = {
    timestamp: column("Отметка времени"),
    tariff: column("Выберите продукт"),
    name: column("Как к вам обращаться"),
    phone: column("Ваш номер телефона для связи"),
    telegram: column("Ваш никнейм в Telegram"),
    request: column("Запрос"),
  };
  const alinaId = managerId("Алина");
  const pashaId = managerId("Паша");
  if (!alinaId || !pashaId) throw new Error("Для распределения Google-заявок нужны пользователи Алина и Паша");
  const counts = new Map<string, number>([[alinaId, 0], [pashaId, 0]]);
  for (const row of db.prepare("SELECT manager_id, COUNT(*) total FROM leads WHERE source='google_sheets' AND manager_id IN (?,?) GROUP BY manager_id").all(alinaId, pashaId) as Array<{ manager_id: string; total: number }>) {
    counts.set(row.manager_id, Number(row.total));
  }
  const insert = db.prepare(`INSERT OR IGNORE INTO leads (id,lead_date,name,phone,telegram,income,request,raw_status,status,tariff,amount_kopecks,net_amount_kopecks,payment_method,paid_at,comment,manager_id,source,external_id) VALUES (?,?,?,?,?,'',?,'Google Sheets','new',?,0,0,'','','',?,'google_sheets',?)`);
  const enqueueNotification = db.prepare("INSERT OR IGNORE INTO telegram_notifications (lead_id) VALUES (?)");
  let added = 0;
  let skipped = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of rows) {
      const timestamp = (row[columns.timestamp] || "").trim();
      const name = (row[columns.name] || "").trim();
      if (!timestamp || !name) { skipped++; continue; }
      const phone = (row[columns.phone] || "").trim();
      const telegram = (row[columns.telegram] || "").trim();
      const externalId = createHash("sha256").update([timestamp, name, phone, telegram].join("\0")).digest("hex");
      const leadId = `gs_${externalId.slice(0, 24)}`;
      const assignedManagerId = (counts.get(alinaId) || 0) <= (counts.get(pashaId) || 0) ? alinaId : pashaId;
      const result = insert.run(leadId, googleTimestampDate(timestamp), name, phone, telegram, (row[columns.request] || "").trim(), (row[columns.tariff] || "").trim(), assignedManagerId, externalId);
      if (Number(result.changes) > 0) {
        enqueueNotification.run(leadId);
        added++;
        counts.set(assignedManagerId, (counts.get(assignedManagerId) || 0) + 1);
      } else skipped++;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const delivery = await flushTelegramNotifications();
  return { configured: true, received: rows.length, added, skipped, notificationsSent: delivery.sent, notificationsPending: delivery.pending };
}

export function readCrmData(): CrmData {
  const users = (db.prepare("SELECT * FROM users ORDER BY name").all() as Row[]).map((r): User => ({
    id: String(r.id), login: String(r.login), password: "", name: String(r.name), role: r.role as Role,
    salary: rubles(r.salary_kopecks), bonusRate: Number(r.bonus_rate), minPlan: rubles(r.min_plan_kopecks), targetPlan: rubles(r.target_plan_kopecks), maxPlan: rubles(r.max_plan_kopecks), minMultiplier: Number(r.min_multiplier), targetMultiplier: Number(r.target_multiplier), maxMultiplier: Number(r.max_multiplier),
  }));
  const leads = (db.prepare("SELECT l.*, COALESCE(u.name, '') manager FROM leads l LEFT JOIN users u ON u.id=l.manager_id ORDER BY l.lead_date DESC,l.created_at DESC").all() as Row[]).map((r): Lead => ({
    id: String(r.id), date: String(r.lead_date), name: String(r.name), phone: String(r.phone), tg: String(r.telegram), income: String(r.income), request: String(r.request), raw_status: String(r.raw_status), status: r.status as Lead["status"], tariff: String(r.tariff), sum: rubles(r.amount_kopecks), net: rubles(r.net_amount_kopecks), payment: String(r.payment_method), payDate: String(r.paid_at), comment: String(r.comment), manager: String(r.manager),
  }));
  const payments = (db.prepare("SELECT p.*, COALESCE(u.name, '') manager FROM payments p LEFT JOIN users u ON u.id=p.manager_id ORDER BY p.order_no").all() as Row[]).map((r): Payment => ({
    id: String(r.id), order: Number(r.order_no), name: String(r.customer_name), contact: String(r.contact), tariff: String(r.tariff), revenue: rubles(r.revenue_kopecks), net: rubles(r.net_kopecks), debt: rubles(r.debt_kopecks), payment: String(r.payment_method), date: String(r.paid_at), manager: String(r.manager), schedule: String(r.payment_schedule),
  }));
  const monthlyPlans: CrmData["monthlyPlans"] = {};
  for (const r of db.prepare("SELECT * FROM monthly_plans ORDER BY month").all() as Row[]) {
    const plan: PlanConfig = { salary: rubles(r.salary_kopecks), bonusRate: Number(r.bonus_rate), minPlan: rubles(r.min_plan_kopecks), targetPlan: rubles(r.target_plan_kopecks), maxPlan: rubles(r.max_plan_kopecks), minMultiplier: Number(r.min_multiplier), targetMultiplier: Number(r.target_multiplier), maxMultiplier: Number(r.max_multiplier) };
    (monthlyPlans[String(r.user_id)] ||= {})[String(r.month)] = plan;
  }
  return { users, leads, payments, monthlyPlans };
}

export function applyCrmMutation(action: CrmMutation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (action.type === "addLead") insertLead({ ...action.lead, id: id("l") });
    if (action.type === "updateLead") {
      const current = readCrmData().leads.find((lead) => lead.id === action.id);
      if (current) {
        const updated = { ...current, ...action.patch };
        db.prepare(`UPDATE leads SET lead_date=?,name=?,phone=?,telegram=?,income=?,request=?,raw_status=?,status=?,tariff=?,amount_kopecks=?,net_amount_kopecks=?,payment_method=?,paid_at=?,comment=?,manager_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .run(updated.date,updated.name,updated.phone,updated.tg,updated.income,updated.request,updated.raw_status,updated.status,updated.tariff,money(updated.sum),money(updated.net),updated.payment,updated.payDate,updated.comment,managerId(updated.manager),updated.id);
        if (updated.status === "paid" && current.status !== "paid") {
          const next = Number((db.prepare("SELECT COALESCE(MAX(order_no),0)+1 next FROM payments").get() as Row).next);
          insertPayment({ id: id("p"), order: next, name: updated.name, contact: updated.phone || updated.tg, tariff: updated.tariff, revenue: updated.sum, net: updated.net || Math.round(updated.sum * 0.85), debt: 0, payment: updated.payment || "сразу", date: updated.payDate || new Date().toISOString().slice(0,10), manager: updated.manager, schedule: "" }, updated.id);
        }
      }
    }
    if (action.type === "addPayment") {
      const next = Number((db.prepare("SELECT COALESCE(MAX(order_no),0)+1 next FROM payments").get() as Row).next);
      insertPayment({ ...action.payment, id: id("p"), order: next });
    }
    if (action.type === "updatePayment") {
      const current = readCrmData().payments.find((payment) => payment.id === action.id);
      if (current) {
        const p = { ...current, ...action.patch };
        db.prepare(`UPDATE payments SET customer_name=?,contact=?,tariff=?,revenue_kopecks=?,net_kopecks=?,debt_kopecks=?,payment_method=?,paid_at=?,manager_id=?,payment_schedule=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .run(p.name,p.contact,p.tariff,money(p.revenue),money(p.net),money(p.debt),p.payment,p.date,managerId(p.manager),p.schedule,p.id);
      }
    }
    if (action.type === "upsertUser") upsertUser(action.user);
    if (action.type === "removeUser") db.prepare("DELETE FROM users WHERE id=?").run(action.id);
    if (action.type === "setMonthlyPlan") {
      const p = action.plan;
      db.prepare(`INSERT INTO monthly_plans (user_id,month,salary_kopecks,bonus_rate,min_plan_kopecks,target_plan_kopecks,max_plan_kopecks,min_multiplier,target_multiplier,max_multiplier) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,month) DO UPDATE SET salary_kopecks=excluded.salary_kopecks,bonus_rate=excluded.bonus_rate,min_plan_kopecks=excluded.min_plan_kopecks,target_plan_kopecks=excluded.target_plan_kopecks,max_plan_kopecks=excluded.max_plan_kopecks,min_multiplier=excluded.min_multiplier,target_multiplier=excluded.target_multiplier,max_multiplier=excluded.max_multiplier,updated_at=CURRENT_TIMESTAMP`)
        .run(action.userId,action.month,money(p.salary),p.bonusRate,money(p.minPlan),money(p.targetPlan),money(p.maxPlan),p.minMultiplier,p.targetMultiplier,p.maxMultiplier);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

startTelegramPolling();
