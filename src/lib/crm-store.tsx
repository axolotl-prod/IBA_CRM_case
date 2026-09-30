import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authenticate, loadCrmData, mutateCrmData, syncGoogleSheets } from "./crm-functions";
import type { CrmMutation, Lead, LeadStatus, Payment, PlanConfig, User } from "./crm-types";

export type { Lead, LeadStatus, Payment, PlanConfig, Role, User } from "./crm-types";

interface State {
  users: User[];
  currentUserId: string | null;
  leads: Lead[];
  payments: Payment[];
  monthlyPlans: Record<string, Record<string, PlanConfig>>;
  currentMonth: string;
}

const SESSION_KEY = "crm-current-user";

function latestMonth(payments: Payment[]): string {
  const months = payments.map((p) => (p.date || "").slice(0, 7)).filter(Boolean).sort();
  return months[months.length - 1] || new Date().toISOString().slice(0, 7);
}

function initialState(): State {
  return { users: [], currentUserId: null, leads: [], payments: [], monthlyPlans: {}, currentMonth: "" };
}

interface Ctx {
  state: State;
  loading: boolean;
  googleSheetsSyncing: boolean;
  currentUser: User | null;
  availableMonths: string[];
  setMonth: (month: string) => void;
  login: (login: string, password: string) => Promise<boolean>;
  logout: () => void;
  syncFromGoogleSheets: () => Promise<{ configured: boolean; received: number; added: number; skipped: number }>;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  addLead: (lead: Omit<Lead, "id">) => void;
  addPayment: (payment: Omit<Payment, "id" | "order">) => void;
  updatePayment: (id: string, patch: Partial<Payment>) => void;
  upsertUser: (user: User) => void;
  removeUser: (id: string) => void;
  setMonthlyPlan: (userId: string, month: string, plan: PlanConfig) => void;
  planFor: (userId: string, month: string) => PlanConfig;
  planHistory: (userId: string) => Array<{ month: string; plan: PlanConfig }>;
  visibleLeads: () => Lead[];
  visiblePayments: () => Payment[];
  paymentsForMonth: (month: string, managerName?: string) => Payment[];
}

const CrmContext = createContext<Ctx | null>(null);

