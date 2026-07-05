// Recording infrastructure barrel + dependency injection.
//
// The UI resolves its provider from context, so tests (and a future real adapter
// — Agora Cloud Recording / Daily / Zoom / LiveKit Egress / FFmpeg) inject a
// different factory without touching pages or hooks.
import { createContext, useContext } from "react";
import type { RecordingProviderFactory } from "./types";
import { createStubRecordingProvider } from "./stubProvider";

export * from "./types";
export { StubRecordingProvider, createStubRecordingProvider } from "./stubProvider";

export const RecordingProviderContext = createContext<RecordingProviderFactory>(
  createStubRecordingProvider
);

export const useRecordingProviderFactory = (): RecordingProviderFactory =>
  useContext(RecordingProviderContext);
