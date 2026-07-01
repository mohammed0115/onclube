import { api } from "./client";
import type {
  AvailabilitySlot,
  BookingDetail,
  BookingListItem,
  BookingResult,
  Cancellation,
  StudentDashboard,
} from "./types";

export const bookingApi = {
  studentDashboard(): Promise<StudentDashboard> {
    return api.get<StudentDashboard>("/student/dashboard/");
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
