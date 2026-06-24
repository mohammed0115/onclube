import { Mic, MicOff, Camera, CameraOff, ScreenShare, MessageSquare, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function VideoTile({
  initials,
  name,
  sub,
  accent,
  speaking,
  self,
  muted,
}: {
  initials: string;
  name: string;
  sub: string;
  accent: string;
  speaking?: boolean;
  self?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#111135] to-[#1d0a45]">
      <div className="text-center">
        <div className={cn("mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br text-3xl font-bold text-white", accent)}>
          {initials}
        </div>
        <div className="font-semibold text-white">{name}</div>
        <div className="text-sm text-indigo-300">{sub}</div>
      </div>
      {speaking && (
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5">
          <Mic size={11} className="text-emerald-400" />
          <span className="text-xs font-medium text-white">Speaking</span>
        </div>
      )}
      {self && <div className="absolute left-3 top-3 text-xs text-white/50">You</div>}
      {muted && (
        <div className="absolute right-3 top-3 rounded-full bg-red-500/90 p-1.5">
          <MicOff size={12} className="text-white" />
        </div>
      )}
    </div>
  );
}

export function SessionControls({
  micOn,
  camOn,
  onToggleMic,
  onToggleCam,
  onEnd,
}: {
  micOn: boolean;
  camOn: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onEnd: () => void;
}) {
  const base = "flex h-12 w-12 items-center justify-center rounded-full transition-all";
  return (
    <div className="flex items-center gap-3">
      <button onClick={onToggleMic} className={cn(base, micOn ? "bg-white/15 hover:bg-white/25" : "bg-red-500")}>
        {micOn ? <Mic size={18} className="text-white" /> : <MicOff size={18} className="text-white" />}
      </button>
      <button onClick={onToggleCam} className={cn(base, camOn ? "bg-white/15 hover:bg-white/25" : "bg-red-500")}>
        {camOn ? <Camera size={18} className="text-white" /> : <CameraOff size={18} className="text-white" />}
      </button>
      <button className={cn(base, "bg-white/15 hover:bg-white/25")}>
        <ScreenShare size={18} className="text-white" />
      </button>
      <button className={cn(base, "bg-white/15 hover:bg-white/25")}>
        <MessageSquare size={18} className="text-white" />
      </button>
      <button onClick={onEnd} className={cn(base, "bg-red-500 hover:bg-red-600")}>
        <PhoneOff size={18} className="text-white" />
      </button>
    </div>
  );
}
