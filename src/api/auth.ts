import { api, tokenStore } from "./client";
import type { TokenPair, UserProfile } from "./types";

export const authApi = {
  /** Obtain a JWT pair. The backend USERNAME_FIELD is email. */
  async login(email: string, password: string): Promise<TokenPair> {
    const tokens = await api.post<TokenPair>("/auth/token/", { email, password }, { auth: false });
    tokenStore.set(tokens);
    return tokens;
  },

  /** Public registration (student). Does not log in — caller logs in after. */
  register(input: { fullName: string; email: string; password: string }): Promise<UserProfile> {
    return api.post<UserProfile>("/auth/register/", input, { auth: false });
  },

  me(): Promise<UserProfile> {
    return api.get<UserProfile>("/me/");
  },

  updateProfile(fullName: string): Promise<UserProfile> {
    return api.patch<UserProfile>("/me/", { fullName });
  },

  changePassword(currentPassword: string, newPassword: string): Promise<{ changed: boolean }> {
    return api.post("/me/password/", { currentPassword, newPassword });
  },

  requestPasswordReset(email: string): Promise<{ sent: boolean }> {
    return api.post("/auth/password/reset/", { email }, { auth: false });
  },

  confirmPasswordReset(uid: string, token: string, newPassword: string): Promise<{ reset: boolean }> {
    return api.post("/auth/password/reset/confirm/", { uid, token, newPassword }, { auth: false });
  },

  setGoal(goalId: string): Promise<UserProfile> {
    return api.put<UserProfile>("/me/goal/", { goalId });
  },

  logout() {
    tokenStore.clear();
  },
};
