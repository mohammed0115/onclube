// Participant-signal infrastructure barrel + dependency injection.
//
// The UI resolves its provider from context, so tests (and a future real adapter
// — Agora RTM / LiveKit Data / Daily / WebSocket) inject a different factory
// without touching pages or hooks.
import { createContext, useContext } from "react";
import type { ParticipantSignalProviderFactory } from "./types";
import { createStubParticipantSignalProvider } from "./stubProvider";

export * from "./types";
export { StubParticipantSignalProvider, createStubParticipantSignalProvider } from "./stubProvider";

export const ParticipantSignalProviderContext = createContext<ParticipantSignalProviderFactory>(
  createStubParticipantSignalProvider
);

export const useParticipantSignalProviderFactory = (): ParticipantSignalProviderFactory =>
  useContext(ParticipantSignalProviderContext);
