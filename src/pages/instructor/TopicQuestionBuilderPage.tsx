import { useState } from "react";
import { Sparkles, Wand2, Plus, X, Check } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms";
import { AIBadge, AISuggestionRow } from "@/components/ai";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

// AI suggestions the instructor can choose to pull in. Nothing is added automatically.
const AI_SUBTOPICS = [
  "Introducing yourself confidently",
  "Talking about strengths and weaknesses",
  "Handling unexpected questions",
];
const AI_QUESTIONS = [
  "Tell me a little about yourself and your background.",
  "What are you most proud of in your career so far?",
  "Describe a challenge you faced and how you solved it.",
  "Why do you want to work with our team?",
];

export function TopicQuestionBuilderPage() {
  const { tx } = useI18n();
  const [acceptedSubtopics, setAcceptedSubtopics] = useState<string[]>([]);
  const [acceptedQuestions, setAcceptedQuestions] = useState<string[]>([]);
  const [generated, setGenerated] = useState(false);

  const accept = (
    text: string,
    list: string[],
    setList: (v: string[]) => void
  ) => {
    if (!list.includes(text)) setList([...list, text]);
  };
  const remove = (text: string, list: string[], setList: (v: string[]) => void) =>
    setList(list.filter((x) => x !== text));

  return (
    <DashboardLayout>
      <PageHeader
        title="Build a topic"
        subtitle="You create the topic. AI suggests subtopics and questions — you decide what to keep."
        back="/instructor"
        action={<Button size="sm">{tx("Publish topic")}</Button>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT — the instructor's own topic */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 font-display font-bold text-foreground">{tx("Topic details")}</h3>
            <div className="space-y-4">
              <Field label={tx("Topic title")} htmlFor="title" defaultValue="Job Interview Practice" />
              <div className="grid grid-cols-2 gap-4">
                <Field label={tx("Category")} htmlFor="cat" defaultValue="Career" />
                <Field label={tx("Level")} htmlFor="level" defaultValue="B1" />
              </div>
              <Field
                label={tx("Short description")}
                htmlFor="desc"
                defaultValue="Rehearse common interview questions and tell your story clearly."
              />
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-1 font-display font-bold text-foreground">{tx("Subtopics")}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{tx("Your accepted subtopics for this topic.")}</p>
            {acceptedSubtopics.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                {tx("Nothing yet — add your own or accept an AI suggestion.")}
              </p>
            ) : (
              <div className="space-y-2">
                {acceptedSubtopics.map((s) => (
                  <div key={s} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-foreground">
                      <Check size={14} className="text-emerald-500" /> {s}
                    </span>
                    <button onClick={() => remove(s, acceptedSubtopics, setAcceptedSubtopics)} className="text-muted-foreground hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="mb-1 font-display font-bold text-foreground">{tx("Discussion questions")}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{tx("Students see these before the session.")}</p>
            {acceptedQuestions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                {tx("Accept AI questions on the right, or write your own.")}
              </p>
            ) : (
              <ol className="space-y-2">
                {acceptedQuestions.map((q, i) => (
                  <li key={q} className="flex items-start justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
                    <span className="flex items-start gap-2 text-foreground">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
                        {i + 1}
                      </span>
                      {q}
                    </span>
                    <button onClick={() => remove(q, acceptedQuestions, setAcceptedQuestions)} className="mt-0.5 text-muted-foreground hover:text-red-500">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <button className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline">
              <Plus size={14} /> {tx("Add your own question")}
            </button>
          </Card>
        </div>

        {/* RIGHT — the AI assistant panel */}
        <div className="space-y-6">
          <Card className={cn("overflow-hidden p-0", "border-purple-100")}>
            <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <Sparkles size={18} />
                <span className="font-semibold">{tx("AI assistant")}</span>
              </div>
              <AIBadge label={tx("Assists, doesn't replace you")} className="bg-white/20 text-white" />
            </div>
            <div className="p-5">
              <p className="mb-4 text-sm text-muted-foreground">
                {tx("Generate subtopic and question ideas from your topic title and level. Review each one and add only what you like.")}
              </p>
              <Button onClick={() => setGenerated(true)} className="w-full">
                <Wand2 size={15} /> {generated ? tx("Regenerate suggestions") : tx("Generate suggestions")}
              </Button>
            </div>
          </Card>

          {generated && (
            <>
              <Card className="p-6">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles size={15} className="text-purple-600" />
                  <h3 className="font-display font-bold text-foreground">{tx("Suggested subtopics")}</h3>
                </div>
                <div className="space-y-2">
                  {AI_SUBTOPICS.map((s) => (
                    <AISuggestionRow
                      key={s}
                      text={s}
                      accepted={acceptedSubtopics.includes(s)}
                      onAccept={() => accept(s, acceptedSubtopics, setAcceptedSubtopics)}
                    />
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles size={15} className="text-purple-600" />
                  <h3 className="font-display font-bold text-foreground">{tx("Suggested questions")}</h3>
                </div>
                <div className="space-y-2">
                  {AI_QUESTIONS.map((q) => (
                    <AISuggestionRow
                      key={q}
                      text={q}
                      accepted={acceptedQuestions.includes(q)}
                      onAccept={() => accept(q, acceptedQuestions, setAcceptedQuestions)}
                    />
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
