import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, act, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "./server";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { useDiagnostics } from "@/hooks/useDiagnostics";
import { api } from "@/api";
import {
  clearDiagnostics,
  getEvents,
  getLastRequestId,
  newRequestId,
  recordEvent,
} from "@/lib/diagnostics";

beforeEach(() => clearDiagnostics());

// ── error boundary ────────────────────────────────────────────────────────────
function Boom(): never {
  throw new Error("kaboom");
}

describe("Global error boundary (Sprint 11)", () => {
  it("renders a friendly fallback when a child throws, and can reset", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {}); // silence React error log
    let shouldThrow = true;
    function Child() {
      if (shouldThrow) return <Boom />;
      return <div>recovered</div>;
    }
    render(
      <ErrorBoundary>
        <Child />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    // A ui.error diagnostic was recorded (metadata only).
    const err = getEvents().find((e) => e.type === "ui.error");
    expect(err?.meta?.name).toBe("Error");
    expect(JSON.stringify(err)).not.toContain("kaboom"); // never the message

    shouldThrow = false;
    await userEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(screen.getByText("recovered")).toBeInTheDocument();
    spy.mockRestore();
  });
});

// ── diagnostics hooks ─────────────────────────────────────────────────────────
describe("Diagnostics hooks (Sprint 11)", () => {
  it("useDiagnostics reflects recorded events and drops sensitive metadata", () => {
    const { result } = renderHook(() => useDiagnostics());
    act(() => result.current.record("provider.reconnect", { provider: "chat", token: "secret-xyz" }));
    const ev = result.current.events.find((e) => e.type === "provider.reconnect");
    expect(ev?.meta?.provider).toBe("chat");
    expect(ev?.meta).not.toHaveProperty("token"); // sensitive keys dropped
  });

  it("clears diagnostics", () => {
    recordEvent("x");
    expect(getEvents().length).toBeGreaterThan(0);
    clearDiagnostics();
    expect(getEvents()).toEqual([]);
  });

  it("newRequestId produces distinct ids", () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });
});

// ── request-id propagation ────────────────────────────────────────────────────
describe("Request correlation (Sprint 11)", () => {
  afterEach(() => server.resetHandlers());

  it("sends X-Request-ID and captures the server's id", async () => {
    let sentHeader: string | null = null;
    server.use(
      http.get("*/api/v1/ping/", ({ request }) => {
        sentHeader = request.headers.get("X-Request-ID");
        return HttpResponse.json({ ok: true }, { headers: { "X-Request-ID": "srv-request-1" } });
      })
    );
    await api.get("/ping/", { auth: false });
    expect(sentHeader).toBeTruthy(); // a client request id was propagated
    expect(getLastRequestId()).toBe("srv-request-1"); // server id captured
  });

  it("records an http.error diagnostic on a failing request", async () => {
    server.use(
      http.get("*/api/v1/fail/", () => HttpResponse.json({ code: "error" }, { status: 500 }))
    );
    await expect(api.get("/fail/", { auth: false })).rejects.toBeTruthy();
    expect(getEvents().some((e) => e.type === "http.error")).toBe(true);
  });
});
