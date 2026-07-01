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

  setGoal(goalId: string): Promise<UserProfile> {
    return api.put<UserProfile>("/me/goal/", { goalId });
  },

  logout() {
    tokenStore.clear();
  },
};
