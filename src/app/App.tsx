import { BrowserRouter } from "react-router";
import { AppStateProvider } from "@/app/AppState";
import { AppRoutes } from "@/routes";
import { ScreenNavigator } from "@/components/navigation/ScreenNavigator";

export default function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <AppRoutes />
        {/* Demo-only floating navigator to jump between all 20 screens + switch role/payment state. */}
        <ScreenNavigator />
      </BrowserRouter>
    </AppStateProvider>
  );
}
