// Participant-signal lifecycle hook — the single home for raise-hand / reaction
// business logic. Owns connect/disconnect, idempotent raise/lower, one-reaction-
// at-a-time with auto-expiry, floating-reaction stream, late-join seeding, and
// reconnect. The UI is pure presentation and only consumes this hook.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParticipantSignalProviderFactory } from "@/lib/signals";
import type {
  FloatingReaction,
  ParticipantSignalEvents,
  ParticipantSignalProvider,
  ParticipantState,
  Reaction,
  SignalConnectionState,
  SignalError as SignalErrorType,
} from "@/lib/signals";
import { REACTION_TTL_MS, SignalError } from "@/lib/signals";

export interface UseParticipantSignalsArgs {
  sessionId: string;
  participantId: string;
  participantName: string;
}

export interface ParticipantSignalsController {
  connectionState: SignalConnectionState;
  participants: ParticipantState[];
  myId: string;
  handRaised: boolean;
  myReaction: Reaction | null;
  floating: FloatingReaction[];
  error: SignalErrorType | null;
  raiseHand: () => void;
  lowerHand: () => void;
  toggleHand: () => void;
  sendReaction: (reaction: Reaction) => void;
  clearReaction: () => void;
  retry: () => void;
}

let floatSeq = 0;

export function useParticipantSignals({
  sessionId,
  participantId,
  participantName,
}: UseParticipantSignalsArgs): ParticipantSignalsController {
  const factory = useParticipantSignalProviderFactory();
  const providerRef = useRef<ParticipantSignalProvider | null>(null);

  const [connectionState, setConnectionState] = useState<SignalConnectionState>("connecting");
  const [participants, setParticipants] = useState<ParticipantState[]>([]);
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const [error, setError] = useState<SignalErrorType | null>(null);
  const [attempt, setAttempt] = useState(0);

  const identity = useRef({ participantId, participantName });
  identity.current = { participantId, participantName };
  // Synchronous mirror of local hand state so raise/lower are idempotent even
  // across rapid calls within a single render tick.
  const handRef = useRef(false);
  const floatTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const upsert = useCallback((patch: ParticipantState) => {
    setParticipants((prev) => {
      const rest = prev.filter((p) => p.participantId !== patch.participantId);
      return [...rest, patch];
    });
  }, []);

  const patchParticipant = useCallback((id: string, fn: (s: ParticipantState) => ParticipantState) => {
    setParticipants((prev) => prev.map((p) => (p.participantId === id ? fn(p) : p)));
  }, []);

  const pushFloating = useCallback((f: FloatingReaction) => {
    setFloating((prev) => [...prev, f]);
    const t = setTimeout(() => {
      setFloating((prev) => prev.filter((x) => x.key !== f.key));
      floatTimers.current.delete(t);
    }, REACTION_TTL_MS);
    floatTimers.current.add(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const provider = factory();
    providerRef.current = provider;
    setError(null);
    setConnectionState("connecting");
    setParticipants([]);
    handRef.current = false;

    const events: ParticipantSignalEvents = {
      onConnectionState: (s) => !cancelled && setConnectionState(s),
      onHandRaised: ({ participantId: id, participantName: name }) => {
        if (cancelled) return;
        if (id === identity.current.participantId) handRef.current = true;
        setParticipants((prev) => {
          const existing = prev.find((p) => p.participantId === id);
          const next: ParticipantState = existing
            ? { ...existing, handRaised: true }
            : { participantId: id, participantName: name, handRaised: true, reaction: null, reactionTimestamp: null };
          return [...prev.filter((p) => p.participantId !== id), next];
        });
      },
      onHandLowered: ({ participantId: id }) => {
        if (cancelled) return;
        if (id === identity.current.participantId) handRef.current = false;
        patchParticipant(id, (s) => ({ ...s, handRaised: false }));
      },
      onReactionReceived: ({ participantId: id, participantName: name, reaction, timestamp }) => {
        if (cancelled) return;
        setParticipants((prev) => {
          const existing = prev.find((p) => p.participantId === id);
          const next: ParticipantState = existing
            ? { ...existing, reaction, reactionTimestamp: timestamp }
            : { participantId: id, participantName: name, handRaised: false, reaction, reactionTimestamp: timestamp };
          return [...prev.filter((p) => p.participantId !== id), next];
        });
        pushFloating({ key: `r-${++floatSeq}`, participantName: name, reaction });
      },
      onReactionExpired: ({ participantId: id }) =>
        !cancelled && patchParticipant(id, (s) => ({ ...s, reaction: null, reactionTimestamp: null })),
      onParticipantStateUpdated: (s) => !cancelled && upsert(s),
    };

    provider
      .connect({ sessionId, identity: identity.current, events })
      .then(() => {
        if (cancelled) return;
        // Late join: seed from the transport's current participant states.
        const seed = provider.listParticipantStates();
        setParticipants(seed);
        const me = seed.find((p) => p.participantId === identity.current.participantId);
        handRef.current = me?.handRaised ?? false;
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof SignalError ? e : new SignalError("provider_unavailable"));
        setConnectionState("failed");
      });

    const timers = floatTimers.current;
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      timers.clear();
      void provider.disconnect(); // leaving/ending clears this participant's state
      providerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factory, sessionId, participantId, attempt]);

  const guard = useCallback((fn: () => void) => {
    try {
      fn();
    } catch {
      setError(new SignalError("signal_failed"));
    }
  }, []);

  const raiseHand = useCallback(() => {
    if (handRef.current) return; // idempotent — no duplicate signal
    handRef.current = true;
    patchParticipant(identity.current.participantId, (s) => ({ ...s, handRaised: true }));
    guard(() => providerRef.current?.raiseHand());
  }, [guard, patchParticipant]);

  const lowerHand = useCallback(() => {
    if (!handRef.current) return; // idempotent
    handRef.current = false;
    patchParticipant(identity.current.participantId, (s) => ({ ...s, handRaised: false }));
    guard(() => providerRef.current?.lowerHand());
  }, [guard, patchParticipant]);

  const toggleHand = useCallback(() => {
    if (handRef.current) lowerHand();
    else raiseHand();
  }, [lowerHand, raiseHand]);

  const sendReaction = useCallback((reaction: Reaction) => {
    // One active reaction at a time — a new one replaces the previous.
    patchParticipant(identity.current.participantId, (s) => ({ ...s, reaction, reactionTimestamp: new Date().toISOString() }));
    guard(() => providerRef.current?.sendReaction(reaction));
  }, [guard, patchParticipant]);

  const clearReaction = useCallback(() => {
    patchParticipant(identity.current.participantId, (s) => ({ ...s, reaction: null, reactionTimestamp: null }));
    guard(() => providerRef.current?.clearReaction());
  }, [guard, patchParticipant]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const me = participants.find((p) => p.participantId === participantId);

  return useMemo(
    () => ({
      connectionState,
      participants,
      myId: participantId,
      handRaised: me?.handRaised ?? false,
      myReaction: me?.reaction ?? null,
      floating,
      error,
      raiseHand,
      lowerHand,
      toggleHand,
      sendReaction,
      clearReaction,
      retry,
    }),
    [connectionState, participants, participantId, me?.handRaised, me?.reaction, floating, error, raiseHand, lowerHand, toggleHand, sendReaction, clearReaction, retry]
  );
}
