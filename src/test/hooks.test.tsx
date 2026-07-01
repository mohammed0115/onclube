import { describe, it, expect } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { tokenStore } from "@/api";
import { usePlans, useStudentDashboard, useApprovePayment } from "@/hooks";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("React Query hooks wire to the API", () => {
  it("usePlans resolves plan data", async () => {
    const { result } = renderHook(() => usePlans(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.length).toBe(1);
    expect(result.current.data?.[0].code).toBe("regular");
  });

  it("useStudentDashboard resolves with an authenticated session", async () => {
    tokenStore.set({ access: "access-1", refresh: "refresh-1" });
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.paymentStatus).toBe("none");
  });

  it("useApprovePayment mutation succeeds", async () => {
    tokenStore.set({ access: "access-1", refresh: "refresh-1" });
    const { result } = renderHook(() => useApprovePayment(), { wrapper: makeWrapper() });
    const res = await result.current.mutateAsync("pp1");
    expect(res.subscriptionStatus).toBe("active");
  });
});
