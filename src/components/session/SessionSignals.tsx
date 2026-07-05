// Signals container — wires the useParticipantSignals hook to the pure
// presentation pieces (badges, floating reactions, controls). This is the only
// place the hook meets the UI; every child stays presentation-only. Rendered as
// an overlay inside the live room's main area.
import { useParticipantSignals } from "@/hooks";
import { FloatingReactions } from "./FloatingReactions";
import { ParticipantSignalBadges } from "./ParticipantSignalBadges";
import { ReactionControls } from "./ReactionControls";

export function SessionSignals({
  sessionId,
  participantId,
  participantName,
}: {
  sessionId: string;
  participantId: string;
  participantName: string;
}) {
  const signals = useParticipantSignals({ sessionId, participantId, participantName });

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <ParticipantSignalBadges participants={signals.participants} myId={signals.myId} />
      <FloatingReactions floating={signals.floating} />
      <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center">
        <ReactionControls
          connectionState={signals.connectionState}
          handRaised={signals.handRaised}
          onToggleHand={signals.toggleHand}
          onSendReaction={signals.sendReaction}
        />
      </div>
    </div>
  );
}
