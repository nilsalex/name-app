// Vote screen route (spec 004 US1): session gate. The static shell stays
// prerendered; the session read happens at request time inside a Suspense
// boundary (cacheComponents requirement, plan.md Constitution I) and streams
// in either the vote screen or the login screen.
import { Suspense } from "react";
import VoteClient from "./vote-client";
import LoginClient from "./login-client";
import { getCurrentAlias } from "@/lib/session";
import { googleClientId } from "@/lib/env";
import styles from "./page.module.css";

async function VoteGate() {
  const alias = await getCurrentAlias();
  if (alias === null) {
    return <LoginClient clientId={googleClientId()} />;
  }
  return <VoteClient alias={alias} />;
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
