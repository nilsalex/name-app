"use client";

// Vote screen (US1): pick your identity once, then vote on name pairs.
// FR-003 single selection; FR-004 immediate next pair; FR-012 error on
// failed submission with pair unchanged.
import { useCallback, useEffect, useState, useTransition } from "react";
import { nextPair, type Pair } from "@/lib/pairing";
import { getCurrentUser, setCurrentUser, USER_IDS, type UserId } from "@/lib/user";
import { submitVote, getScores } from "@/app/actions";
import styles from "./page.module.css";

export default function VoteClient() {
  const [user, setUser] = useState<UserId | null>(() => getCurrentUser());
  // Math.random() must not run during prerender (Next.js Cache Components),
  // so the first pair is generated on mount in an effect.
  const [pair, setPair] = useState<Pair | null>(null);
  // Feature 002: score map drives weighted pair selection (FR-006). Fetched
  // on mount and refreshed after each successful vote so the very next pair
  // reflects the latest standings (US3).
  const [scores, setScores] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await getScores();
      if (!cancelled) setScores(current);
      setPair(nextPair(undefined, current));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseUser = useCallback((id: UserId) => {
    setCurrentUser(id);
    setUser(id);
  }, []);

  const vote = useCallback(
    (winner: string, loser: string) => {
      if (!user) return;
      setError(null);
      startTransition(async () => {
        const result = await submitVote(winner, loser, user);
        if (!result.ok) {
          // FR-012: vote not counted, pair stays unchanged, user is told.
          setError(result.error ?? "Fehler — bitte nochmal versuchen.");
          return;
        }
        // Refresh scores first so the next draw uses the latest standings
        // (US3 / FR-006); fall back to the stale map if the fetch fails.
        let fresh = scores;
        try {
          fresh = await getScores();
          setScores(fresh);
        } catch {
          // keep stale scores — draw continues with slightly older weights
        }
        setPair((prev) => nextPair(prev ?? undefined, fresh));
      });
    },
    [user, scores]
  );

  if (!user) {
    return (
      <div className={styles.pickUser}>
        <h1>Wer bist du?</h1>
        <div className={styles.userButtons}>
          {USER_IDS.map((id) => (
            <button key={id} onClick={() => chooseUser(id)} className={styles.nameButton}>
              Person {id}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!pair) {
    return <div className={styles.voteArea} aria-busy="true" />;
  }

  return (
    <div className={styles.voteArea}>
      <p className={styles.hint}>Welcher Name gefällt dir besser, Person {user}?</p>
      <div className={styles.pairButtons}>
        <button
          className={styles.nameButton}
          disabled={pending}
          onClick={() => vote(pair[0], pair[1])}
        >
          {pair[0]}
        </button>
        <span className={styles.vs}>oder</span>
        <button
          className={styles.nameButton}
          disabled={pending}
          onClick={() => vote(pair[1], pair[0])}
        >
          {pair[1]}
        </button>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
