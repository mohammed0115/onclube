import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { Sparkles, Clock } from "lucide-react";
import { VideoTile, SessionControls } from "@/components/session";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Logo } from "@/components/navigation/Logo";
import { useAuth } from "@/auth/AuthProvider";
import { useSession, useJoinSession, useEndSession } from "@/hooks";
import { Loading, ErrorState } from "@/components/states";
import { stubVideoProvider } from "@/lib/video";

function initialsOf(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export function LiveSessionPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const sessionQuery = useSession(id);
  const join = useJoinSession();
  const endSession = useEndSession();

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const joinedRef = useRef(false);

  // Obtain the server-minted credential once and hand it to the video adapter.
  useEffect(() => {
    if (!id || joinedRef.current || !sessionQuery.data) return;
    joinedRef.current = true;
    join.mutate(id, { onSuccess: (cred) => void stubVideoProvider.connect(cred) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sessionQuery.data]);

  if (sessionQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-2">
        <Loading label="Connecting to your session…" />
      </div>
    );
  }
  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-2 p-8">
        <div className="w-full max-w-md">
          <ErrorState error={sessionQuery.error} onRetry={() => sessionQuery.refetch()} title="Couldn’t open this session" />
        </div>
      </div>
    );
  }

  const s = sessionQuery.data;
  const studentName = user?.fullName ?? "You";

  async function end() {
    try {
      await endSession.mutateAsync(id);
    } catch {
      /* even if the end call fails, leave the room */
    }
    navigate("/student");
  }

  return (
    <div className="flex h-screen flex-col bg-surface-2 text-foreground">
      <header className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
        <Logo />
        <div className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Live · {s.topicTitle}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock size={14} /> {s.status}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row">
        <div className="grid min-h-0 flex-1 grid-rows-2 gap-4">
          <VideoTile initials="IN" name="Instructor" sub={s.topicTitle} accent="from-amber-400 to-orange-500" speaking />
          <VideoTile
            initials={initialsOf(studentName)}
            name={`${studentName} (You)`}
            sub={user?.level ?? ""}
            accent="from-blue-500 to-blue-600"
            self
            muted={!micOn}
          />
        </div>

        <aside className="flex w-full flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:w-80">
          <Tabs defaultValue="questions" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="px-2">
              <TabsTrigger value="questions">Questions</TabsTrigger>
              <TabsTrigger value="vocab">Vocabulary</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="questions" className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
              {s.questions.map((q, i) => (
                <div key={q.id} className="flex items-start gap-2.5 rounded-xl bg-surface p-3 text-sm">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    {i + 1}
                  </span>
                  <span className="text-foreground">{q.text}</span>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="vocab" className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="flex flex-wrap gap-2">
                {s.vocabulary.map((w) => (
                  <span key={w} className="rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700">
                    {w}
                  </span>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="notes" className="min-h-0 flex-1 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-purple-600">
                <Sparkles size={12} /> AI is listening to generate your report after the session.
              </div>
              <textarea
                placeholder="Jot down a word or phrase to remember…"
                defaultValue={s.studentNotes ?? ""}
                className="h-40 w-full resize-none rounded-xl border border-border bg-input-background p-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <footer className="flex items-center justify-center border-t border-border bg-card py-4">
        <SessionControls
          micOn={micOn}
          camOn={camOn}
          onToggleMic={() => setMicOn((v) => !v)}
          onToggleCam={() => setCamOn((v) => !v)}
          onEnd={end}
        />
      </footer>
    </div>
  );
}
