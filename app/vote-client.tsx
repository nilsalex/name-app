"use client";

// Vote screen (spec 005 US1): the identity comes from the session — the
// server component passes the internal user id and the neutral display
// label as props (no more localStorage picker, no alias).
// Pick a pair, then tap through name pairs instantly. The next pair is
// swapped in synchronously from a client-side reserve while the vote
// dispatches asynchronously (fire-and-forget, bounded retry, at-most-once).
// Presentation never awaits the network; failures surface via a persistent
// dismissable notice after the retry window expires (feature 003, Q4).
//
// Math.random() must not run during prerender (Next.js Cache Components),
// so pairs are only generated inside effects, never during render.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Pair } from "@/lib/pairing";
import { needsRefill, refillReserve, takePair } from "@/lib/pair-queue";
import { createVoteSender } from "@/lib/vote-sender";
import { submitVote, getScores, signOut } from "@/app/actions";
import styles from "./page.module.css";

export default function VoteClient({ uid, label }: { uid: string; label: string }) {
  const router = useRouter();
  // Displayed pair; null until the first reserve batch is prepared (mount)
  // or while the reserve is exhausted (aria-busy, taps disabled — Q5/V6).
  const [pair, setPair] = useState<Pair | null>(null);
  // Feature 003: FIFO of pre-generated pairs. A tap pops synchronously from
  // it (instant <100 ms swap, SC-001) while the vote travels in background.
  const [reserve, setReserve] = useState<Pair[]>([]);
  // Feature 002 (FR-006) → superseded by 006: the pair generator now uses
  // the personal seen-frequency map (pickUnderseenPair). Fetched at mount
  // and at just-in-time refills (~1 fetch per 5 votes — Free-Plan Budget
  // audit unchanged; research R2/R4). Win scores are kept in the ref for
  // potential future use but no longer drive drafting (R5).
  const scoresRef = useRef<Record<string, number>>({});
  const seenRef = useRef<Record<string, number>>({});
  // Feature 003 (US3): accumulated failed votes behind the persistent,
  // dismissable notice (T010); null = hidden. Dismissal resets the count.
  const [failedNotices, setFailedNotices] = useState<number | null>(null);
  // Deduplicates in-flight refill fetches (T009): one score fetch at a
  // time; failures leave the stale reserve usable (catch-and-continue).
  const refillInFlight = useRef(false);
  // Mirror of the reserve for synchronous tap handling: takePair must see
  // the current reserve without waiting for a React state flush.
  const reserveRef = useRef<Pair[]>([]);
  const setReserveSync = useCallback((next: Pair[]): void => {
    reserveRef.current = next;
    setReserve(next);
  }, []);

  // Feature 003 vote sender: fire-and-forget dispatch with bounded retry
  // (default 3-minute window, 5 s delay) and at-most-once recording.
  // onFailed feeds the persistent notice (T010). Created lazily once —
  // server action calls are safe here; no Math.random involvement.
  const senderRef = useRef<ReturnType<typeof createVoteSender> | null>(null);
  if (senderRef.current === null) {
    senderRef.current = createVoteSender({
      send: (vote) =>
        submitVote(vote.winner, vote.loser).then((result) => {
          if (!result.ok) throw new Error(result.error ?? "Fehler");
        }),
      onFailed: (count) => setFailedNotices((prev) => (prev ?? 0) + count),
    });
  }

  // T012: pop the next valid pair from the reserve, skipping any pair that
  // exactly repeats the currently shown one (display-time guard, T011).
  // Pure synchronous state work — the tap path never awaits.
  const showNextPair = useCallback(
    (shown: Pair | null): void => {
      const { pair: next, reserve: rest } = takePair(
        reserveRef.current,
        shown ?? undefined
      );
      setReserveSync(rest);
      setPair(next ?? null);
    },
    [setReserveSync]
  );

  // Just-in-time refill (US2, clarified Q2 / T009): one batch per threshold
  // crossing — not per vote, not on a timer. Chains the last reserve pair
  // (or the currently shown pair when the reserve ran dry) as lastPair so
  // generation-time no-repeat chaining holds across batch boundaries (T012).
  // Score-fetch failures leave the stale reserve usable (catch-and-continue).
  const refill = useCallback((): void => {
    if (refillInFlight.current) return;
    refillInFlight.current = true;
    void (async () => {
      try {
        // Pre-draft the batch client-side so its name-slots can be sent as
        // freshBatch — the server bumps seen for exactly these names in the
        // same round trip (single-writer rule, research R4).
        const last = reserveRef.current[reserveRef.current.length - 1] ?? pair ?? undefined;
        const batch = refillReserve([], seenRef.current, last);
        const batchNames = batch.flat();
        const fresh = await getScores(batchNames);
        scoresRef.current = fresh.scores;
        seenRef.current = fresh.seen;
        setReserveSync(refillReserve(reserveRef.current, fresh.seen, last));
      } catch {
        // Keep the stale reserve — slightly older weights beat a stall.
      } finally {
        refillInFlight.current = false;
      }
    })();
  }, [pair, setReserveSync]);

  // T009: trigger refill exactly when the reserve drops below the
  // threshold — off the presentation path, deduplicated.
  useEffect(() => {
    if (needsRefill(reserve) && !refillInFlight.current) refill();
  }, [reserve, refill]);

  // Mount (T007): fetch scores once, prepare the initial batch, then show
  // the first pair via the pump effect. Pairs are only generated inside
  // effects (Math.random never runs during prerender).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await getScores();
        if (cancelled) return;
        scoresRef.current = current.scores;
        seenRef.current = current.seen;
        setReserveSync(refillReserve([], current.seen, undefined));
      } catch {
        // No scores available: uniform fallback keeps the app usable (FR-004).
        if (!cancelled) setReserveSync(refillReserve([], undefined, undefined));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setReserveSync]);

  // Presentation pump: whenever no pair is displayed but the reserve holds
  // one (initial mount, or post-refill exhaustion recovery), show it.
  // DEPENDS ON THE RESERVE STATE, not only the ref: a mount/refill that
  // arrives while pair === null must retrigger this effect. With only
  // stable refs in the deps the effect would never re-run and the vote
  // area would stay empty forever (live-found bug, T024 validation).
  useEffect(() => {
    if (pair === null && reserveRef.current.length > 0) showNextPair(null);
  }, [pair, reserve, showNextPair]);

  const vote = useCallback(
    (winner: string, loser: string) => {
      // T007/T012: synchronously swap in the next pair (<100 ms, SC-001),
      // then dispatch the vote fire-and-forget — presentation never waits.
      // The vote carries exactly the displayed pair (winner = tapped name).
      showNextPair(pair);
      senderRef.current?.cast({ winner, loser, voter: uid }); // voter unused server-side (session-derived); kept for VoteInput shape
    },
    [pair, showNextPair, uid]
  );

  if (!pair) {
    // Initial mount or exhausted reserve: neutral aria-busy pair area with
    // taps disabled until a prepared pair arrives (clarified Q5; V6).
    return <div className={styles.voteArea} aria-busy="true" />;
  }

  return (
    <div className={styles.voteArea}>
      <button
        className={styles.signOut}
        onClick={() => {
          void signOut().then(() => router.refresh());
        }}
      >
        Abmelden
      </button>
      <p className={styles.hint}>Welcher Name gefällt dir besser, {label}?</p>
      <div className={styles.pairButtons}>
        <button className={styles.nameButton} onClick={() => vote(pair[0], pair[1])}>
          {pair[0]}
        </button>
        <span className={styles.vs}>oder</span>
        <button className={styles.nameButton} onClick={() => vote(pair[1], pair[0])}>
          {pair[1]}
        </button>
      </div>
      {failedNotices !== null && (
        <div className={styles.notice}>
          <p role="alert" className={styles.noticeText}>
            {failedNotices} Stimmen wurden nicht gezählt
          </p>
          <button
            className={styles.noticeDismiss}
            onClick={() => setFailedNotices(null)}
          >
            Ausblenden
          </button>
        </div>
      )}
    </div>
  );
}
