"use client";

// Reset controls (feature 014, contracts.md "app/reset-controls.tsx").
//
// One shared client component with a `variant` prop (research R6):
//   "votes"       → "Stimmen zurücksetzen"       (vote screen, US1)
//   "nominations" → "Nominierungen zurücksetzen"  (nomination screen, US2)
//   "all"         → "Stimmen zurücksetzen" + "Alles zurücksetzen"
//                    (vote screen, both available where votes exist —
//                    US3; the nominations reset is NOT offered here,
//                    it lives only on the nomination screen)
//
// Destructive guard (FR-007, research R3): a two-step inline confirmation —
// the first tap swaps the control into a confirm state ("Wirklich löschen?
// Endgültig, ohne Widerruf." with "Ja, löschen" / "Abbrechen"); ONLY the
// confirm tap dispatches the reset. Cancel returns to neutral; no browser
// confirm() dialog (research R3). While a reset is in flight the confirm
// button is disabled (double-tap safe); there is NO retry loop — a failure
// surfaces the action's error copy inline and the control returns to
// neutral (research R3). On { ok: true } the local confirm state resets and
// router.refresh() lets the server gate re-derive the phase from storage
// (research R4 — the same mechanism as the sign-out button in
// vote-client.tsx). German copy throughout; no new dependency.
//
// In-flight sender queues (research R5) are deliberately untouched: the
// refresh re-derives everything server-side; late-retrying sends simply
// become new data.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetVotes, resetNominations, resetAll } from "@/app/actions";
import type { ActionResult } from "@/app/actions";
import styles from "./page.module.css";

export type ResetVariant = "votes" | "nominations" | "all";

type ResetActionKind = "votes" | "nominations" | "all";

interface ResetControlsProps {
  /** Which reset(s) to offer: vote screen → "all"; nomination screen → "nominations". */
  variant: ResetVariant;
  /**
   * Optional parent hook, invoked after a confirmed reset resolves
   * { ok: true } (US2, T014): lets the parent clear its own optimistic
   * client state BEFORE router.refresh() re-derives the phase server-side.
   * The nomination screen needs this — NominateClient seeds its decisions
   * map from server props and would otherwise keep the stale (complete)
   * map instead of the fresh "0 von 200" round.
   */
  onSuccess?: () => void;
}

interface ResetAction {
  kind: ResetActionKind;
  /** Neutral-state button label (German copy, contracts.md). */
  label: string;
  /** The server action this control dispatches when confirmed. */
  dispatch: () => Promise<ActionResult>;
}

/** Which actions each variant offers (research R6, FR-001/FR-002/FR-006). */
function actionsFor(variant: ResetVariant): ResetAction[] {
  if (variant === "votes") {
    return [
      { kind: "votes", label: "Stimmen zurücksetzen", dispatch: resetVotes },
    ];
  }
  if (variant === "nominations") {
    return [
      {
        kind: "nominations",
        label: "Nominierungen zurücksetzen",
        dispatch: resetNominations,
      },
    ];
  }
  // variant === "all" (research R6, FR-001 + FR-006): the vote screen offers
  // the votes reset AND the combined reset — each with its own two-step
  // confirm. The nominations reset is NOT offered here: it lives only on
  // the nomination screen (a fresh round there has no votes to reset;
  // FR-005 keeps votes out of a nominations reset and vice versa).
  return [
    { kind: "votes", label: "Stimmen zurücksetzen", dispatch: resetVotes },
    { kind: "all", label: "Alles zurücksetzen", dispatch: resetAll },
  ];
}

const ALL_ACTIONS = actionsFor("all");

/** One reset control: neutral button → inline confirm → dispatch. */
function ResetControl({
  action,
  onSuccess,
}: {
  action: ResetAction;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  // null = neutral button; a kind = that control's confirm state.
  const [confirming, setConfirming] = useState<ResetActionKind | null>(null);
  // Set while the confirmed reset is in flight (confirm disabled — double-tap safe).
  const [pending, setPending] = useState(false);
  // Surfaced error copy: the action's German error message, inline (research R3);
  // cleared on the next neutral render — no retry loop.
  const [error, setError] = useState<string | null>(null);

  const confirm = (): void => {
    setPending(true);
    void action
      .dispatch()
      .then((result: ActionResult) => {
        if (result.ok) {
          setConfirming(null);
          setError(null);
          // US2 (T014): the parent clears its own optimistic state first,
          // then research R4: the gate re-derives the phase from storage.
          onSuccess?.();
          router.refresh();
        } else {
          setConfirming(null);
          setError(result.error ?? "Zurücksetzen fehlgeschlagen — bitte nochmal versuchen.");
        }
      })
      .catch(() => {
        // The actions already map failures to ActionResult; a thrown error
        // here is an unexpected client-side failure (e.g.network transport).
        setConfirming(null);
        setError("Zurücksetzen fehlgeschlagen — bitte nochmal versuchen.");
      })
      .finally(() => setPending(false));
  };

  if (confirming === action.kind) {
    return (
      <div className={styles.resetConfirm}>
        <span className={styles.resetConfirmText}>
          Wirklich löschen? Endgültig, ohne Widerruf.
        </span>
        <div className={styles.resetConfirmButtons}>
          <button
            className={styles.resetConfirmDelete}
            onClick={confirm}
            disabled={pending}
          >
            Ja, löschen
          </button>
          <button
            className={styles.resetConfirmCancel}
            onClick={() => setConfirming(null)}
            disabled={pending}
          >
            Abbrechen
          </button>
        </div>
        {error !== null && (
          <p role="alert" className={styles.resetError}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={styles.resetControl}>
      <button
        className={styles.resetButton}
        onClick={() => setConfirming(action.kind)}
        disabled={pending}
      >
        {action.label}
      </button>
      {error !== null && (
        <p role="alert" className={styles.resetError}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function ResetControls({ variant, onSuccess }: ResetControlsProps) {
  const actions = variant === "all" ? ALL_ACTIONS : actionsFor(variant);
  return (
    <div className={styles.resetControls}>
      {actions.map((action) => (
        <ResetControl key={action.kind} action={action} onSuccess={onSuccess} />
      ))}
    </div>
  );
}
