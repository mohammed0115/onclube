import { BrowserRouter } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/query/queryClient";
import { AuthProvider } from "@/auth/AuthProvider";
import { AppStateProvider } from "@/app/AppState";
import { LanguageProvider } from "@/i18n";
import { AppRoutes } from "@/routes";
import { FloatingLanguageToggle } from "@/components/i18n/LanguageToggle";
import { LiveSessionProviders } from "@/app/LiveSessionProviders";
import { ErrorBoundary } from "@/app/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* AuthProvider needs the router (navigation on logout). */}
        <AuthProvider>
          <LanguageProvider>
          <AppStateProvider>
            {/* Composition root selects real vs stub live-session providers by env. */}
            <LiveSessionProviders>
              <AppRoutes />
              {/* Language switch on pages without the dashboard header (auth, onboarding…). */}
              <FloatingLanguageToggle />
            </LiveSessionProviders>
          </AppStateProvider>
          </LanguageProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
