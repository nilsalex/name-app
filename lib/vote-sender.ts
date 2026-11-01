// Vote dispatch queue for the vote screen (feature 003).
//
// Fire-and-forget dispatch of client votes: a cast vote is sent immediately;
// on rejection it re-enters a bounded retry loop (default window 3 minutes,
// 5 s between attempts). A vote whose send ever resolves successfully is
// terminal ("sent") and is never dispatched again — at-most-once recording
// per vote record (spec FR-005 / feature 003 US3). Votes still unsent when
// the window expires are marked "failed" and reported once via onFailed.
//
// No module state, no I/O: the send function is injectable so tests run
// deterministically with fake timers (see tests/unit/vote-sender.test.ts).

export type VoteInput = { winner: string; loser: string; voter: string };
export type VoteStatus = "pending" | "sent" | "failed";

export interface VoteSenderOptions {
  /** Submits one vote; resolves on confirmed recording, rejects on failure. */
  send: (vote: VoteInput) => Promise<void>;
  /** Total retry window in ms before a vote is marked failed. Default 180_000. */
  retryWindowMs?: number;
  /** Delay between retries in ms. Default 5_000. */
  retryDelayMs?: number;
  /** Called with the number of newly failed votes (batched). */
  onFailed?: (failedCount: number) => void;
  /** Injectable clock for deterministic tests. Default Date.now. */
  now?: () => number;
}

interface TrackedVote {
  vote: VoteInput;
  status: VoteStatus;
  /** Epoch ms when the vote's retry window started (first dispatch). */
  windowStart: number;
}

export function createVoteSender(options: VoteSenderOptions): {
  cast: (vote: VoteInput) => void;
  pendingCount: () => number;
} {
  const {
    send,
    retryWindowMs = 180_000,
    retryDelayMs = 5_000,
    onFailed,
    now = () => Date.now(),
  } = options;

  // Votes that are queued for (re)dispatch or currently in flight.
  const queue = new Set<TrackedVote>();
  // Handle of the scheduled retry pass, if one is pending.
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  // Votes that ended "failed" since the last onFailed flush.
  let newlyFailed = 0;

  function pendingCount(): number {
    let count = 0;
    for (const tracked of queue.values()) {
      if (tracked.status === "pending") count++;
    }
    return count;
  }

  /** Attempt one dispatch. Resolves "sent", "expired", or "retry". */
  function attempt(tracked: TrackedVote): Promise<"sent" | "expired" | "retry"> {
    return send(tracked.vote)
      .then((): "sent" => {
        // Terminal success — at-most-once: irrevocably leaves the queue.
        tracked.status = "sent";
        queue.delete(tracked);
        return "sent";
      })
      .catch((): "expired" | "retry" => {
        if (tracked.status !== "pending") return "retry";
        if (now() - tracked.windowStart >= retryWindowMs) {
          tracked.status = "failed";
          queue.delete(tracked);
          newlyFailed++;
          return "expired";
        }
        return "retry";
      });
  }

  function flushFailures(): void {
    if (newlyFailed > 0 && onFailed) {
      const count = newlyFailed;
      newlyFailed = 0;
      onFailed(count);
    }
  }

  function scheduleRetry(): void {
    if (retryTimer !== undefined) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      dispatchAll();
    }, retryDelayMs);
  }

  /** Dispatch every pending vote in the queue; schedule the next pass if
   *  any vote is still retrying after the pass settles. (Failed expiries
   *  are counted once inside attempt() and flushed here.) */
  function dispatchAll(): void {
    const targets = [...queue].filter((t) => t.status === "pending");
    const results = targets.map((t) => attempt(t));
    void Promise.all(results).then(() => {
      if (queue.size > 0) {
        // Some votes are still retrying — keep bounded-retry loop alive.
        scheduleRetry();
      }
      flushFailures();
    });
  }

  function cast(vote: VoteInput): void {
    const tracked: TrackedVote = {
      vote,
      status: "pending",
      windowStart: now(),
    };
    queue.add(tracked);
    void attempt(tracked).then((result) => {
      if (result === "retry") scheduleRetry();
      if (result === "expired") flushFailures();
    });
  }

  return { cast, pendingCount };
}
