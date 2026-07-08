import { BrowserRouter } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/query/queryClient";
import { AuthProvider } from "@/auth/AuthProvider";
import { AppStateProvider } from "@/app/AppState";
import { AppRoutes } from "@/routes";
import { ScreenNavigator } from "@/components/navigation/ScreenNavigator";
import { LiveSessionProviders } from "@/app/LiveSessionProviders";
import { ErrorBoundary } from "@/app/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* AuthProvider needs the router (navigation on logout). */}
        <AuthProvider>
          <AppStateProvider>
            {/* Composition root selects real vs stub live-session providers by env. */}
            <LiveSessionProviders>
              <AppRoutes />
              {/* Demo-only floating navigator to jump between screens. */}
              <ScreenNavigator />
            </LiveSessionProviders>
          </AppStateProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
