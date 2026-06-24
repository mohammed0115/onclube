import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { PaymentStatus, Role } from "@/types";
import { currentStudent } from "@/data/mockData";

interface AppState {
  role: Role;
  setRole: (r: Role) => void;
  /** Mock payment status for the demo student — gates session booking. */
  paymentStatus: PaymentStatus;
  setPaymentStatus: (s: PaymentStatus) => void;
  /** Business rule: a student can only book once payment is approved. */
  canBook: boolean;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("student");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(currentStudent.paymentStatus);

  const value = useMemo<AppState>(
    () => ({
      role,
      setRole,
      paymentStatus,
      setPaymentStatus,
      canBook: paymentStatus === "approved",
    }),
    [role, paymentStatus]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
