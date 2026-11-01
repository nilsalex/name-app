// Vote screen route (spec 005 US1): session gate. The static shell stays
// prerendered; the session read happens at request time inside a Suspense
// boundary (cacheComponents requirement, plan.md Constitution I) and streams
// in either the vote screen or the login screen.
import { Suspense } from "react";
import VoteClient from "./vote-client";
import LoginClient from "./login-client";
import { getCurrentUid } from "@/lib/session";
import { findUserById, displayLabel } from "@/lib/user-store";
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
  return <VoteClient uid={uid} label={record ? displayLabel(record) : "Person"} />;
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
