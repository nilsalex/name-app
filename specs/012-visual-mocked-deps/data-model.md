# Data Model: Self-Contained Visual Suite — No External Credentials (012)

Date: 2026-11-01.

## Application entities

**None new.** No production data model changes: keys, records, vote
shape, sessions and user records are unchanged (features 001–007
data-models remain the app's model). This feature wires alternative
backing into existing seams and adds one suite-owned identity record.

## Suite-side entities (live only inside the suite's own server process)

### Mock-mode marker

| Aspect | Value |
|---|---|
| Name | `VISUAL_MOCK_EXTERNAL` |
| Type | environment variable, `"1"` = suite(mock) mode |
| Set where | exclusively in the dev-server child process the suite boots (`harness.ts` global-setup/spawn env) |
| Read where | `app/instrumentation.ts` (store injection) and `app/internal/visual-signin/route.ts` (endpoint enablement) — one guard each, both checked |
| Absent behavior | app byte-identical to today (SC-006, FR-004) |

### In-memory fake store (`app/fake-store.ts`)

Suite-scoped storage implementing the same logical data the app keeps,
through the `@upstash/redis` `Requester` interface. Created empty when
`register()` wires it (mock mode only); lives in the dev server's
process memory; discarded when the process dies at suite teardown
(structural per-run reset, research R3).

State held (all keyed by the full internal key string, prefix
`namewahl-visual-test:` included):

| Internal map | Redis shape emulated | Written by | Read by |
|---|---|---|---|
| `zsets: Map<key, Map<member, score>>` | sorted set | `zincrby` (votes/user tallies/seen) | `zrange … withscores` (flat result) |
| `hashes: Map<key, Map<field, string>>` | hash | `hset`/`hget` (user records) | `hget`/`hgetall` |
| `streams: Map<key, {id, fields}[]>` | stream | `xadd` (vote audit) | none (future-proofing) |
| `counters: Map<key, number>` | string counter | `incr` (display numbers) | `incr` return |
| scan index | — | derived: keys filtered by MATCH pattern | `scan` |

Command surface = exactly the app's 9 verbs (research R6 table):
`xadd`, `zincrby`, `zrange(withscores)`, `hget`, `hset`, `hgetall`,
`incr`, `scan(match/count)`, `del`; batching via the REST pipeline
shape (`path: ["pipeline"]`). Unknown verb → immediate throw (loud
failure surfaces through C3.2, never wrong data).

Validation rules inherited unchanged: per-user key derivation still
runs `isUserIdShape` (lib code), emails still normalized by
`parseApprovedEmails`, session still HMAC-verified — the fake sits
under the app's logic, replacing only the wire.

**State transitions**: none across runs (fresh per boot). Within a
run: same flow as production — empty → user record minted at first
sign-in (`resolveUser`) → votes appended to tallies/seen/stream →
ranking/winners are pure reads of the same maps. Never touches
anything outside its own process.

### Suite test identity

The fixed signed-in identity for every run:

| Aspect | Value |
|---|---|
| Email (lookup key only) | `visual-suite@nameapp.invalid` — `.invalid` TLD, can never be a real Google account |
| Display firstName (feature 007) | `Visueller Tester` — captured by `resolveUser` at first boot of each run (deterministic per-run since store resets) |
| Internal uid | minted by the real `generateUserId()` per run — 22-char base64url, opaque, session-bound |
| Approval | the only entry in `APPROVED_EMAILS` in the suite env |
| Persistence | lives only in the per-run fake store — no credential, no external identity, no Python-for-profile session |

### Local session (Real app-format session for the suite identity)

Indistinguishable in shape, signing and cookie semantics from a
production session — produced by the app's real `sealSession` with a
real ≥32-byte SESSION_SECRET, set by the real `cookies().set`:

| Aspect | Value |
|---|---|
| Cookie name | `namewahl_session` (unchanged constant from `lib/session.ts`) |
| Payload | `{ uid: <suite uid>, iat: <boot-epoch-ms> }` — same shape as production, verified by the same `verifySession` |
| Acquisition | suite `global-setup` POSTs to the mock-mode endpoint and captures the response cookie into Playwright storageState |
| Lifetime/storage state | saved per suite boot; overwritten every boot (bounded overwrite; no staleness or reuse-risk class) |
| Signed-out handling | identical to 011: clearing cookies yields the real logged-out login screen (unchanged C2.4 scenario) |

Multi-user state (two user identities coexisting) is out of scope:
the suite has exactly one identity, matching the app's real-family
concurrency model for the voting flow (no session multiplexing is
needed by any C2 scenario).

### Internal endpoint (mock-mode sign-in delivery)

| Aspect | Value |
|---|---|
| Route | `POST /internal/visual-signin` — ui-visible surface for the suite only |
| Registered when | file exists in the route tree, but its handler checks the marker variable and returns 404 unless set — double-guarded (file + marker) |
| Reachability in production | 404 (missing marker) + no marker in child-process env + dev binds only 127.0.0.1; the suite boot is the only process where all three align |
| Request semantics | no parameters, no body — always authenticates the fixed suite identity |
| Response | HTTP 200 (identity resolved through the app's real signIn-equivalent path, session cookie set by `cookies().set`) or the 404 path above |

## Relationships

```text
Suite boot (harness global-setup)
  ├─ loads .env.visual { PORT, VISUAL_MOCK_EXTERNAL, APPROVED_EMAILS, SESSION_SECRET }
  ├─ spawns `next dev {--port, --hostname 127.0.0.1}` with child env:
  │    + VISUAL_MOCK_EXTERNAL=1, dummy Upstash pair, STORE_KEY_PREFIX constant
  │      (marker absent → production-identical behavior; separate mode)
  ├─ Next server start → app/instrumentation.ts register()
  │    └─ VISUAL_MOCK_EXTERNAL=1 ⇒ in-memory fake store wired through
  │       lib _setClientForTests (per-run reset = empty Map state)
  ├─ POST /internal/visual-signin (canary: asserts 200 + Set-Cookie)
  │    └─ real sign-in path: resolveUser (fake store write) →
  │       sealSession → cookies().set → 200 + Set-Cookie
  │       (mock-mode signin action injects the fake-verifier dependency;
  │        everything else is the production code path)
  └─ storage state {cookie namewahl_session} → all scenarios behave
     identically to 011 against the same C2 guarantee families
```

## Tolerances / invariants

| Invariant | Source |
|---|---|
| `GEOMETRY_TOLERANCE_PX = 1` (unchanged metric contract) | 011 profile module, unchanged |
| Suite failures never result in app-visible data outside the suite's own keyspace | fake store structurally holds one keyspace (`namewahl-visual-test` prefix usered keys assigned at boot) |
| Every signed-in screen equals a production signed-in screen | same sealSession format, same real store read/write shapes, same resolveUser record mint |