export function CrmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);
  const [loading, setLoading] = useState(true);
  const [googleSheetsSyncing, setGoogleSheetsSyncing] = useState(false);

  useEffect(() => {
    loadCrmData()
      .then((data) => setState({
        ...data,
        currentUserId: localStorage.getItem(SESSION_KEY),
        currentMonth: latestMonth(data.payments),
      }))
      .catch((error) => console.error("Не удалось загрузить SQLite CRM", error))
      .finally(() => setLoading(false));
  }, []);

  const syncFromGoogleSheets = async () => {
    setGoogleSheetsSyncing(true);
    try {
      const result = await syncGoogleSheets();
      if (result.added > 0) {
        const data = await loadCrmData();
        setState((current) => ({ ...current, ...data }));
      }
      return result;
    } finally {
      setGoogleSheetsSyncing(false);
    }
  };

  useEffect(() => {
    const automaticSync = () => void syncFromGoogleSheets().catch((error) => console.error("Не удалось синхронизировать Google Sheets", error));
    automaticSync();
    const interval = window.setInterval(automaticSync, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const persist = (action: CrmMutation) => {
    void mutateCrmData({ data: action })
      .then((data) => setState((current) => ({ ...current, ...data })))
      .catch((error) => console.error("Не удалось сохранить изменение в SQLite", error));
  };

  const currentUser = state.users.find((user) => user.id === state.currentUserId) ?? null;
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    state.payments.forEach((payment) => payment.date && months.add(payment.date.slice(0, 7)));
    state.leads.forEach((lead) => lead.date && months.add(lead.date.slice(0, 7)));
    return Array.from(months).sort();
  }, [state.payments, state.leads]);

  const setMonth = (currentMonth: string) => setState((current) => ({ ...current, currentMonth }));
  const login = async (loginValue: string, password: string) => {
    const userId = await authenticate({ data: { login: loginValue, password } });
    if (!userId) return false;
    localStorage.setItem(SESSION_KEY, userId);
    setState((current) => ({ ...current, currentUserId: userId }));
    return true;
  };
  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setState((current) => ({ ...current, currentUserId: null }));
  };

  const updateLead = (leadId: string, patch: Partial<Lead>) => {
    setState((current) => {
      const existing = current.leads.find((lead) => lead.id === leadId);
      if (!existing) return current;
      const updated = { ...existing, ...patch };
      let payments = current.payments;
      if (updated.status === "paid" && existing.status !== "paid") {
        const order = payments.reduce((max, payment) => Math.max(max, payment.order || 0), 0) + 1;
        payments = [...payments, { id: `p_${Date.now()}`, order, name: updated.name, contact: updated.phone || updated.tg, tariff: updated.tariff, revenue: updated.sum, net: updated.net || Math.round(updated.sum * 0.85), debt: 0, payment: updated.payment || "сразу", date: updated.payDate || new Date().toISOString().slice(0, 10), manager: updated.manager, schedule: "" }];
      }
      return { ...current, leads: current.leads.map((lead) => lead.id === leadId ? updated : lead), payments };
    });
    persist({ type: "updateLead", id: leadId, patch });
  };

  const addLead = (lead: Omit<Lead, "id">) => {
    setState((current) => ({ ...current, leads: [{ ...lead, id: `l_${Date.now()}` }, ...current.leads] }));
    persist({ type: "addLead", lead });
  };
  const addPayment = (payment: Omit<Payment, "id" | "order">) => {
    setState((current) => {
      const order = current.payments.reduce((max, item) => Math.max(max, item.order || 0), 0) + 1;
      return { ...current, payments: [...current.payments, { ...payment, id: `p_${Date.now()}`, order }] };
    });
    persist({ type: "addPayment", payment });
  };
  const updatePayment = (paymentId: string, patch: Partial<Payment>) => {
    setState((current) => ({ ...current, payments: current.payments.map((payment) => payment.id === paymentId ? { ...payment, ...patch } : payment) }));
    persist({ type: "updatePayment", id: paymentId, patch });
  };
  const upsertUser = (user: User) => {
    setState((current) => ({ ...current, users: current.users.some((item) => item.id === user.id) ? current.users.map((item) => item.id === user.id ? user : item) : [...current.users, user] }));
    persist({ type: "upsertUser", user });
  };
  const removeUser = (userId: string) => {
    setState((current) => ({ ...current, users: current.users.filter((user) => user.id !== userId) }));
    persist({ type: "removeUser", id: userId });
  };
  const setMonthlyPlan = (userId: string, month: string, plan: PlanConfig) => {
    setState((current) => ({ ...current, monthlyPlans: { ...current.monthlyPlans, [userId]: { ...(current.monthlyPlans[userId] || {}), [month]: plan } } }));
    persist({ type: "setMonthlyPlan", userId, month, plan });
  };

  const planFor = (userId: string, month: string): PlanConfig => {
    const user = state.users.find((item) => item.id === userId);
    const base: PlanConfig = user ? { salary: user.salary, bonusRate: user.bonusRate, minPlan: user.minPlan, targetPlan: user.targetPlan, maxPlan: user.maxPlan, minMultiplier: user.minMultiplier, targetMultiplier: user.targetMultiplier, maxMultiplier: user.maxMultiplier } : { salary: 0, bonusRate: 0, minPlan: 0, targetPlan: 0, maxPlan: 0, minMultiplier: 1, targetMultiplier: 1, maxMultiplier: 1 };
    return { ...base, ...(state.monthlyPlans[userId]?.[month] || {}) };
  };
  const planHistory = (userId: string) => Object.entries(state.monthlyPlans[userId] || {}).sort(([a], [b]) => a.localeCompare(b)).map(([month, plan]) => ({ month, plan }));
  const visibleLeads = () => !currentUser ? [] : currentUser.role === "admin" ? state.leads : state.leads.filter((lead) => lead.manager === currentUser.name);
  const visiblePayments = () => !currentUser ? [] : currentUser.role === "admin" ? state.payments : state.payments.filter((payment) => payment.manager === currentUser.name);
  const paymentsForMonth = (month: string, managerName?: string) => state.payments.filter((payment) => payment.date.startsWith(month) && (!managerName || payment.manager === managerName));

  return <CrmContext.Provider value={{ state, loading, googleSheetsSyncing, currentUser, availableMonths, setMonth, login, logout, syncFromGoogleSheets, updateLead, addLead, addPayment, updatePayment, upsertUser, removeUser, setMonthlyPlan, planFor, planHistory, visibleLeads, visiblePayments, paymentsForMonth }}>{children}</CrmContext.Provider>;
}

export function useCrm() {
  const context = useContext(CrmContext);
  if (!context) throw new Error("useCrm must be used within CrmProvider");
  return context;
}

export function calcBonus(plan: PlanConfig, netRevenue: number) {
  const base = (netRevenue * plan.bonusRate) / 100;
  let mult = 1;
  let tier: "Ниже плана" | "План-минимум" | "Целевой план" | "Максимум" = "Ниже плана";
  if (netRevenue >= plan.maxPlan && plan.maxPlan > 0) { mult = plan.maxMultiplier; tier = "Максимум"; }
  else if (netRevenue >= plan.targetPlan && plan.targetPlan > 0) { mult = plan.targetMultiplier; tier = "Целевой план"; }
  else if (netRevenue >= plan.minPlan && plan.minPlan > 0) { mult = plan.minMultiplier; tier = "План-минимум"; }
  const bonus = Math.round(base * mult);
  return { base: Math.round(base), mult, bonus, total: plan.salary + bonus, tier };
}

export function monthLabel(month: string): string {
  const names = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const [year, monthNumber] = month.split("-");
  return `${names[Math.max(0, Math.min(11, Number(monthNumber) - 1))]} ${year}`;
}

export const STATUS_LABELS: Record<LeadStatus, string> = { new: "Новая заявка", work: "В работе", kp: "КП отправлено", paid: "Оплата", closed: "Закрыта / Отказ" };
export const STATUS_ORDER: LeadStatus[] = ["new", "work", "kp", "paid", "closed"];
