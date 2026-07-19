import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, CheckCheck, Clock, Send, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { ChatConnectionState, ChatDeliveryState, ChatError, ChatMessage } from "@/lib/chat";

const CONNECTION_COPY: Record<string, { label: string; tone: string; pulse?: boolean }> = {
  idle: { label: "Preparing…", tone: "text-slate-400" },
  connecting: { label: "Connecting…", tone: "text-amber-500", pulse: true },
  connected: { label: "Connected", tone: "text-emerald-500" },
  reconnecting: { label: "Reconnecting…", tone: "text-amber-500", pulse: true },
  disconnected: { label: "Disconnected", tone: "text-red-500" },
  failed: { label: "Connection failed", tone: "text-red-500" },
};

const ERROR_COPY: Record<string, string> = {
  connection_lost: "Connection lost. Reconnecting…",
  provider_unavailable: "Chat is temporarily unavailable.",
  send_failed: "Message couldn’t be sent. Tap to try again.",
  message_timeout: "Message timed out. Please try again.",
  oversized_message: "That message is too long.",
  empty_message: "Type a message before sending.",
  unsupported_transport: "Chat isn’t supported here.",
  unknown: "Something went wrong.",
};

function timeOf(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function DeliveryTick({ state }: { state: ChatDeliveryState }) {
  const { tx } = useI18n();
  if (state === "sending") return <Clock size={11} className="text-white/60" aria-label={tx("Sending")} />;
  if (state === "failed") return <TriangleAlert size={11} className="text-red-300" aria-label={tx("Failed")} />;
  if (state === "read") return <CheckCheck size={12} className="text-sky-200" aria-label={tx("Read")} />;
  if (state === "delivered") return <CheckCheck size={12} className="text-white/70" aria-label={tx("Delivered")} />;
  return <Check size={12} className="text-white/70" aria-label={tx("Sent")} />;
}

function MessageBubble({ message, own }: { message: ChatMessage; own: boolean }) {
  return (
    <div className={cn("flex flex-col", own ? "items-end" : "items-start")}>
      {!own && <span className="mb-0.5 px-1 text-xs font-medium text-slate-500">{message.senderName}</span>}
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
          own ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-slate-100 text-slate-900"
        )}
      >
        {message.text}
      </div>
      <div className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-slate-400">
        <span>{timeOf(message.timestamp)}</span>
        {own && <DeliveryTick state={message.delivery} />}
      </div>
    </div>
  );
}

export interface ChatPanelProps {
  connectionState: ChatConnectionState;
  messages: ChatMessage[];
  myId: string;
  error: ChatError | null;
  unreadCount: number;
  firstUnreadId: string | null;
  maxLength: number;
  onSend: (text: string) => void;
  onMarkRead: () => void;
  onClose: () => void;
}

export function ChatPanel({
  connectionState,
  messages,
  myId,
  error,
  firstUnreadId,
  maxLength,
  onSend,
  onMarkRead,
  onClose,
}: ChatPanelProps) {
  const { tx } = useI18n();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const conn = CONNECTION_COPY[connectionState] ?? CONNECTION_COPY.idle;
  const connecting = connectionState === "connecting" && messages.length === 0;

  // Auto-scroll to the newest message whenever the list grows.
  useEffect(() => {
    const el = bottomRef.current;
    if (typeof el?.scrollIntoView === "function") el.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function submit() {
    const text = draft;
    setDraft("");
    onSend(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <aside className="flex h-full w-full flex-col bg-white text-slate-900" aria-label={tx("Session chat")}>
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{tx("Chat")}</span>
          <span className={cn("text-[11px] font-medium", conn.tone, conn.pulse && "animate-pulse")} role="status" aria-live="polite">
            {tx(conn.label)}
          </span>
        </div>
        <button type="button" aria-label={tx("Close chat")} onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3" data-testid="chat-scroll">
        {connecting ? (
          <div className="flex h-full items-center justify-center" role="status" aria-live="polite">
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
              <span className="text-xs">{tx("Connecting to chat…")}</span>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">{tx("No messages yet. Say hello 👋")}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id}>
              {firstUnreadId === m.id && (
                <div className="my-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-primary" role="separator">
                  <span className="h-px flex-1 bg-primary/30" /> {tx("New messages")} <span className="h-px flex-1 bg-primary/30" />
                </div>
              )}
              <MessageBubble message={m} own={m.senderId === myId} />
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600" role="alert">
          {tx(ERROR_COPY[error.code] ?? ERROR_COPY.unknown)}
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-slate-200 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onMarkRead}
          rows={1}
          maxLength={maxLength}
          aria-label={tx("Message")}
          placeholder={tx("Type a message…")}
          className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          aria-label={tx("Send message")}
          onClick={submit}
          disabled={connectionState !== "connected" && connectionState !== "reconnecting"}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </aside>
  );
}
