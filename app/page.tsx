// Vote screen route (US1) — server component shell wrapping the client
// voting logic. Data rules live in lib/, UI contract in contracts/.
import VoteClient from "./vote-client";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <VoteClient />
    </main>
  );
}
