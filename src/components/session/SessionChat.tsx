// Chat container — wires the useSessionChat hook to the pure ChatPanel. This is
// the only place the two meet; the panel stays presentation-only and the hook
// stays transport-agnostic.
import { useSessionChat } from "@/hooks";
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/chat";
import { ChatPanel } from "./ChatPanel";

export function SessionChat({
  sessionId,
  senderId,
  senderName,
  onClose,
}: {
  sessionId: string;
  senderId: string;
  senderName: string;
  onClose: () => void;
}) {
  const chat = useSessionChat({ sessionId, senderId, senderName });
  return (
    <ChatPanel
      connectionState={chat.connectionState}
      messages={chat.messages}
      myId={chat.myId}
      error={chat.error}
      unreadCount={chat.unreadCount}
      firstUnreadId={chat.firstUnreadId}
      maxLength={MAX_CHAT_MESSAGE_LENGTH}
      onSend={chat.send}
      onMarkRead={chat.markRead}
      onClose={onClose}
    />
  );
}
