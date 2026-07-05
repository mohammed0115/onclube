import { api } from "./client";
import type { SessionDetail, SessionResult, VideoJoin, WaitingRoom } from "./types";

export const sessionsApi = {
  detail(id: string): Promise<SessionDetail> {
    return api.get<SessionDetail>(`/sessions/${id}/`);
  },

  /** Pre-join waiting room: session info, join window, viewer eligibility. */
  waitingRoom(id: string): Promise<WaitingRoom> {
    return api.get<WaitingRoom>(`/sessions/${id}/waiting-room/`);
  },

  /** Server-minted Agora join credential (provider stub for now). */
  join(id: string): Promise<VideoJoin> {
    return api.post<VideoJoin>(`/sessions/${id}/join/`);
  },

  /** Leave the room. No presence tracked — authorization check only. */
  leave(id: string): Promise<SessionResult> {
    return api.post<SessionResult>(`/sessions/${id}/leave/`);
  },

  start(id: string): Promise<SessionResult> {
    return api.post<SessionResult>(`/sessions/${id}/start/`);
  },

  end(id: string): Promise<SessionResult> {
    return api.post<SessionResult>(`/sessions/${id}/end/`);
  },

  saveNotes(id: string, content: unknown[]): Promise<{ transcriptId: string; sessionId: string; source: string }> {
    return api.post(`/sessions/${id}/transcript/`, { content });
  },
};
