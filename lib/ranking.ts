// Ranking computation — a pure view over votes (data-model.md "Ranking").
//
// FR-007: score = win count.
// FR-014: equal scores share the same rank position (1-2-2-4 competition
// ranking); no tie-break rule. Within a tie, names are listed alphabetically
// for stable DISPLAY order only — this is not a score tie-break (research.md R3).
export interface RankedName {
  name: string;
  score: number; // win count
  rank: number; // shared rank position
}

/** Orders names by score descending; equal scores share a rank. */
export function rankNames(
  names: readonly string[],
  scores: Readonly<Record<string, number>>
): RankedName[] {
  const sorted = [...names].sort((a, b) => {
    const scoreA = scores[a] ?? 0;
    const scoreB = scores[b] ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.localeCompare(b, "de");
  });

  const result: RankedName[] = [];
  let previousScore: number | null = null;
  let previousRank = 0;

  for (let index = 0; index < sorted.length; index++) {
    const name = sorted[index];
    const score = scores[name] ?? 0;
    const rank =
      score === previousScore ? previousRank : index + 1;
    result.push({ name, score, rank });
    previousScore = score;
    previousRank = rank;
  }

  return result;
}
