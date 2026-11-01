import { Suspense } from "react";
import { BOY_NAMES } from "@/lib/names";
import {
  activeBackend,
  getVotesSnapshot,
  tally,
} from "@/lib/votes";
import { submitVote } from "./actions";

async function VoteBoard() {
  const { backend, votes } = await getVotesSnapshot();
  const scores = tally(votes);
  const totalVotes = Object.keys(votes).length;

  return (
    <div style={{ width: "100%", maxWidth: 720 }}>
      <p style={{ color: "#666", fontSize: 14 }}>
        Names of voters are stored next to their pick (spike-grade, no
        auth). Persistence backend: <code>{backend}</code> —{" "}
        {backend === "upstash"
          ? "Upstash Redis on Vercel"
          : "local JSON file (dev fallback; not usable on Vercel)"}
      </p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18 }}>Current ranking ({totalVotes} votes)</h2>
        <ol style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 20 }}>
          {scores
            .filter((s) => s.score > 0)
            .slice(0, 10)
            .map((s) => (
              <li key={s.name}>
                <strong>{s.name}</strong> — {s.score} vote
                {s.score === 1 ? "" : "s"} ({votes[s.name]})
              </li>
            ))}
          {totalVotes === 0 && <li>No votes yet.</li>}
        </ol>
      </section>

      <section>
        <h2 style={{ fontSize: 18 }}>Vote for a name</h2>
        <p style={{ fontSize: 13, color: "#666" }}>
          Each submission overwrites this voter&apos;s previous pick for that
          name (one row per name per voter). Two voters voting at the same
          time do not lose each other&apos;s votes.
        </p>
        <form
          action={submitVote}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <input
            name="voter"
            required
            placeholder="Your name"
            style={{
              padding: "6px 10px",
              border: "1px solid #ccc",
              borderRadius: 6,
            }}
          />
          <select
            name="name"
            required
            defaultValue=""
            style={{
              padding: "6px 10px",
              border: "1px solid #ccc",
              borderRadius: 6,
            }}
          >
            <option value="" disabled>
              Choose a name
            </option>
            {BOY_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "#f5f5f5",
              cursor: "pointer",
            }}
          >
            Vote
          </button>
        </form>

        <details>
          <summary style={{ cursor: "pointer", fontSize: 14 }}>
            Full per-vote log ({totalVotes})
          </summary>
          <ul style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
            {Object.entries(votes)
              .sort((a, b) => a[1].localeCompare(b[1], "de"))
              .map(([name, voter]) => (
                <li key={`${name}:${voter}`}>
                  {voter} → {name}
                </li>
              ))}
          </ul>
        </details>
      </section>
    </div>
  );
}

export default function Home() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minHeight: "100vh",
        padding: 32,
      }}
    >
      <main style={{ width: "100%", maxWidth: 720 }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Name vote — spike</h1>
        <p style={{ color: "#666", marginBottom: 24 }}>
          Choosing a boy&apos;s name: 200 popular German boys&apos; names
          (Cologne open data).
        </p>
        <Suspense fallback={<p>Loading votes…</p>}>
          <VoteBoard />
        </Suspense>
      </main>
    </div>
  );
}
