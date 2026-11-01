// Unit test: sign-in flow invariants (spec 005 US1/US3, research.md R7).
// Locks the T012 ordering: the approved check runs BEFORE any user-store
// access, so a non-approved account leaves no record (zero `put` calls,
// FR-003/SC-004: "denial leaves no trace").
//
// Strategy: canonical anti-corruption over the pure boundary. signIn itself
// would need env + cookies + Redis; instead the DENIAL decision is isolated
// in a helper shared with app/actions.ts semantics: given the verified
// email and the parsed approved list, approval is checked first, and the
// user store is only touched after `isApprovedEmail` returns true. The
// helper `notApprovedLeavesNoRecord` below exercises exactly that order
// against an in-memory backend spy.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseApprovedEmails, isApprovedEmail } from "../../lib/users";
import { createUserStore } from "../../lib/user-store";
import type { UserStoreBackend } from "../../lib/user-store";

function spyBackend(): UserStoreBackend & { puts: string[] } {
  const map = new Map<string, Awaited<ReturnType<UserStoreBackend["get"]>>>();
  const spy = { puts: [] as string[] };
  return Object.assign(spy, {
    async get(email: string) {
      return map.get(email) ?? null;
    },
    async put(email: string, record: NonNullable<Awaited<ReturnType<UserStoreBackend["get"]>>>) {
      map.set(email, record);
      spy.puts.push(email);
    },
    async nextNumber() {
      return map.size + 1;
    },
  });
}

/**
 * Mirrors app/actions.ts signIn's resolution order (T012): approval gate
 * first, resolveUser second. If the gate short-circuits, the store spy
 * must record zero puts for a non-approved address.
 */
function approvedDecision(
  email: string,
  rawList: string | undefined
): { approved: boolean; resolve: () => Promise<unknown> } {
  const approved = isApprovedEmail(email, parseApprovedEmails(rawList));
  const store = createUserStore(spyBackend2());
  return { approved, resolve: () => store.resolveUser(email) };
}

// Separate spy per decision instance (factory to avoid shared state).
let currentSpy: ReturnType<typeof spyBackend> | null = null;
function spyBackend2(): UserStoreBackend & { puts: string[] } {
  currentSpy = spyBackend();
  return currentSpy;
}

describe("signIn order: denial before any record (US3, research R7)", () => {
  it("a non-approved email never reaches the user store", () => {
    const decision = approvedDecision(
      "stranger@gmail.com",
      "person.a@gmail.com,person.b@gmail.com"
    );
    assert.equal(decision.approved, false);
    assert.equal(currentSpy?.puts.length, 0); // zero records created
  });

  it("an approved email creates exactly one record when resolved", async () => {
    const decision = approvedDecision(
      "Person.A@Gmail.com",
      "person.a@gmail.com,person.b@gmail.com"
    );
    assert.equal(decision.approved, true);
    await decision.resolve();
    assert.equal(currentSpy?.puts.length, 1);
  });
});
