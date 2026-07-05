import { useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router";
import { ArrowRight, CalendarClock, Coins, User } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loading, ErrorState } from "@/components/states";
import { useStudentTopic, useCreateBooking } from "@/hooks";
import { ApiError } from "@/api";

function messageForBookingError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "slot_unavailable":
        return "That time was just taken. Please pick another slot.";
      case "no_sessions_remaining":
        return "You have no session credits left. Top up to book.";
      case "subscription_expired":
        return "Your subscription has expired. Renew to book.";
      case "no_active_subscription":
        return "You need an active subscription to book.";
      default:
        return typeof err.detail === "string" ? err.detail : err.message;
    }
  }
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "your selected time";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function BookingSummaryPage() {
  const { topicId = "", slotId = "" } = useParams();
  const [params] = useSearchParams();
  const startAt = params.get("at");
  const navigate = useNavigate();
  const topicQuery = useStudentTopic(topicId);
  const createBooking = useCreateBooking();
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setError(null);
    try {
      const booking = await createBooking.mutateAsync({ topicId, slotId });
      navigate(`/student/book/success/${booking.bookingId}?topicId=${topicId}`);
    } catch (e) {
      setError(messageForBookingError(e));
    }
  };

  if (topicQuery.isLoading)
    return (
      <DashboardLayout>
        <Loading label="Loading your booking…" />
      </DashboardLayout>
    );
  if (topicQuery.isError)
    return (
      <DashboardLayout>
        <ErrorState error={topicQuery.error} onRetry={() => topicQuery.refetch()} />
      </DashboardLayout>
    );

  const topic = topicQuery.data!;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-lg">
        <h1 className="mb-1 font-display text-2xl font-extrabold text-foreground">Review your booking</h1>
        <p className="mb-5 text-sm text-muted-foreground">Confirm the details before you book.</p>

        <Card className="mb-5 rounded-3xl p-6">
          <h2 className="mb-4 font-display text-lg font-bold text-foreground">{topic.title}</h2>
          <Row icon={<User size={16} className="text-indigo-600" />} label="Instructor" value={topic.instructorName} />
          <Row icon={<CalendarClock size={16} className="text-indigo-600" />} label="Time" value={fmtDateTime(startAt)} />
          <Row icon={<Coins size={16} className="text-indigo-600" />} label="Cost" value="1 session credit" />
        </Card>

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50/60 px-4 py-3 text-sm text-red-700">
            {error}
            {createBooking.error instanceof ApiError && createBooking.error.code === "slot_unavailable" && (
              <div className="mt-2">
                <Link to={`/student/book/${topicId}`} className="font-semibold underline">
                  Back to calendar
                </Link>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <Button asChild variant="ghost" size="lg" className="flex-1">
            <Link to={`/student/book/${topicId}`}>Back</Link>
          </Button>
          <Button size="lg" className="flex-1" onClick={confirm} disabled={createBooking.isPending}>
            {createBooking.isPending ? "Confirming…" : "Confirm booking"} <ArrowRight size={18} />
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50">{icon}</div>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="font-semibold text-foreground">{value}</div>
      </div>
    </div>
  );
}
