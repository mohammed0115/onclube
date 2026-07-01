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
    <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 ring-1 ring-white/5">
      <div className="text-center">
        <div className={cn("mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br text-3xl font-bold text-white shadow-lg", accent)}>
          {initials}
        </div>
        <div className="font-semibold text-white">{name}</div>
        <div className="text-sm text-slate-300">{sub}</div>
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
  const neutral = "bg-slate-100 text-slate-700 hover:bg-slate-200";
  return (
    <div className="flex items-center gap-3">
      <button onClick={onToggleMic} className={cn(base, micOn ? neutral : "bg-red-500 text-white")}>
        {micOn ? <Mic size={18} /> : <MicOff size={18} />}
      </button>
      <button onClick={onToggleCam} className={cn(base, camOn ? neutral : "bg-red-500 text-white")}>
        {camOn ? <Camera size={18} /> : <CameraOff size={18} />}
      </button>
      <button className={cn(base, neutral)}>
        <ScreenShare size={18} />
      </button>
      <button className={cn(base, neutral)}>
        <MessageSquare size={18} />
      </button>
      <button onClick={onEnd} className={cn(base, "bg-red-500 text-white hover:bg-red-600")}>
        <PhoneOff size={18} />
      </button>
    </div>
  );
}
