// Vote screen route (spec 005 US1): session gate. The static shell stays
// prerendered; the session read happens at request time inside a Suspense
// boundary (cacheComponents requirement, plan.md Constitution I) and streams
// in either the vote screen or the login screen.
import { Suspense } from "react";
import VoteClient from "./vote-client";
import LoginClient from "./login-client";
import NominateClient from "./nominate-client";
import { getCurrentUid } from "@/lib/session";
import { findUserById, displayLabel } from "@/lib/user-store";
import { getNomination } from "@/app/actions";
import { googleClientId } from "@/lib/env";
import styles from "./page.module.css";

async function VoteGate() {
  const uid = await getCurrentUid();
  if (uid === null) {
    return <LoginClient clientId={googleClientId()} />;
  }
  // Resolve the neutral display label server-side ("Person N"); a missing
  // record (deleted while the cookie survives) falls back to bare "Person".
  const record = await findUserById(uid);
  const display = record ? displayLabel(record) : "Person";
  // Feature 013 (research R3): the gate reads the user's nomination state
  // alongside the session (one HGETALL per open, Free-Plan Budget fine).
  // An Upstash failure throws — the existing gate/Suspense error fallback
  // posture applies (contracts.md: throwing getNomination, unchanged).
  const nomination = await getNomination();
  if (!nomination.ok) {
    // Defensive: getNomination only returns !ok when signed out, but the
    // uid check above already excluded that — render the login screen.
    return <LoginClient clientId={googleClientId()} />;
  }
  if (!nomination.complete) {
    // Round incomplete → nomination screen (one undecided name at a time;
    // FR-006: no vote interaction reachable anywhere in the app).
    return <NominateClient uid={uid} label={display} initial={nomination} />;
  }
  // Round complete → vote screen; the pool prop (the user's included
  // names) constrains drafting (US2; passing it early is harmless).
  return <VoteClient uid={uid} label={display} pool={nomination.pool} />;
}

export default function Home() {
  return (
    <main className={styles.main}>
      <Suspense fallback={<p className={styles.hint}>Anmeldung wird geprüft…</p>}>
        <VoteGate />
      </Suspense>
    </main>
  );
}
