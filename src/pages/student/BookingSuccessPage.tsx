import { useParams, useSearchParams, Link } from "react-router";
import { CheckCircle2, ArrowRight, Unlock } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function BookingSuccessPage() {
  const { bookingId = "" } = useParams();
  const [params] = useSearchParams();
  const topicId = params.get("topicId");

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-lg text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <h1 className="mb-2 font-display text-2xl font-extrabold text-foreground">Booking confirmed!</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Your session is booked and one credit has been reserved.
        </p>

        <Card className="mb-6 rounded-3xl p-6 text-left">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-100">
              <Unlock size={16} className="text-indigo-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Your questions are unlocked</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                The full discussion questions and vocabulary for this topic are now available to help you prepare.
              </p>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          {topicId && (
            <Button asChild size="lg" className="w-full">
              <Link to={`/student/questions/${topicId}`}>
                View your questions <ArrowRight size={18} />
              </Link>
            </Button>
          )}
          <Button asChild variant="ghost" size="lg" className="w-full">
            <Link to="/student">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
