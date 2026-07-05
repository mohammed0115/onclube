import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./server";
import {
  authApi,
  billingApi,
  bookingApi,
  reportsApi,
  sessionsApi,
  topicsApi,
  tokenStore,
  ApiError,
} from "@/api";

describe("MVP flow: register → goal → pay → admin approval → book → session → report", () => {
  it("walks the entire student journey against the API", async () => {
    // 1. Register (public — no tokens yet).
    const created = await authApi.register({
      fullName: "Test Student",
      email: "student@example.com",
      password: "pw-secret-123",
    });
    expect(created.role).toBe("student");

    // 2. Log in → tokens stored.
    await authApi.login("student@example.com", "pw-secret-123");
    expect(tokenStore.access()).toBe("access-1");
    expect(tokenStore.refresh()).toBe("refresh-1");

    // 3. Authenticated profile read (bearer attached by the client).
    const me = await authApi.me();
    expect(me.email).toBe("student@example.com");

    // 4. Onboarding goal.
    const goals = await topicsApi.goals();
    expect(goals.length).toBeGreaterThan(0);
    const profile = await authApi.setGoal(goals[0].id);
    expect(profile.goalId).toBe(goals[0].id);

    // 5. Pricing.
    const plans = await billingApi.plans();
    const plan = plans[0];

    // 6. Submit payment proof (multipart upload). We verify the real client
    //    builds a multipart FormData to the right endpoint via a scoped fetch
    //    spy (jsdom can't serialize multipart through undici; browsers can).
    const realFetch = globalThis.fetch;
    let captured: { url: string; method?: string; isForm: boolean; txn: unknown } | null = null;
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
      const body = init.body;
      const isForm = typeof FormData !== "undefined" && body instanceof FormData;
      captured = {
        url: String(url),
        method: init.method,
        isForm,
        txn: isForm ? (body as FormData).get("transactionNumber") : undefined,
      };
      return new Response(
        JSON.stringify({ id: "pp1", status: "pending_review", transactionNumber: "TRX-1", planName: "Regular", amount: 220, currency: "SDG", transferDatetime: "x", receiptName: "receipt.jpg", submittedAt: "x", retainUntil: null, senderName: null, receiverName: null, reviewedAt: null, reviewNote: null, receiptUrl: "u" }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;
    const receipt = new File([new Uint8Array([1, 2, 3])], "receipt.jpg", { type: "image/jpeg" });
    const proof = await billingApi.submitPaymentProof({
      planId: plan.id,
      transactionNumber: "TRX-1",
      transferDatetime: "2026-06-25T10:00:00Z",
      amount: plan.price,
      receipt,
    });
    globalThis.fetch = realFetch; // restore MSW-patched fetch
    expect(captured!.url).toContain("/api/v1/billing/payment-proof/");
    expect(captured!.method).toBe("POST");
    expect(captured!.isForm).toBe(true);
    expect(captured!.txn).toBe("TRX-1");
    expect(proof.status).toBe("pending_review");
    expect(proof.transactionNumber).toBe("TRX-1");

    // 7. Before approval — no active subscription (404 → null) and booking is locked.
    expect(await billingApi.currentSubscription()).toBeNull();
    const before = await bookingApi.studentDashboard();
    expect(before.paymentStatus).toBe("none");

    // 8. Admin approves (manual review gate).
    const proofs = await topicsApi.adminPaymentProofs();
    expect(proofs[0].status).toBe("pending_review");
    const approval = await topicsApi.approvePayment(proofs[0].id);
    expect(approval.subscriptionStatus).toBe("active");

    // 9. After approval — subscription active, booking unlocked.
    const sub = await billingApi.currentSubscription();
    expect(sub?.status).toBe("active");
    const after = await bookingApi.studentDashboard();
    expect(after.paymentStatus).toBe("approved");

    // 10. Browse topics → pick a slot → book.
    const topics = await topicsApi.studentTopics();
    const slots = await bookingApi.openSlots(topics[0].instructorId);
    const booking = await bookingApi.create({ topicId: topics[0].id, slotId: slots[0].id });
    expect(booking.status).toBe("upcoming");
    expect(booking.sessionsRemaining).toBe(7);

    // 11. Join the live session — server-minted Agora credential only.
    const join = await sessionsApi.join("s1");
    expect(join.agoraAppId).toBe("stub-app-id");
    expect(join.channel).toContain("session-");
    expect(join.agoraToken).toBeTruthy();

    // 12. AI report after the session.
    const report = await reportsApi.byId("r1");
    expect(report.overallScore).toBe(82);
    expect(report.mistakes.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
});

describe("cross-cutting: auth, refresh, errors", () => {
  it("auto-refreshes the access token on a 401 and retries once", async () => {
    tokenStore.set({ access: "access-1", refresh: "refresh-1" });

    // First /me 401s (expired), subsequent calls succeed → proves transparent refresh.
    let calls = 0;
    server.use(
      http.get("*/api/v1/me/", ({ request }) => {
        calls += 1;
        const token = request.headers.get("Authorization");
        if (calls === 1) {
          return HttpResponse.json({ code: "not_authenticated", detail: "expired" }, { status: 401 });
        }
        // After refresh the client must present the new access token.
        expect(token).toBe("Bearer access-2");
        return HttpResponse.json({ id: "u1", fullName: "T", email: "t@e.com", role: "student", status: "active", level: null, goalId: null, paymentStatus: "approved", sessionsRemaining: 8, rating: null, headline: null });
      })
    );

    const me = await authApi.me();
    expect(me.paymentStatus).toBe("approved");
    expect(calls).toBe(2); // original + retry
    expect(tokenStore.access()).toBe("access-2"); // rotated
  });

  it("signals logout when refresh fails and surfaces a 401 ApiError", async () => {
    tokenStore.set({ access: "access-1", refresh: "bad-refresh" });
    const onLogout = vi.fn();
    window.addEventListener("ec:auth-logout", onLogout);

    server.use(
      http.get("*/api/v1/me/", () =>
        HttpResponse.json({ code: "not_authenticated", detail: "expired" }, { status: 401 })
      )
    );

    await expect(authApi.me()).rejects.toBeInstanceOf(ApiError);
    expect(onLogout).toHaveBeenCalled();
    expect(tokenStore.access()).toBeNull(); // cleared
    window.removeEventListener("ec:auth-logout", onLogout);
  });

  it("maps domain errors to ApiError with the backend code", async () => {
    server.use(
      http.post("*/api/v1/student/bookings/", () =>
        HttpResponse.json({ code: "no_active_subscription", detail: "approved subscription required" }, { status: 403 })
      )
    );
    tokenStore.set({ access: "access-1", refresh: "refresh-1" });

    await expect(bookingApi.create({ topicId: "t1", slotId: "slot1" })).rejects.toMatchObject({
      status: 403,
      code: "no_active_subscription",
    });
  });

  it("rejects bad credentials with a 401", async () => {
    await expect(authApi.login("student@example.com", "wrong")).rejects.toMatchObject({ status: 401 });
  });
});
