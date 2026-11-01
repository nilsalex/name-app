// Ranking screen (US2): all 200 names with shared-rank ties (FR-008, FR-014).
// Uncached read (ranking must reflect the latest votes, SC-003), streamed
// inside <Suspense> per the Cache Components rendering model.
import { Suspense } from "react";
import { getRanking } from "@/app/actions";
import styles from "./page.module.css";

async function RankingList() {
  let ranking;
  try {
    ranking = await getRanking();
  } catch {
    // Build-time prerender / transient failure: show an explanatory empty
    // state instead of failing the page (spec edge case).
    return <p className={styles.empty}>Rangliste momentan nicht verfügbar.</p>;
  }
  return (
    <ol className={styles.list}>
      {ranking.map((entry) => (
        <li key={entry.name} className={styles.row}>
          <span className={styles.rank}>{entry.rank}</span>
          <span className={styles.name}>{entry.name}</span>
          <span className={styles.score}>{entry.score}</span>
        </li>
      ))}
    </ol>
  );
}

export default function RankingPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Rangliste</h1>
      <Suspense fallback={<p className={styles.loading}>Lade Rangliste…</p>}>
        <RankingList />
      </Suspense>
    </main>
  );
}
