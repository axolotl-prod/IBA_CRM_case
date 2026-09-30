export type Role = "admin" | "manager";
export type LeadStatus = "new" | "work" | "kp" | "paid" | "closed";

export const TARIFFS = [
  "Обучение с куратором",
  "Самостоятельное обучение",
  "Обучение с VIP сопровождением от автора курса",
  "Часовая консультация",
] as const;

export interface PlanConfig {
  salary: number;
  bonusRate: number;
  minPlan: number;
  targetPlan: number;
  maxPlan: number;
  minMultiplier: number;
  targetMultiplier: number;
  maxMultiplier: number;
}

export interface User extends PlanConfig {
  id: string;
  login: string;
  /** Empty for records loaded from the database; only populated while setting a password. */
  password: string;
  name: string;
  role: Role;
}

export interface Lead {
  id: string;
  date: string;
  name: string;
  phone: string;
  tg: string;
  income: string;
  request: string;
  raw_status: string;
  status: LeadStatus;
  tariff: string;
  sum: number;
  net: number;
  payment: string;
  payDate: string;
  comment: string;
  manager: string;
}

export type TelegramMessageStatus = "received" | "queued" | "sent" | "failed";

export interface TelegramChatSummary {
  id: string;
  contactId: string;
  name: string;
  username: string;
  phone: string;
  manager: string;
  leadId: string;
  leadName: string;
  tariff: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  connected: boolean;
}

export interface TelegramChatMessage {
  id: string;
  chatId: string;
  direction: "incoming" | "outgoing" | "system";
  messageType: "text" | "document" | "photo" | "sticker" | "system";
  text: string;
  senderName: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: TelegramMessageStatus;
  error: string;
  createdAt: string;
}

export interface TelegramLeadConnection {
  leadId: string;
  leadName: string;
  connected: boolean;
  chatId: string;
  inviteUrl: string;
  botUsername: string;
}

export interface TelegramChatsData {
  chats: TelegramChatSummary[];
  messages: TelegramChatMessage[];
  selectedChatId: string;
  leadConnection: TelegramLeadConnection | null;
}

export type InvoiceStatus = "generating" | "saved" | "sent" | "paid" | "cancelled" | "failed";

export interface InvoiceCompanyDetails {
  name: string;
  inn: string;
  kpp: string;
  ogrn: string;
  address: string;
  bankName: string;
  bik: string;
  checkingAccount: string;
  correspondentAccount: string;
  director: string;
  isTest: boolean;
}

export interface InvoiceDraftInput {
  leadId: string;
  description: string;
  amount: number;
  quantity: number;
  dueDate: string;
  vatMode: "none" | "included";
  vatRate: number;
  comment: string;
  paymentPurpose: string;
}

export interface InvoiceSummary {
  id: string;
  number: string;
  leadId: string;
  leadName: string;
  manager: string;
  description: string;
  amount: number;
  dueDate: string;
  status: InvoiceStatus;
  isTest: boolean;
  version: number;
  createdAt: string;
  sentAt: string;
  telegramConnected: boolean;
}

export interface InvoicePageData {
  invoices: InvoiceSummary[];
  company: InvoiceCompanyDetails;
  selectedLead: Lead | null;
  telegramConnected: boolean;
}

export interface Payment {
  id: string;
  order: number;
  name: string;
  contact: string;
  tariff: string;
  revenue: number;
  net: number;
  debt: number;
  payment: string;
  date: string;
  manager: string;
  schedule: string;
}

export interface CrmData {
  users: User[];
  leads: Lead[];
  payments: Payment[];
  monthlyPlans: Record<string, Record<string, PlanConfig>>;
}

export type CrmMutation =
  | { type: "updateLead"; id: string; patch: Partial<Lead> }
  | { type: "addLead"; lead: Omit<Lead, "id"> }
  | { type: "addPayment"; payment: Omit<Payment, "id" | "order"> }
  | { type: "updatePayment"; id: string; patch: Partial<Payment> }
  | { type: "upsertUser"; user: User }
  | { type: "removeUser"; id: string }
  | { type: "setMonthlyPlan"; userId: string; month: string; plan: PlanConfig };
