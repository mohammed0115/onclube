// Whiteboard lifecycle hook — the single home for board business logic.
//
// Owns provider init/destroy (tied to the canvas element), tool/colour/width,
// undo/redo/clear, snapshot preservation (leave) + restore (late join), reconnect,
// and error mapping. The panel is pure presentation and only consumes this hook;
// it never touches a canvas or a provider.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadBoardSnapshot,
  saveBoardSnapshot,
  useWhiteboardProviderFactory,
} from "@/lib/whiteboard";
import type {
  WhiteboardConnectionState,
  WhiteboardError as WhiteboardErrorType,
  WhiteboardErrorCode,
  WhiteboardEvents,
  WhiteboardProvider,
  WhiteboardTool,
} from "@/lib/whiteboard";
import { WhiteboardError } from "@/lib/whiteboard";

export interface UseWhiteboardArgs {
  sessionId: string;
  authorId: string;
}

export interface WhiteboardController {
  connectionState: WhiteboardConnectionState;
  tool: WhiteboardTool;
  color: string;
  strokeWidth: number;
  syncing: boolean;
  error: WhiteboardErrorType | null;
  boardVersion: number;
  setTool: (tool: WhiteboardTool) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  retry: () => void;
  attachCanvas: (el: HTMLCanvasElement | null) => void;
}

const DEFAULT_COLOR = "#111827";
const DEFAULT_WIDTH = 4;

export function useWhiteboard({ sessionId, authorId }: UseWhiteboardArgs): WhiteboardController {
  const factory = useWhiteboardProviderFactory();
  const providerRef = useRef<WhiteboardProvider | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

  const [connectionState, setConnectionState] = useState<WhiteboardConnectionState>("connecting");
  const [tool, setToolState] = useState<WhiteboardTool>("pen");
  const [color, setColorState] = useState(DEFAULT_COLOR);
  const [strokeWidth, setStrokeWidthState] = useState(DEFAULT_WIDTH);
  const [syncing, setSyncing] = useState(true);
  const [error, setError] = useState<WhiteboardErrorType | null>(null);
  const [boardVersion, setBoardVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const identity = useRef({ authorId });
  identity.current = { authorId };

  useEffect(() => {
    if (!canvasEl) return;
    let cancelled = false;
    const provider = factory();
    providerRef.current = provider;
    setError(null);
    setSyncing(true);
    setConnectionState("connecting");

    const events: WhiteboardEvents = {
      onConnectionState: (s) => {
        if (cancelled) return;
        setConnectionState(s);
        if (s === "connected") setSyncing(false);
      },
      onBoardUpdated: () => !cancelled && setBoardVersion((v) => v + 1),
      onOperationReceived: () => !cancelled && setBoardVersion((v) => v + 1),
      onBoardCleared: () => !cancelled && setBoardVersion((v) => v + 1),
      onToolChanged: (t) => !cancelled && setToolState(t),
      onError: (e) => !cancelled && setError(e),
    };

    try {
      provider.initialize({ sessionId, identity: identity.current, canvas: canvasEl, events });
      // Late join: restore the preserved board, then live ops replay on top.
      const snapshot = loadBoardSnapshot(sessionId);
      if (snapshot) provider.importState(snapshot);
    } catch (e: unknown) {
      if (!cancelled) {
        setError(e instanceof WhiteboardError ? e : new WhiteboardError("provider_unavailable"));
        setConnectionState("failed");
        setSyncing(false);
      }
    }

    return () => {
      cancelled = true;
      // Leaving PRESERVES the board in memory (ending clears it separately).
      try {
        saveBoardSnapshot(sessionId, provider.exportState());
      } catch {
        /* best-effort snapshot */
      }
      provider.destroy();
      providerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factory, sessionId, canvasEl, attempt]);

  const guarded = useCallback((fn: () => void, code: WhiteboardErrorCode) => {
    try {
      fn();
    } catch (e: unknown) {
      setError(e instanceof WhiteboardError ? e : new WhiteboardError(code));
    }
  }, []);

  const setTool = useCallback((t: WhiteboardTool) => {
    setToolState(t);
    providerRef.current?.setTool(t);
  }, []);
  const setColor = useCallback((c: string) => {
    setColorState(c);
    providerRef.current?.setColor(c);
  }, []);
  const setStrokeWidth = useCallback((w: number) => {
    setStrokeWidthState(w);
    providerRef.current?.setStrokeWidth(w);
  }, []);

  const undo = useCallback(() => guarded(() => providerRef.current?.undo(), "undo_failed"), [guarded]);
  const redo = useCallback(() => guarded(() => providerRef.current?.redo(), "redo_failed"), [guarded]);
  const clear = useCallback(() => guarded(() => providerRef.current?.clear(), "clear_failed"), [guarded]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return useMemo(
    () => ({
      connectionState,
      tool,
      color,
      strokeWidth,
      syncing,
      error,
      boardVersion,
      setTool,
      setColor,
      setStrokeWidth,
      undo,
      redo,
      clear,
      retry,
      attachCanvas: setCanvasEl,
    }),
    [connectionState, tool, color, strokeWidth, syncing, error, boardVersion, setTool, setColor, setStrokeWidth, undo, redo, clear, retry]
  );
}
