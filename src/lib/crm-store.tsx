import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import seed from "./seed.json";

export type Role = "admin" | "manager";
export type LeadStatus = "new" | "work" | "kp" | "paid" | "closed";

export interface User {
  id: string;
  login: string;
  password: string;
  name: string;
  role: Role;
  salary: number;
  bonusRate: number; // % of net revenue as base bonus
  minPlan: number;
  targetPlan: number;
  minMultiplier: number; // multiplier when min plan hit
  targetMultiplier: number; // multiplier when target plan hit
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
  manager: string; // user name
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
}

const STORAGE_KEY = "crm-state-v1";

const defaultUsers: User[] = [
  {
    id: "u_vasya",
    login: "admin",
    password: "admin123",
    name: "Вася",
    role: "admin",
    salary: 80000,
    bonusRate: 5,
    minPlan: 500000,
    targetPlan: 1000000,
    minMultiplier: 1.2,
    targetMultiplier: 1.5,
  },
  {
    id: "u_alina",
    login: "alina",
    password: "manager123",
    name: "Алина",
    role: "manager",
    salary: 50000,
    bonusRate: 8,
    minPlan: 1000000,
    targetPlan: 1500000,
    minMultiplier: 1.2,
    targetMultiplier: 1.5,
  },
  {
    id: "u_pasha",
    login: "pasha",
    password: "manager123",
    name: "Паша",
    role: "manager",
    salary: 50000,
    bonusRate: 8,
    minPlan: 1000000,
    targetPlan: 1500000,
    minMultiplier: 1.2,
    targetMultiplier: 1.5,
  },
];

function initialState(): State {
  const leads: Lead[] = (seed.leads as any[]).map((l, i) => ({
    id: `l_${i}`,
    ...l,
  }));
  const payments: Payment[] = (seed.payments as any[]).map((p, i) => ({
    id: `p_${i}`,
    ...p,
    manager: p.manager === "ОП" ? "Вася" : p.manager,
  }));
  return { users: defaultUsers, currentUserId: null, leads, payments };
}

interface Ctx {
  state: State;
  currentUser: User | null;
  login: (login: string, password: string) => boolean;
  logout: () => void;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  addLead: (l: Omit<Lead, "id">) => void;
  addPayment: (p: Omit<Payment, "id" | "order">) => void;
  updatePayment: (id: string, patch: Partial<Payment>) => void;
  upsertUser: (u: User) => void;
  removeUser: (id: string) => void;
  visibleLeads: () => Lead[];
  visiblePayments: () => Payment[];
}

const CrmContext = createContext<Ctx | null>(null);

export function CrmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const currentUser = state.users.find((u) => u.id === state.currentUserId) ?? null;

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
      // Auto-create payment on move to paid
      if (patch.status === "paid" && lead.status !== "paid") {
        const exists = payments.some((p) => p.name === updated.name && p.manager === updated.manager);
        if (!exists) {
          const maxOrder = payments.reduce((m, p) => Math.max(m, p.order || 0), 0);
          payments = [
            ...payments,
            {
              id: `p_${Date.now()}`,
              order: maxOrder + 1,
              name: updated.name,
              contact: updated.phone || updated.tg,
              tariff: updated.tariff,
              revenue: updated.sum,
              net: updated.net || Math.round(updated.sum * 0.85),
              debt: 0,
              payment: updated.payment || "сразу",
              date: updated.payDate || new Date().toISOString().slice(0, 10),
              manager: updated.manager,
              schedule: "",
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
      return {
        ...s,
        payments: [...s.payments, { ...p, id: `p_${Date.now()}`, order: maxOrder + 1 }],
      };
    });

  const updatePayment = (id: string, patch: Partial<Payment>) =>
    setState((s) => ({
      ...s,
      payments: s.payments.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));

  const upsertUser = (u: User) =>
    setState((s) => {
      const exists = s.users.some((x) => x.id === u.id);
      return {
        ...s,
        users: exists ? s.users.map((x) => (x.id === u.id ? u : x)) : [...s.users, u],
      };
    });

  const removeUser = (id: string) =>
    setState((s) => ({ ...s, users: s.users.filter((u) => u.id !== id) }));

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

  return (
    <CrmContext.Provider
      value={{
        state,
        currentUser,
        login,
        logout,
        updateLead,
        addLead,
        addPayment,
        updatePayment,
        upsertUser,
        removeUser,
        visibleLeads,
        visiblePayments,
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

export function calcBonus(user: User, netRevenue: number) {
  const base = (netRevenue * user.bonusRate) / 100;
  let mult = 1;
  let tier = "Ниже плана";
  if (netRevenue >= user.targetPlan) {
    mult = user.targetMultiplier;
    tier = "Целевой план";
  } else if (netRevenue >= user.minPlan) {
    mult = user.minMultiplier;
    tier = "План-минимум";
  }
  const bonus = Math.round(base * mult);
  const total = user.salary + bonus;
  return { base: Math.round(base), mult, bonus, total, tier };
}

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Новая заявка",
  work: "В работе",
  kp: "КП отправлено",
  paid: "Оплата",
  closed: "Закрыта / Отказ",
};

export const STATUS_ORDER: LeadStatus[] = ["new", "work", "kp", "paid", "closed"];
