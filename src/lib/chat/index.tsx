// Chat infrastructure barrel + dependency injection.
//
// The UI resolves its transport from context, so tests (and a future real
// adapter) inject a different factory without touching pages or hooks.
import { createContext, useContext } from "react";
import type { ChatTransportFactory } from "./types";
import { createStubChatTransport } from "./stubTransport";

export * from "./types";
export * from "./validation";
export { StubChatTransport, createStubChatTransport } from "./stubTransport";

/**
 * Transport factory injection point. Defaults to the stub; the app wraps the
 * real adapter here later, and tests wrap a controllable fake. A factory (not an
 * instance) so each chat session gets its own transport.
 */
export const ChatTransportContext = createContext<ChatTransportFactory>(createStubChatTransport);

export const useChatTransportFactory = (): ChatTransportFactory => useContext(ChatTransportContext);
