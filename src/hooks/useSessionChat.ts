// In-session chat lifecycle hook — the single home for chat business logic.
//
// Owns transport connect/disconnect, message ordering, optimistic send +
// delivery state, unread tracking, reconnect, and validation. The panel is pure
// presentation and only consumes this hook; it never touches a transport.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatTransportFactory, validateChatMessage } from "@/lib/chat";
import type {
  ChatConnectionState,
  ChatError as ChatErrorType,
  ChatMessage,
  ChatTransport,
  ChatTransportEvents,
} from "@/lib/chat";
import { ChatError } from "@/lib/chat";

export interface UseSessionChatArgs {
  sessionId: string;
  senderId: string;
  senderName: string;
}

export interface SessionChatController {
  connectionState: ChatConnectionState;
  messages: ChatMessage[];
  myId: string;
  error: ChatErrorType | null;
  unreadCount: number;
  firstUnreadId: string | null;
  send: (raw: string) => Promise<void>;
  markRead: () => void;
  retry: () => void;
}

function newClientId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `m-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

const byTime = (a: ChatMessage, b: ChatMessage) => a.timestamp.localeCompare(b.timestamp);

export function useSessionChat({ sessionId, senderId, senderName }: UseSessionChatArgs): SessionChatController {
  const factory = useChatTransportFactory();
  const transportRef = useRef<ChatTransport | null>(null);

  const [connectionState, setConnectionState] = useState<ChatConnectionState>("connecting");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<ChatErrorType | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const identity = useRef({ senderId, senderName });
  identity.current = { senderId, senderName };

  // Keep messages chronologically ordered and de-duplicated by id (acks reuse id).
  const upsert = useCallback((incoming: ChatMessage) => {
    setMessages((prev) => {
      const rest = prev.filter((m) => m.id !== incoming.id);
      return [...rest, incoming].sort(byTime);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const transport = factory();
    transportRef.current = transport;
    setError(null);
    setConnectionState("connecting");
    setMessages([]);
    setUnreadCount(0);
    setFirstUnreadId(null);

    const events: ChatTransportEvents = {
      onConnectionState: (s) => !cancelled && setConnectionState(s),
      onMessageReceived: (m) => {
        if (cancelled) return;
        upsert(m);
        if (m.senderId !== identity.current.senderId) {
          setUnreadCount((c) => c + 1);
          setFirstUnreadId((cur) => cur ?? m.id);
        }
      },
      onMessageSent: (m) => !cancelled && upsert(m), // ack → delivery update
      onError: (e) => !cancelled && setError(e),
    };

    transport
      .connect({ sessionId, identity: identity.current, events })
      .then(() => transport.loadHistory())
      .then((history) => {
        if (!cancelled) setMessages([...history].sort(byTime));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ChatError ? e : new ChatError("provider_unavailable"));
        setConnectionState("failed");
      });

    return () => {
      cancelled = true;
      void transport.disconnect(); // leaving/ending the session disconnects chat
      transportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factory, sessionId, senderId, attempt]);

  const send = useCallback(async (raw: string) => {
    const result = validateChatMessage(raw);
    if (!result.ok) {
      setError(new ChatError(result.code));
      return;
    }
    setError(null);
    const msg: ChatMessage = {
      id: newClientId(),
      senderId: identity.current.senderId,
      senderName: identity.current.senderName,
      timestamp: new Date().toISOString(),
      text: result.text,
      delivery: "sending",
    };
    upsert(msg); // optimistic
    try {
      await transportRef.current?.sendMessage({ clientId: msg.id, text: msg.text });
    } catch (e: unknown) {
      upsert({ ...msg, delivery: "failed" });
      setError(e instanceof ChatError ? e : new ChatError("send_failed"));
    }
  }, [upsert]);

  const markRead = useCallback(() => {
    setUnreadCount(0);
    setFirstUnreadId(null);
    const last = messages[messages.length - 1];
    if (last) transportRef.current?.markRead(last.id);
  }, [messages]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return useMemo(
    () => ({
      connectionState,
      messages,
      myId: senderId,
      error,
      unreadCount,
      firstUnreadId,
      send,
      markRead,
      retry,
    }),
    [connectionState, messages, senderId, error, unreadCount, firstUnreadId, send, markRead, retry]
  );
}
