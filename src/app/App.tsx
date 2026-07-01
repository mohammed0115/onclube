import { BrowserRouter } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/query/queryClient";
import { AuthProvider } from "@/auth/AuthProvider";
import { AppStateProvider } from "@/app/AppState";
import { AppRoutes } from "@/routes";
import { ScreenNavigator } from "@/components/navigation/ScreenNavigator";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* AuthProvider needs the router (navigation on logout). */}
        <AuthProvider>
          <AppStateProvider>
            <AppRoutes />
            {/* Demo-only floating navigator to jump between screens. */}
            <ScreenNavigator />
          </AppStateProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
