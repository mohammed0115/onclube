import { Link } from "react-router";
import { Users, ArrowRight } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading, EmptyState } from "@/components/states";
import { useInstructorStudents } from "@/hooks";
import { useI18n } from "@/i18n";

export function InstructorStudentsPage() {
  const { data, isLoading } = useInstructorStudents();
  const { tx } = useI18n();
  const students = data ?? [];

  return (
    <DashboardLayout>
      <PageHeader title="My students" subtitle="Everyone you've taught — tap a student to prep." />
      <div className="mx-auto max-w-3xl">
        {isLoading ? (
          <Loading label="Loading students…" />
        ) : students.length === 0 ? (
          <EmptyState icon={<Users size={26} className="text-muted-foreground" />} title="No students yet" description="Students who book with you will appear here." />
        ) : (
          <div className="space-y-3">
            {students.map((s) => (
              <Link key={s.id} to={`/instructor/students/${s.id}`}>
                <Card className="flex items-center justify-between p-4 transition-all hover:border-indigo-200 hover:shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white">
                      {s.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{s.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.completed}/{s.sessions} {tx("sessions")}{s.lastScore != null ? ` · last score ${s.lastScore}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.level && <Badge tone="purple">{s.level}</Badge>}
                    <ArrowRight size={16} className="text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
