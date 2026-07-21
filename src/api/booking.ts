import { api, tokenStore } from "./client";
import type {
  AvailabilitySlot,
  BookingDetail,
  BookingListItem,
  BookingResult,
  Cancellation,
  GroupSession,
  InstructorWindows,
  ScheduleGenerationSummary,
  SchedulePickInput,
  SetScheduleResult,
  AITutorSession,
  AITutorStatus,
  StudentDashboard,
  StudentPlan,
  StudentProgress,
  StudentSchedule,
  WeeklyCalendar,
} from "./types";

export const bookingApi = {
  studentDashboard(): Promise<StudentDashboard> {
    return api.get<StudentDashboard>("/student/dashboard/");
  },

  /** Session-over-session progress (overall + per-skill, with deltas + series). */
  progress(): Promise<StudentProgress> {
    return api.get<StudentProgress>("/student/progress/");
  },

  /** Personal learning plan, regenerated from the latest report. */
  plan(): Promise<StudentPlan> {
    return api.get<StudentPlan>("/student/plan/");
  },

  // ── AI tutor ──
  aiTutorStatus(): Promise<AITutorStatus> {
    return api.get<AITutorStatus>("/student/ai-tutor/status/");
  },
  aiTutorStart(topic: string): Promise<AITutorSession> {
    return api.post<AITutorSession>("/student/ai-tutor/start/", { topic });
  },
  aiTutorMessage(sessionId: string, text: string): Promise<AITutorSession> {
    return api.post<AITutorSession>(`/student/ai-tutor/${sessionId}/message/`, { text });
  },
  aiTutorEnd(sessionId: string): Promise<AITutorSession> {
    return api.post<AITutorSession>(`/student/ai-tutor/${sessionId}/end/`, {});
  },

  // ── AI tutor — live realtime voice call (OpenAI Realtime over WebRTC) ──
  /** Mint a short-lived ephemeral token for a browser↔OpenAI WebRTC voice call. */
  realtimeSession(voice?: string): Promise<{
    clientSecret: string; sessionId: string; model: string; voice: string;
    expiresAt: number | null; maxSeconds: number;
  }> {
    return api.post("/student/ai-tutor/realtime-session/", { voice });
  },
  /** Relay the browser's SDP offer to OpenAI; returns the SDP answer (text). */
  async realtimeSdp(sdp: string, clientSecret: string): Promise<string> {
    const access = tokenStore.access();
    const res = await fetch("/api/v1/student/ai-tutor/realtime-sdp/", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(access ? { Authorization: `Bearer ${access}` } : {}) },
      body: JSON.stringify({ clientSecret, sdp }),
    });
    if (!res.ok) throw new Error(`sdp_relay_${res.status}`);
    return res.text();
  },

  /** Weekly (Mon–Sun) calendar of a topic's instructor slots. */
  calendar(topicId: string, weekStart?: string): Promise<WeeklyCalendar> {
    const q = new URLSearchParams({ topicId });
    if (weekStart) q.set("weekStart", weekStart);
    return api.get<WeeklyCalendar>(`/student/calendar/?${q.toString()}`);
  },

  /** The student's recurring weekly schedule + upcoming materialised bookings. */
  schedule(): Promise<StudentSchedule> {
    return api.get<StudentSchedule>("/student/schedule/");
  },

  /** Replace the weekly schedule and (re)generate upcoming bookings. */
  setSchedule(picks: SchedulePickInput[]): Promise<SetScheduleResult> {
    return api.put<SetScheduleResult>("/student/schedule/", { picks });
  },

  /** Re-run booking generation from the existing schedule (idempotent). */
  generateSchedule(): Promise<ScheduleGenerationSummary> {
    return api.post<ScheduleGenerationSummary>("/student/schedule/generate/", {});
  },

  /** The instructor availability windows a student may pick within (by topic). */
  scheduleWindows(topicId: string): Promise<InstructorWindows> {
    return api.get<InstructorWindows>(`/student/schedule/windows/?topicId=${encodeURIComponent(topicId)}`);
  },

  myBookings(): Promise<BookingListItem[]> {
    return api.get<BookingListItem[]>("/student/bookings/");
  },

  booking(id: string): Promise<BookingDetail> {
    return api.get<BookingDetail>(`/student/bookings/${id}/`);
  },

  openSlots(instructorId: string): Promise<AvailabilitySlot[]> {
    return api.get<AvailabilitySlot[]>(`/instructors/${instructorId}/availability/`);
  },

  create(input: { topicId: string; slotId: string }): Promise<BookingResult> {
    return api.post<BookingResult>("/student/bookings/", input);
  },

  cancel(id: string): Promise<Cancellation> {
    return api.del<Cancellation>(`/student/bookings/${id}/`);
  },

  rateSession(bookingId: string, stars: number, comment: string): Promise<{ bookingId: string; stars: number; comment: string }> {
    return api.post(`/student/bookings/${bookingId}/rating/`, { stars, comment });
  },

  communitySessions(): Promise<GroupSession[]> {
    return api.get<GroupSession[]>("/student/community/");
  },

  joinGroupSession(id: string): Promise<{ groupSessionId: string; joined: boolean }> {
    return api.post(`/student/community/${id}/join/`, {});
  },

  leaveGroupSession(id: string): Promise<{ groupSessionId: string; joined: boolean }> {
    return api.del(`/student/community/${id}/join/`);
  },
};
