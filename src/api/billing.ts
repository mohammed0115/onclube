import { api, ApiError } from "./client";
import type {
  BillingHistoryItem,
  PaymentProvider,
  PaymentProofDetail,
  Plan,
  SubscriptionDetail,
} from "./types";

export interface SubmitPaymentProofInput {
  planId: string;
  transactionNumber: string;
  transferDatetime: string; // ISO
  amount: string | number;
  receipt: File;
  senderName?: string;
  receiverName?: string;
}

export const billingApi = {
  plans(): Promise<Plan[]> {
    return api.get<Plan[]>("/billing/plans/", { auth: false });
  },

  /** Active payment providers, ordered by displayOrder (no hardcoded bank name). */
  providers(): Promise<PaymentProvider[]> {
    return api.get<PaymentProvider[]>("/billing/providers/", { auth: false });
  },

  /** Default active bank-transfer account (no hardcoded bank name). */
  bankAccount(): Promise<PaymentProvider> {
    return api.get<PaymentProvider>("/billing/bank-account/", { auth: false });
  },

  /** Returns null when the student has no active subscription (API 404 → null). */
  async currentSubscription(): Promise<SubscriptionDetail | null> {
    try {
      return await api.get<SubscriptionDetail>("/student/subscription/");
    } catch (err) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  },

  billingHistory(): Promise<BillingHistoryItem[]> {
    return api.get<BillingHistoryItem[]>("/student/billing/history/");
  },

  /** The student's own latest payment proof (status + review note), or null if none. */
  async latestPaymentProof(): Promise<PaymentProofDetail | null> {
    try {
      return await api.get<PaymentProofDetail>("/billing/payment-proof/latest/");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  submitPaymentProof(input: SubmitPaymentProofInput): Promise<PaymentProofDetail> {
    const form = new FormData();
    form.append("planId", input.planId);
    form.append("transactionNumber", input.transactionNumber);
    form.append("transferDatetime", input.transferDatetime);
    form.append("amount", String(input.amount));
    form.append("receipt", input.receipt);
    if (input.senderName) form.append("senderName", input.senderName);
    if (input.receiverName) form.append("receiverName", input.receiverName);
    return api.postForm<PaymentProofDetail>("/billing/payment-proof/", form);
  },
};
