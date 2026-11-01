// Winners screen (US3): the user's personal rank-1 name(s), including ties.
// Feature 006: winners are derived from the signed-in user's own tally
// (FR-003); signed-out users get a login prompt (research R6).
import { Suspense } from "react";
import { getWinners } from "@/app/actions";
import styles from "./page.module.css";

async function WinnersList() {
  const result = await getWinners();
  if (!result.ok || !result.winners) {
    return (
      <p className={styles.empty}>Melde dich an, um deine Gewinner zu sehen.</p>
    );
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
      <h1 className={styles.heading}>Deine Gewinner</h1>
      <Suspense fallback={<p className={styles.empty}>Lade Gewinner…</p>}>
        <WinnersList />
      </Suspense>
    </main>
  );
}
