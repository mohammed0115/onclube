// Transcript infrastructure barrel + dependency injection.
//
// The UI resolves its provider from context, so tests (and a future real adapter
// — Whisper Live / Azure / Google / Deepgram / AssemblyAI / AWS Transcribe) inject
// a different factory without touching pages or hooks.
import { createContext, useContext } from "react";
import type { TranscriptProviderFactory } from "./types";
import { createStubTranscriptProvider } from "./stubProvider";

export * from "./types";
export { StubTranscriptProvider, createStubTranscriptProvider } from "./stubProvider";

export const TranscriptProviderContext = createContext<TranscriptProviderFactory>(createStubTranscriptProvider);

export const useTranscriptProviderFactory = (): TranscriptProviderFactory => useContext(TranscriptProviderContext);
