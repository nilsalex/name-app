// Lightweight identification for exactly two users (data-model.md "User").
// No accounts, no server-side records: on first visit the user picks who
// they are; the choice is persisted in browser local storage (research.md R4).
// Server Components must not import this module — it touches browser APIs.

export type UserId = "A" | "B";

const STORAGE_KEY = "namewahl-user";

export const USER_IDS: readonly UserId[] = ["A", "B"];

export function isUserId(value: unknown): value is UserId {
  return value === "A" || value === "B";
}

/** Reads the stored identity, or null when the user has not picked yet. */
export function getCurrentUser(): UserId | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return isUserId(raw) ? raw : null;
}

/** Persists the picked identity (one-time prompt, changeable via UI). */
export function setCurrentUser(user: UserId): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, user);
}
