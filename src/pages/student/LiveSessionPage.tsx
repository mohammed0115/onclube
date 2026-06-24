import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { Sparkles, Clock } from "lucide-react";
import { VideoTile, SessionControls } from "@/components/session";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Logo } from "@/components/navigation/Logo";
import { bookings, topics, instructors, currentStudent } from "@/data/mockData";

export function LiveSessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const booking = bookings.find((b) => b.id === id) ?? bookings[0];
  const topic = topics.find((t) => t.id === booking.topicId) ?? topics[0];
  const instructor = instructors.find((i) => i.id === booking.instructorId) ?? instructors[0];

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const end = () => navigate(`/student/report/${booking.reportId ?? "r1"}`);

  return (
    <div className="flex h-screen flex-col bg-[#0A0A1A] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <Logo light />
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Live · {topic.title}
        </div>
        <div className="flex items-center gap-2 text-sm text-indigo-200">
          <Clock size={14} /> 12:30
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row">
        <div className="grid min-h-0 flex-1 grid-rows-2 gap-4">
          <VideoTile
            initials={instructor.initials}
            name={instructor.name}
            sub={instructor.headline}
            accent={instructor.accent}
            speaking
          />
          <VideoTile
            initials={currentStudent.initials}
            name={`${currentStudent.name} (You)`}
            sub={currentStudent.level}
            accent="from-indigo-500 to-purple-600"
            self
            muted={!micOn}
          />
        </div>

        <aside className="flex w-full flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl lg:w-80">
          <Tabs defaultValue="questions" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="border-white/10 px-2">
              <TabsTrigger value="questions" className="text-indigo-200 data-[state=active]:border-indigo-400 data-[state=active]:text-white">
                Questions
              </TabsTrigger>
              <TabsTrigger value="vocab" className="text-indigo-200 data-[state=active]:border-indigo-400 data-[state=active]:text-white">
                Vocabulary
              </TabsTrigger>
              <TabsTrigger value="notes" className="text-indigo-200 data-[state=active]:border-indigo-400 data-[state=active]:text-white">
                Notes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="questions" className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
              {topic.questions.map((q, i) => (
                <div key={q.id} className="flex items-start gap-2.5 rounded-xl bg-white/5 p-3 text-sm">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/30 text-xs font-bold text-indigo-200">
                    {i + 1}
                  </span>
                  <span className="text-indigo-50">{q.text}</span>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="vocab" className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="flex flex-wrap gap-2">
                {topic.vocabulary.map((w) => (
                  <span key={w} className="rounded-full bg-purple-500/20 px-3 py-1 text-sm text-purple-100">
                    {w}
                  </span>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="notes" className="min-h-0 flex-1 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-purple-200">
                <Sparkles size={12} /> AI is listening to generate your report after the session.
              </div>
              <textarea
                placeholder="Jot down a word or phrase to remember…"
                className="h-40 w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none placeholder:text-indigo-300/60"
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <footer className="flex items-center justify-center border-t border-white/10 py-4">
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
