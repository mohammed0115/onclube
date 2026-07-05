// Whiteboard infrastructure barrel + dependency injection.
//
// The UI resolves its provider from context, so tests (and a future real adapter
// — Excalidraw/tldraw/Fabric/Konva) inject a different factory without touching
// pages or hooks.
import { createContext, useContext } from "react";
import type { WhiteboardProviderFactory } from "./types";
import { createStubWhiteboardProvider } from "./stubProvider";

export * from "./types";
export { StubWhiteboardProvider, createStubWhiteboardProvider } from "./stubProvider";
export { saveBoardSnapshot, loadBoardSnapshot, destroyBoard, _resetBoardCache } from "./boardCache";

export const WhiteboardProviderContext = createContext<WhiteboardProviderFactory>(
  createStubWhiteboardProvider
);

export const useWhiteboardProviderFactory = (): WhiteboardProviderFactory =>
  useContext(WhiteboardProviderContext);
