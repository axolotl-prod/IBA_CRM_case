import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const inputPath = resolve(process.argv[2] || "data/excel-import.tmp.json");
const databasePath = resolve(process.env.CRM_DATABASE_PATH || "data/crm.sqlite");
if (!existsSync(inputPath)) throw new Error(`Не найден подготовленный файл: ${inputPath}`);

const source = JSON.parse(readFileSync(inputPath, "utf8"));
const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");

const text = (value) => String(value ?? "").replace(/\r\n/g, "\n").trim();
function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let normalized = text(value).replace(/\s/g, "").replace(/[^\d,.-]/g, "").replace(/^[.,]+/, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else normalized = normalized.replace(",", ".");
  return Number(normalized) || 0;
}
const kopecks = (value) => Math.round(number(value) * 100);
function excelDate(value) {
  const serial = number(value);
  if (!serial) return text(value);
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
}
function manager(value) {
  const normalized = text(value);
  if (normalized === "pasha") return "Паша";
  if (normalized === "alina") return "Алина";
  if (!normalized || normalized === "ОП" || normalized === "ОП и Вася") return "Вася";
  return normalized;
}
function paymentMethod(value) {
  const normalized = text(value).toLowerCase();
  if (normalized.startsWith("расс")) return "рассрочка";
  if (normalized.startsWith("сразу")) return "сразу";
  return normalized;
}
function status(rawValue, amountValue, tariffValue) {
  const raw = text(rawValue).toLowerCase();
  if (kopecks(amountValue) > 0 || /успеш|оплат|купил|купила/.test(raw)) return "paid";
  if (/отказ|игнор|не готов|не сейчас|не актуал|не звонить|не вышла? на связь|тотал/.test(raw)) return "closed";
  if (/кп|през|ссылк|дедлайн|дума|решени/.test(raw) || text(tariffValue)) return "kp";
  if (raw) return "work";
  return "new";
}
function credentials(password) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

const users = [
  { id: "u_vasya", login: "admin", password: "admin123", name: "Вася", role: "admin", salary: 80000, bonus: 5, min: 500000, target: 1000000, max: 1500000 },
  { id: "u_alina", login: "alina", password: "manager123", name: "Алина", role: "manager", salary: 50000, bonus: 8, min: 1000000, target: 1500000, max: 2000000 },
  { id: "u_pasha", login: "pasha", password: "manager123", name: "Паша", role: "manager", salary: 50000, bonus: 8, min: 1000000, target: 1500000, max: 2000000 },
];

const userByName = new Map(users.map((user) => [user.name, user.id]));
const insertUser = db.prepare(`INSERT INTO users (id,login,password_hash,password_salt,name,role,salary_kopecks,bonus_rate,min_plan_kopecks,target_plan_kopecks,max_plan_kopecks,min_multiplier,target_multiplier,max_multiplier) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insertLead = db.prepare(`INSERT INTO leads (id,lead_date,name,phone,telegram,income,request,raw_status,status,tariff,amount_kopecks,net_amount_kopecks,payment_method,paid_at,comment,manager_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insertPayment = db.prepare(`INSERT INTO payments (id,order_no,lead_id,customer_name,contact,tariff,revenue_kopecks,net_kopecks,debt_kopecks,payment_method,paid_at,manager_id,payment_schedule) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

db.exec("BEGIN IMMEDIATE");
try {
  db.exec("DELETE FROM payments; DELETE FROM leads; DELETE FROM monthly_plans; DELETE FROM users;");
  for (const user of users) {
    const password = credentials(user.password);
    insertUser.run(user.id, user.login, password.hash, password.salt, user.name, user.role, kopecks(user.salary), user.bonus, kopecks(user.min), kopecks(user.target), kopecks(user.max), 1.2, 1.5, 2);
  }

  const leadIdsByKey = new Map();
  for (const lead of source.leads) {
    const id = `excel_lead_${lead.sheet}_${lead.row}`;
    const normalizedName = text(lead.name);
    const normalizedManager = manager(lead.manager);
    insertLead.run(id, excelDate(lead.date), normalizedName, text(lead.phone), text(lead.telegram), text(lead.income), text(lead.request), text(lead.rawStatus), status(lead.rawStatus, lead.amount, lead.tariff), text(lead.tariff).toLowerCase(), kopecks(lead.amount), kopecks(lead.net), paymentMethod(lead.paymentMethod), excelDate(lead.paidAt), text(lead.comment), userByName.get(normalizedManager) || null);
    const key = `${normalizedManager}\u0000${normalizedName.toLowerCase()}`;
    const ids = leadIdsByKey.get(key) || [];
    ids.push(id);
    leadIdsByKey.set(key, ids);
  }

  for (const payment of source.payments) {
    const normalizedManager = manager(payment.manager);
    const normalizedName = text(payment.name);
    const candidates = leadIdsByKey.get(`${normalizedManager}\u0000${normalizedName.toLowerCase()}`) || [];
    insertPayment.run(`excel_payment_${payment.row}`, Math.trunc(number(payment.order)), candidates.length === 1 ? candidates[0] : null, normalizedName, text(payment.contact), text(payment.tariff).toLowerCase(), kopecks(payment.revenue), kopecks(payment.net), kopecks(payment.debt), paymentMethod(payment.paymentMethod), excelDate(payment.paidAt), userByName.get(normalizedManager) || null, text(payment.schedule));
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
  rmSync(inputPath, { force: true });
}

console.log(`SQLite пересобрана из Excel: пользователей ${users.length}, лидов ${source.leads.length}, оплат ${source.payments.length}`);
