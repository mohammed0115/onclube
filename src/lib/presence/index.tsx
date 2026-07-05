// Presence infrastructure barrel + dependency injection.
//
// The UI resolves its provider from context, so tests (and a future real adapter
// — Agora/Daily/Zoom Presence, LiveKit, WebSocket) inject a different factory
// without touching pages or hooks.
import { createContext, useContext } from "react";
import type { PresenceProviderFactory } from "./types";
import { createStubPresenceProvider } from "./stubProvider";

export * from "./types";
export { StubPresenceProvider, createStubPresenceProvider } from "./stubProvider";

export const PresenceProviderContext = createContext<PresenceProviderFactory>(createStubPresenceProvider);

export const usePresenceProviderFactory = (): PresenceProviderFactory => useContext(PresenceProviderContext);
