import { api } from "./client";
import type { NotificationItem } from "./types";

export const notificationsApi = {
  list(): Promise<NotificationItem[]> {
    return api.get<NotificationItem[]>("/notifications/");
  },

  markRead(id: string): Promise<NotificationItem> {
    return api.post<NotificationItem>(`/notifications/${id}/read/`);
  },
};
