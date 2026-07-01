import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";

/** Render a page inside the real providers (auth + query + router) with a session. */
export function renderPage(
  element: ReactElement,
  { route = "/", path }: { route?: string; path?: string } = {}
) {
  tokenStore.set({ access: "access-1", refresh: "refresh-1" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          {path ? (
            <Routes>
              <Route path={path} element={element} />
            </Routes>
          ) : (
            element
          )}
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
