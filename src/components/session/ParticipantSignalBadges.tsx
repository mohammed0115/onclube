import { Hand } from "lucide-react";
import type { ParticipantState } from "@/lib/signals";

// Pure: badge strip for participants with an ACTIVE signal (raised hand or a
// live reaction). The raised-hand indicator sits beside the participant name.
export function ParticipantSignalBadges({ participants, myId }: { participants: ParticipantState[]; myId: string }) {
  const active = participants.filter((p) => p.handRaised || p.reaction);
  if (active.length === 0) return null;
  return (
    <ul className="pointer-events-none absolute right-4 top-4 z-20 flex max-w-[60%] flex-col items-end gap-1.5" aria-label="Participant signals">
      {active.map((p) => (
        <li
          key={p.participantId}
          className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur"
        >
          {p.handRaised && <Hand size={13} className="text-amber-300" aria-label="Hand raised" />}
          <span className="font-medium">
            {p.participantName}
            {p.participantId === myId ? " (You)" : ""}
          </span>
          {p.reaction && <span className="text-base leading-none">{p.reaction}</span>}
        </li>
      ))}
    </ul>
  );
}
