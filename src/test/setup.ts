import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { configure } from "@testing-library/react";
import { server, resetState } from "./server";

// Raise the default findBy*/waitFor timeout from 1000ms. On a cold first run the
// module transform + data fetch + render can exceed 1s, which made data-driven
// tests (e.g. the payment-approval detail) flaky. 5s removes that race without
// slowing passing assertions (they resolve as soon as the element appears).
configure({ asyncUtilTimeout: 5000 });

// jsdom lacks ResizeObserver (recharts' ResponsiveContainer needs it).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  server.resetHandlers();
  resetState();
  localStorage.clear();
});

afterAll(() => server.close());
