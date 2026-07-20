import { useState } from "react";
import { useNavigate } from "react-router";
import { Sparkles, Wand2, Plus, X, Check } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms";
import { AIBadge, AISuggestionRow } from "@/components/ai";
import {
  useCreateTopic,
  useSuggestSubtopics,
  useSuggestQuestions,
  useApproveTopicQuestion,
  useAddTopicQuestion,
  usePublishTopic,
} from "@/hooks";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

type SuggestedQuestion = { id: string; text: string };

export function TopicQuestionBuilderPage() {
  const { tx } = useI18n();
  const navigate = useNavigate();

  // Topic form (controlled).
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Career");
  const [level, setLevel] = useState("B1");
  const [description, setDescription] = useState("");

  // Draft topic + AI results.
  const [topicId, setTopicId] = useState<string | null>(null);
  const [suggestedSubtopics, setSuggestedSubtopics] = useState<string[]>([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState<SuggestedQuestion[]>([]);
  const [acceptedSubtopics, setAcceptedSubtopics] = useState<string[]>([]);
  const [acceptedQuestions, setAcceptedQuestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createTopic = useCreateTopic();
  const suggestSubs = useSuggestSubtopics();
  const suggestQs = useSuggestQuestions();
  const approveQ = useApproveTopicQuestion();
  const addQ = useAddTopicQuestion();
  const publish = usePublishTopic();

  const generating = createTopic.isPending || suggestSubs.isPending || suggestQs.isPending;

  /** Create the draft topic once (returns its id), so AI + questions have a target. */
  async function ensureDraft(): Promise<string | null> {
    if (topicId) return topicId;
    if (!title.trim()) {
      setError(tx("Please enter a topic title first."));
      return null;
    }
    const t = await createTopic.mutateAsync({
      title: title.trim(),
      category: category.trim() || "General",
      level: level.trim() || "B1",
      description: description.trim() || undefined,
    });
    setTopicId(t.id);
    return t.id;
  }

  async function onGenerate() {
    setError(null);
    try {
      const id = await ensureDraft();
      if (!id) return;
      const [subs, qs] = await Promise.all([suggestSubs.mutateAsync(id), suggestQs.mutateAsync(id)]);
      setSuggestedSubtopics(subs.items);
      // suggest-questions persists drafts; pair each item with its created id so
      // "accept" approves that exact question.
      setSuggestedQuestions(qs.items.map((text, i) => ({ text, id: qs.createdIds[i] })));
    } catch {
      setError(tx("Could not generate suggestions. Please try again."));
    }
  }

  const acceptSubtopic = (s: string) =>
    setAcceptedSubtopics((cur) => (cur.includes(s) ? cur : [...cur, s]));

  async function acceptQuestion(q: SuggestedQuestion) {
    if (acceptedQuestions.includes(q.text)) return;
    setError(null);
    try {
      if (q.id && topicId) await approveQ.mutateAsync({ topicId, questionId: q.id });
      setAcceptedQuestions((cur) => [...cur, q.text]);
    } catch {
      setError(tx("Could not accept that question. Please try again."));
    }
  }

  async function addOwnQuestion() {
    const text = window.prompt(tx("Write your discussion question:"))?.trim();
    if (!text) return;
    setError(null);
    try {
      const id = await ensureDraft();
      if (!id) return;
      await addQ.mutateAsync({ topicId: id, text });
      setAcceptedQuestions((cur) => [...cur, text]);
    } catch {
      setError(tx("Could not add your question. Please try again."));
    }
  }

  async function onPublish() {
    setError(null);
    const id = await ensureDraft();
    if (!id) return;
    if (acceptedQuestions.length === 0) {
      setError(tx("Add at least one discussion question before publishing."));
      return;
    }
    try {
      await publish.mutateAsync(id);
      navigate("/instructor");
    } catch {
      setError(tx("Could not publish the topic. Please try again."));
    }
  }

  const generated = suggestedSubtopics.length > 0 || suggestedQuestions.length > 0;

  return (
    <DashboardLayout>
      <PageHeader
        title="Build a topic"
        subtitle="You create the topic. AI suggests subtopics and questions — you decide what to keep."
        back="/instructor"
        action={
          <Button size="sm" onClick={onPublish} disabled={publish.isPending}>
            {publish.isPending ? tx("Publishing…") : tx("Publish topic")}
          </Button>
        }
      />

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT — the instructor's own topic */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 font-display font-bold text-foreground">{tx("Topic details")}</h3>
            <div className="space-y-4">
              <Field label={tx("Topic title")} htmlFor="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tx("e.g. Job Interview Practice")} />
              <div className="grid grid-cols-2 gap-4">
                <Field label={tx("Category")} htmlFor="cat" value={category} onChange={(e) => setCategory(e.target.value)} />
                <Field label={tx("Level")} htmlFor="level" value={level} onChange={(e) => setLevel(e.target.value)} />
              </div>
              <Field label={tx("Short description")} htmlFor="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={tx("What will students practise?")} />
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
                    <button onClick={() => setAcceptedSubtopics((c) => c.filter((x) => x !== s))} className="text-muted-foreground hover:text-red-500">
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
                    <button onClick={() => setAcceptedQuestions((c) => c.filter((x) => x !== q))} className="mt-0.5 text-muted-foreground hover:text-red-500">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <button onClick={addOwnQuestion} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline">
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
              <Button onClick={onGenerate} disabled={generating} className="w-full">
                <Wand2 size={15} /> {generating ? tx("Generating…") : generated ? tx("Regenerate suggestions") : tx("Generate suggestions")}
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
                  {suggestedSubtopics.map((s) => (
                    <AISuggestionRow key={s} text={s} accepted={acceptedSubtopics.includes(s)} onAccept={() => acceptSubtopic(s)} />
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles size={15} className="text-purple-600" />
                  <h3 className="font-display font-bold text-foreground">{tx("Suggested questions")}</h3>
                </div>
                <div className="space-y-2">
                  {suggestedQuestions.map((q) => (
                    <AISuggestionRow key={q.id ?? q.text} text={q.text} accepted={acceptedQuestions.includes(q.text)} onAccept={() => acceptQuestion(q)} />
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
