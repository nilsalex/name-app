"use client";

// Nomination screen (feature 013, contracts.md "app/nominate-client.tsx").
//
// One name at a time: the gate supplies the server-derived initial state;
// after every tap the client re-derives the next name optimistically with
// the SAME pure functions the server used (lib/nomination-logic) — the
// presentation path never awaits the network (research R6, SC-001). Each
// decision dispatches fire-and-forget with the same bounded-retry sender
// pattern as votes (lib/vote-sender.ts, research R2); failed saves surface
// in a persistent dismissable notice after the retry window (feature 003
// UX).
//
// On completion the client swaps itself into the vote phase: pool >= 2 →
// rendered VoteClient with the locally derived pool (FR-009, no waiting
// screen, no router.refresh); pool < 2 → locked message (FR-008, R7).
// Math.random() is never called during render — only inside the vote
// client after its mount effect.
import { useCallback, useRef, useState } from "react";
import {
  nextUndecidedName,
  decidedCount,
  includedNames,
  isRoundComplete,
} from "@/lib/nomination-logic";
import type { NominationDecision } from "@/lib/nomination-logic";
import { createVoteSender, type NominationInput } from "@/lib/vote-sender";
import { setNomination } from "@/app/actions";
import type { NominationResult } from "@/app/actions";
import VoteClient from "./vote-client";
import styles from "./nominate.module.css";

interface NominateClientProps {
  uid: string;
  /** Gate-supplied, server-derived nomination state. */
  initial: Extract<NominationResult, { ok: true }>;
  /**
   * Neutral display label ("Person N") — the gate already resolves it for
   * the vote branch; threaded here so the completion-time client-side swap
   * into VoteClient shows the same copy without a server round trip.
   */
  label?: string;
}

export default function NominateClient({ uid, initial, label }: NominateClientProps) {
  // The single client-side source of truth: the decisions map, seeded from
  // the server state and updated synchronously on every tap.
  const [decisions, setDecisions] = useState<Record<string, NominationDecision>>(
    { ...initial.decisions }
  );
  // Persistent dismissable failed-saves notice (null = hidden), same UX
  // as voting's failedNotices (feature 003 T010).
  const [failedNotices, setFailedNotices] = useState<number | null>(null);

  // Mirror for synchronous tap handling: decide() must derive from the
  // latest map without waiting for a React state flush (same pattern as
  // vote-client's reserveRef). Fire-and-forget writes never rebase
  // optimistically applied decisions — values are final (FR-011).
  const decisionsRef = useRef(decisions);

  // Same bounded-retry sender pattern as the vote sender (research R2):
  // fire-and-forget per decision, 3-minute window, 5 s retry delay,
  // failures batched into the persistent notice.
  const senderRef = useRef<ReturnType<typeof createVoteSender<NominationInput>> | null>(null);
  if (senderRef.current === null) {
    senderRef.current = createVoteSender<NominationInput>({
      send: ({ name, decision }: { name: string; decision: NominationDecision }) =>
        setNomination(name, decision).then((result) => {
          if (!result.ok) throw new Error(result.error ?? "Fehler");
        }),
      onFailed: (count) => setFailedNotices((prev) => (prev ?? 0) + count),
    });
  }

  const nextName = nextUndecidedName(decisions);
  const complete = isRoundComplete(decisions);
  const pool = includedNames(decisions);

  const decide = useCallback(
    (decision: NominationDecision) => {
      const name = nextUndecidedName(decisionsRef.current);
      if (name === null) return; // complete — nothing left to decide
      // SYNCHRONOUS local swap: apply the decision, move to the next
      // undecided name (presentation <100 ms, SC-001).
      const updated = { ...decisionsRef.current, [name]: decision };
      decisionsRef.current = updated;
      setDecisions(updated);
      // Fire-and-forget persist (bounded retry, at-most-once semantics per
      // entry; a retried write of the same value is idempotent, FR-011).
      senderRef.current?.cast({ name, decision, voter: uid });
    },
    [uid]
  );

  if (complete) {
    if (pool.length >= 2) {
      // FR-009: straight into the vote phase — client-side state swap, no
      // waiting screen, no router.refresh. The gate's server branch renders
      // the identical component for subsequent loads (FR-013).
      return <VoteClient uid={uid} label={label ?? "Person"} pool={pool} />;
    }
    // FR-008: fewer than 2 included names — locked, no voting.
    return (
      <div className={styles.locked}>
        <p>
          Zu wenige Namen übrig ({pool.length}) — Abstimmung nicht möglich.
        </p>
      </div>
    );
  }

  // Round incomplete: one undecided name per screen (FR-001/FR-002).
  return (
    <div className={styles.nominateArea}>
      <h1 className={styles.heading}>Nominierung</h1>
      <p className={styles.hint}>Welche Namen sollen in die Abstimmung?</p>
      <p className={styles.counter}>
        {decidedCount(decisions)} von 200
      </p>
      <div className={styles.nameCard}>{nextName}</div>
      <div className={styles.decisionButtons}>
        <button
          className={styles.decisionButton}
          onClick={() => decide("in")}
        >
          Aufnehmen
        </button>
        <button
          className={styles.decisionButton}
          onClick={() => decide("out")}
        >
          Ausschließen
        </button>
      </div>
      {failedNotices !== null && (
        <div className={styles.notice}>
          <p role="alert" className={styles.noticeText}>
            {failedNotices} Entscheidungen wurden nicht gespeichert
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
