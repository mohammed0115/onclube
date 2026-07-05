import { api } from "./client";
import type {
  AvailabilitySlot,
  BookingDetail,
  BookingListItem,
  BookingResult,
  Cancellation,
  StudentDashboard,
  WeeklyCalendar,
} from "./types";

export const bookingApi = {
  studentDashboard(): Promise<StudentDashboard> {
    return api.get<StudentDashboard>("/student/dashboard/");
  },

  /** Weekly (Mon–Sun) calendar of a topic's instructor slots. */
  calendar(topicId: string, weekStart?: string): Promise<WeeklyCalendar> {
    const q = new URLSearchParams({ topicId });
    if (weekStart) q.set("weekStart", weekStart);
    return api.get<WeeklyCalendar>(`/student/calendar/?${q.toString()}`);
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
};
