import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import seed from "./seed.json";

export type Role = "admin" | "manager";
export type LeadStatus = "new" | "work" | "kp" | "paid" | "closed";

export interface PlanConfig {
  salary: number;
  bonusRate: number; // % of net revenue
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

interface State {
  users: User[];
  currentUserId: string | null;
  leads: Lead[];
  payments: Payment[];
  // per-user, per-month overrides of PlanConfig
  monthlyPlans: Record<string, Record<string, PlanConfig>>;
  currentMonth: string; // YYYY-MM
}

const STORAGE_KEY = "crm-state-v3";

const defaultUsers: User[] = [
  {
    id: "u_vasya", login: "admin", password: "admin123", name: "Вася", role: "admin",
    salary: 80000, bonusRate: 5,
    minPlan: 500000, targetPlan: 1000000, maxPlan: 1500000,
    minMultiplier: 1.2, targetMultiplier: 1.5, maxMultiplier: 2.0,
  },
  {
    id: "u_alina", login: "alina", password: "manager123", name: "Алина", role: "manager",
    salary: 50000, bonusRate: 8,
    minPlan: 800000, targetPlan: 1200000, maxPlan: 1800000,
    minMultiplier: 1.2, targetMultiplier: 1.5, maxMultiplier: 2.0,
  },
  {
    id: "u_pasha", login: "pasha", password: "manager123", name: "Паша", role: "manager",
    salary: 50000, bonusRate: 8,
    minPlan: 800000, targetPlan: 1200000, maxPlan: 1800000,
    minMultiplier: 1.2, targetMultiplier: 1.5, maxMultiplier: 2.0,
  },
];

function seedPayments(): Payment[] {
  return (seed.payments as any[]).map((p, i) => ({
    id: `p_${i}`,
    ...p,
    manager: p.manager === "ОП" || !p.manager ? "Вася" : p.manager,
  }));
}
function seedLeads(): Lead[] {
  return (seed.leads as any[]).map((l, i) => ({ id: `l_${i}`, ...l }));
}

function latestMonth(payments: Payment[]): string {
  const months = payments.map((p) => (p.date || "").slice(0, 7)).filter(Boolean).sort();
  return months[months.length - 1] || new Date().toISOString().slice(0, 7);
}

function initialState(): State {
  const payments = seedPayments();
  const leads = seedLeads();
  return {
    users: defaultUsers,
    currentUserId: null,
    leads,
    payments,
    monthlyPlans: {},
    currentMonth: latestMonth(payments),
  };
}

interface Ctx {
  state: State;
  currentUser: User | null;
  availableMonths: string[];
  setMonth: (m: string) => void;
  login: (login: string, password: string) => boolean;
  logout: () => void;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  addLead: (l: Omit<Lead, "id">) => void;
  addPayment: (p: Omit<Payment, "id" | "order">) => void;
  updatePayment: (id: string, patch: Partial<Payment>) => void;
  upsertUser: (u: User) => void;
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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // ensure defaults for new fields
        setState({
          ...initialState(),
          ...parsed,
          monthlyPlans: parsed.monthlyPlans || {},
          currentMonth: parsed.currentMonth || latestMonth(parsed.payments || []),
        });
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const currentUser = state.users.find((u) => u.id === state.currentUserId) ?? null;

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    state.payments.forEach((p) => p.date && set.add(p.date.slice(0, 7)));
    state.leads.forEach((l) => l.date && set.add(l.date.slice(0, 7)));
    return Array.from(set).sort();
  }, [state.payments, state.leads]);

  const setMonth = (m: string) => setState((s) => ({ ...s, currentMonth: m }));

  const login = (loginStr: string, password: string) => {
    const u = state.users.find(
      (x) => x.login.toLowerCase() === loginStr.toLowerCase() && x.password === password,
    );
    if (!u) return false;
    setState((s) => ({ ...s, currentUserId: u.id }));
    return true;
  };
  const logout = () => setState((s) => ({ ...s, currentUserId: null }));

  const updateLead = (id: string, patch: Partial<Lead>) =>
    setState((s) => {
      const lead = s.leads.find((l) => l.id === id);
      if (!lead) return s;
      const updated = { ...lead, ...patch };
      let leads = s.leads.map((l) => (l.id === id ? updated : l));
      let payments = s.payments;
      if (patch.status === "paid" && lead.status !== "paid") {
        const exists = payments.some((p) => p.name === updated.name && p.manager === updated.manager);
        if (!exists) {
          const maxOrder = payments.reduce((m, p) => Math.max(m, p.order || 0), 0);
          payments = [
            ...payments,
            {
              id: `p_${Date.now()}`, order: maxOrder + 1,
              name: updated.name, contact: updated.phone || updated.tg,
              tariff: updated.tariff, revenue: updated.sum,
              net: updated.net || Math.round(updated.sum * 0.85),
              debt: 0, payment: updated.payment || "сразу",
              date: updated.payDate || new Date().toISOString().slice(0, 10),
              manager: updated.manager, schedule: "",
            },
          ];
        }
      }
      return { ...s, leads, payments };
    });

  const addLead = (l: Omit<Lead, "id">) =>
    setState((s) => ({ ...s, leads: [{ ...l, id: `l_${Date.now()}` }, ...s.leads] }));

  const addPayment = (p: Omit<Payment, "id" | "order">) =>
    setState((s) => {
      const maxOrder = s.payments.reduce((m, x) => Math.max(m, x.order || 0), 0);
      return { ...s, payments: [...s.payments, { ...p, id: `p_${Date.now()}`, order: maxOrder + 1 }] };
    });

  const updatePayment = (id: string, patch: Partial<Payment>) =>
    setState((s) => ({ ...s, payments: s.payments.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  const upsertUser = (u: User) =>
    setState((s) => {
      const exists = s.users.some((x) => x.id === u.id);
      return { ...s, users: exists ? s.users.map((x) => (x.id === u.id ? u : x)) : [...s.users, u] };
    });

  const removeUser = (id: string) =>
    setState((s) => ({ ...s, users: s.users.filter((u) => u.id !== id) }));

  const setMonthlyPlan = (userId: string, month: string, plan: PlanConfig) =>
    setState((s) => ({
      ...s,
      monthlyPlans: {
        ...s.monthlyPlans,
        [userId]: { ...(s.monthlyPlans[userId] || {}), [month]: plan },
      },
    }));

  const planFor = (userId: string, month: string): PlanConfig => {
    const user = state.users.find((u) => u.id === userId);
    const base: PlanConfig = user
      ? {
          salary: user.salary, bonusRate: user.bonusRate,
          minPlan: user.minPlan, targetPlan: user.targetPlan, maxPlan: user.maxPlan,
          minMultiplier: user.minMultiplier, targetMultiplier: user.targetMultiplier, maxMultiplier: user.maxMultiplier,
        }
      : {
          salary: 0, bonusRate: 0, minPlan: 0, targetPlan: 0, maxPlan: 0,
          minMultiplier: 1, targetMultiplier: 1, maxMultiplier: 1,
        };
    const override = state.monthlyPlans[userId]?.[month];
    return override ? { ...base, ...override } : base;
  };

  const planHistory = (userId: string) => {
    const overrides = state.monthlyPlans[userId] || {};
    return Object.keys(overrides).sort().map((month) => ({ month, plan: overrides[month] }));
  };

  const visibleLeads = () => {
    if (!currentUser) return [];
    if (currentUser.role === "admin") return state.leads;
    return state.leads.filter((l) => l.manager === currentUser.name);
  };
  const visiblePayments = () => {
    if (!currentUser) return [];
    if (currentUser.role === "admin") return state.payments;
    return state.payments.filter((p) => p.manager === currentUser.name);
  };
  const paymentsForMonth = (month: string, managerName?: string) =>
    state.payments.filter(
      (p) => (p.date || "").startsWith(month) && (!managerName || p.manager === managerName),
    );

  return (
    <CrmContext.Provider
      value={{
        state, currentUser, availableMonths, setMonth,
        login, logout,
        updateLead, addLead, addPayment, updatePayment,
        upsertUser, removeUser,
        setMonthlyPlan, planFor, planHistory,
        visibleLeads, visiblePayments, paymentsForMonth,
      }}
    >
      {children}
    </CrmContext.Provider>
  );
}

export function useCrm() {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error("useCrm must be used within CrmProvider");
  return ctx;
}

export function calcBonus(plan: PlanConfig, netRevenue: number) {
  const base = (netRevenue * plan.bonusRate) / 100;
  let mult = 1;
  let tier: "Ниже плана" | "План-минимум" | "Целевой план" | "Максимум" = "Ниже плана";
  if (netRevenue >= plan.maxPlan && plan.maxPlan > 0) { mult = plan.maxMultiplier; tier = "Максимум"; }
  else if (netRevenue >= plan.targetPlan && plan.targetPlan > 0) { mult = plan.targetMultiplier; tier = "Целевой план"; }
  else if (netRevenue >= plan.minPlan && plan.minPlan > 0) { mult = plan.minMultiplier; tier = "План-минимум"; }
  const bonus = Math.round(base * mult);
  const total = plan.salary + bonus;
  return { base: Math.round(base), mult, bonus, total, tier };
}

export function monthLabel(m: string): string {
  const names = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const [y, mo] = m.split("-");
  const idx = Math.max(0, Math.min(11, Number(mo) - 1));
  return `${names[idx]} ${y}`;
}

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Новая заявка",
  work: "В работе",
  kp: "КП отправлено",
  paid: "Оплата",
  closed: "Закрыта / Отказ",
};

export const STATUS_ORDER: LeadStatus[] = ["new", "work", "kp", "paid", "closed"];
