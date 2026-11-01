// Winners screen (US3): the name(s) at rank 1, including ties (FR-009).
import { Suspense } from "react";
import { getWinners } from "@/app/actions";
import styles from "./page.module.css";

async function WinnersList() {
  const result = await getWinners();
  if (!result.ok || !result.winners) {
    return <p className={styles.empty}>Gewinner momentan nicht verfügbar.</p>;
  }
  if (result.winners.length === 0) {
    // Zero votes yet: explanatory empty state instead of a failure (spec edge case).
    return <p className={styles.empty}>Noch keine Stimmen — alle Namen führen!</p>;
  }
  return (
    <div className={styles.winners}>
      {result.winners.map((name) => (
        <span key={name} className={styles.winnerBadge}>
          {name}
        </span>
      ))}
      {result.winners.length > 1 && (
        <p className={styles.tieNote}>Gleichstand — {result.winners.length} Gewinner</p>
      )}
    </div>
  );
}

export default function WinnersPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Gewinner</h1>
      <Suspense fallback={<p className={styles.empty}>Lade Gewinner…</p>}>
        <WinnersList />
      </Suspense>
    </main>
  );
}
