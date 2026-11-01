"use server";

// Server actions for the voting app (contracts/contracts.md).
import { COLOGNE_200_BOY_NAMES } from "@/lib/names";
import { recordVote, scores } from "@/lib/store";
import { rankNames } from "@/lib/ranking";
import type { RankedName } from "@/lib/ranking";
import { isUserId, type UserId } from "@/lib/user";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface WinnersResult {
  ok: boolean;
  winners?: string[];
  error?: string;
}

function isName(value: unknown): value is string {
  return typeof value === "string" && COLOGNE_200_BOY_NAMES.includes(value);
}

/** Validates and records one vote; returns error state on failure (FR-012). */
export async function submitVote(
  winner: unknown,
  loser: unknown,
  user: unknown
): Promise<ActionResult> {
  try {
    if (!isName(winner) || !isName(loser)) {
      return { ok: false, error: "Unbekannter Name." };
    }
    if (winner === loser) {
      return { ok: false, error: "Ein Paar muss aus zwei verschiedenen Namen bestehen." };
    }
    if (!isUserId(user)) {
      return { ok: false, error: "Unbekannter Nutzer — bitte zuerst auswählen, wer du bist." };
    }
    await recordVote({ winner, loser, user: user as UserId });
    return { ok: true };
  } catch (err) {
    // FR-012: failed submissions must NOT count and must be reported.
    console.error("submitVote failed:", err);
    return { ok: false, error: "Speichern fehlgeschlagen — bitte nochmal versuchen." };
  }
}

/** Current ranking of all 200 names (FR-007/FR-008, FR-014 shared ranks). */
export async function getRanking(): Promise<RankedName[]> {
  const current = await scores();
  return rankNames(COLOGNE_200_BOY_NAMES, current);
}

/** Raw win counts for weighted pair selection (feature 002, FR-006). */
export async function getScores(): Promise<Record<string, number>> {
  return scores();
}

/** The name(s) at rank 1, including ties (FR-009). */
export async function getWinners(): Promise<WinnersResult> {
  try {
    const ranking = await getRanking();
    const winners = ranking.filter((r) => r.rank === 1).map((r) => r.name);
    return { ok: true, winners };
  } catch (err) {
    console.error("getWinners failed:", err);
    return { ok: false, error: "Rangliste konnte nicht geladen werden." };
  }
}
