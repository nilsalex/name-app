# Research: Self-Contained Visual Suite — No External Credentials (012)

Date: 2026-11-01. Resolves the open technical questions for making
`npm run visual` credential-free (FR-001…FR-008). Governing constraint:
Principle V simplicity; every 011 scenario and failure format must keep
working unchanged (FR-005); the production app must behave identically
when the suite-only configuration is absent (FR-004).

## R1: How is storage mocked — substituting the Upstash Redis client?

**Decision**: Slot an in-memory Redis (a `@upstash/redis` client whose
commands execute against plain `Map`/array state) through the store
layer's **existing** test seam. `lib/store.ts` and `lib/user-store.ts`
already isolate the client behind `_setClientForTests()` and the
`UserStoreBackend` interface respectively — the same seam the unit tests
use — so no new configuration layer and no abstraction are added.

Key mechanics verified against `@upstash/redis` 1.40.0 (as installed):

- `Redis` can be constructed over a **custom `Requester`** — the
  package's own documented pattern ("create a new redis client by
  providing a custom Requester implementation"). The requester receives
  `{ body: <command array>, path }` (a single command) or
  `{ path: ["pipeline"], body: [<command>, …] }` (a batch) and returns
  `{ result, error }` per command (pipeline: an array of such objects).
- The app issues exactly **9 verbs**: `xadd`, `zincrby`, `zrange (with
  scores)`, `hget`, `hset`, `hgetall`, `incr`, `scan (match/count)`,
  `del` — plus REST-level pipeline batching. Nothing else (verified by
  reading `lib/store.ts`, `lib/user-store.ts`, `app/actions.ts` and the
  011 seed's SCAN+DEL, which 012 no longer needs).
- The two command shapes that need care (probed empirically, probes
  deleted):
  - `zrange key 0 -1 withscores` → result is a **flat array**
    `[member, score, …]` (deserialized by upstash's own
    `deserialize4`-equivalent path — the fake returns it flat and
    `readZset` parses it as designed).
  - `hgetall key` → result is a **flat `[field, value, …]` array**
    (the SDK unflattens it into an object itself; `JSON.parse` happens
    inside the SDK's deserializer, so the fake stores/returns raw
    strings and lets the SDK behave identically to prod).
  - `scan cursor MATCH prefix:* COUNT n` → returns
    `[nextCursor, keys[]]`; the in-memory fake can simply return
    `["0", <all matching keys>]` in one hop (the emulator is empty or
    a few dozen keys — one batch is always sufficient, deterministic).
- `xadd` in this app is fire-and-forget inside a batched pipeline; the
  fake appends the parsed entry to an array and returns a fake stream
  id. `zincrby` mutates a `Map<string, Map<string, number>>` keyed by
  the exact key string the app derived (`<prefix>:...`). Because the
  fake keys its maps by the **full key string including prefix**, the
  two-tenant discipline (FR-006, never touch dev/prod data) is
  guaranteed structurally: the fake cannot see any other instance's
  state at all — it IS the only store in its process.

Injection timing: Next.js `instrumentation.ts` with
`export async function register()` and a
`process.env.NEXT_RUNTIME === "nodejs"` guard (bundled Next 16.4.3 doc
`01-app/02-guides/instrumentation.md`: `register()` runs **once when a
new Next.js server instance is initiated, and must complete before the
server is ready to handle requests**). `register()` imports the seam
initializer dynamically (the documented "importing files with side
effects" pattern) so nothing is loaded in other runtimes or when the
marker variable is absent. `sealSession`/module-level constants import
fine in instrumentation (it is Node server scope, not React-server
client scope — confirmed by importing `lib/session.ts` under plain
`--conditions=react-server`, which exports cleanly).

The env contract still requires `UPSTASH_REDIS_REST_URL/TOKEN` strings
to exist (`lib/env.ts` fail-fast); in suite mode they are set to
explicit DUMMY values (`https://mock.invalid`, `mock-token`) which are
never used for I/O because the real client is never constructed —
`_setClientForTests` replaces it before the first request. If the
injection ever failed, the first real store call would attempt a
connection to `mock.invalid` and fail loudly → C3.2 setup error, never
a silent fallback (edge case 2 of the spec). The startup self-check
below (R4) makes that impossible in practice.

**Rationale**: Reuses two seams that already exist and are already
proven by 141 unit tests; zero app behavior change without the marker
variable; the fake is ~100 lines for the verified 9-verb subset — less
code than any local-server alternative (container, miniredis port,
redis-mock npm package) and with fewer moving parts.

**Alternatives considered**:

- *Real local Redis (docker / redis-server binary)* — rejected: new
  infrastructure to install/maintain on every contributor machine
  (spec Assumption: "no docker or external test infrastructure"); 
  heavier than the code it replaces; violates free-plan/simplicity
  principle spirit for a two-user toy app.
- *Existing npm emulators (`redis-memory-server`, `ioredis-mock`)* —
  rejected: new dependency (Principle V: "Every new dependency MUST be
  justified"); the app's protocol surface is the REST wire format, not
  RESP, so RESP emulators would still need a shim — we would add a
  dependency to then write nearly the same shim anyway.
- *Playwright `page.route()` interception of store traffic* — rejected:
  votes are server actions (opaque POST bodies over HTTP), intercepting
  at the browser level fakes responses rather than state and therefore
  cannot serve `/ranking`/`/winners` reads without re-implementing the
  app logic in the test — strictly more complexity and less realism
  (violates FR-005 spirit).
- *Full protocol-level miniredis-style RESP/Webdis server* — rejected:
  implements a protocol subset far beyond the app's 9 verbs; the REST
  `Requester` seam is narrower and internal-first.

## R2: How is sign-in exercised without Google?

**Decision**: Keep the app's real `signIn` server action as the single
authentication path; make its single external dependency —
`verifyGoogleIdToken` (which performs the HTTP call to Google's
tokeninfo endpoint) — **injectable**, exactly the pattern the action
already supports in the opposite direction (`signIn(idToken,
verifyDeps?)` already threads an injected `fetchTokenInfo` dep for
tests). The production value is unchanged: when no injection is passed,
the default real verifier runs and nothing else changes. In suite mode,
`verifyGoogleIdToken` is called through the injected parameter with the
suite's fixed identity (approved suite email + display firstName),
returning `ok: true` — so the app then executes its REAL post-auth
logic down the line: `assertAuthConfigured`, approved-email check,
`resolveUser` minting the persistent user record in the (fake) store,
`sealSession` signing the REAL cookie format with the suite's real
SESSION_SECRET, and `cookies().set` of the httpOnly session cookie.

Delivery of the signed-in state to the browser: a suite-only HTTP
endpoint `POST /internal/visual-signin` (added in the Next.js
`app/internal/visual-signin/` tree under the App Router), whose handler
existence is keyed by the marker variable: when
`VISUAL_MOCK_EXTERNAL=1` set, the route exists (file exists and its
handler checks the marker as a second guard) and calls the injected
sign-in flow; the file checks the marker at request time and returns
404 otherwise. The endpoint is bounded by: (a) Next dev binds to
127.0.0.1 (suite boots it with `--hostname 127.0.0.1`), (b) the marker
variable only ever exists in the suite's own server invocation
(`harness.ts` sets it explicitly in the child process env), (c) the
route file is trivially auditable as test-only. It is NOT compiled into
production reachability in any other case; the path cannot be reached
from a normal `npm run dev` (no marker) or deployed app (no marker; and
its handler returns 404 there). It is guarded twice, so accidental
`npm run visual` against a misconfigured env still fails closed.

The suite's global-setup obtains the session via this endpoint with a
single `fetch` + `Set-Cookie` capture, then stores it as a Playwright
storageState file (the exact mechanism 011 already uses to persist the
Google session) — zero scenario changes. **The endpoint always runs per
suite boot, overwriting the storage state** — bounded overwrite, no
manual delete step, no staleness class at all (an edge the 011 reuse
step could theoretically hit with its 24-hour freshness window; 012's
always-overwrite + real-secret signing makes storageState staleness
observable as a guaranteed-fresh state every run). Sign-in cost per
boot: one localhost HTTP POST — microseconds — versus a multi-second
Google round trip; SC-002 budget improves.

The suite identity is a **fixed record**: email `visual-suite@nameapp.invalid`
(normalized by existing `parseApprovedEmails` logic — an `.invalid`-TLD
address that can never correspond to a real Google account), display
firstName `Visueller Tester` matching feature 007's first-sign-in
firstName capture so the suite verifies the same signed-in UI
composition production users see. `APPROVED_EMAILS` in the suite env
contains exactly this identity. The suite's user record (uid, display
number, firstName) is minted by the REAL `resolveUser` on first
sign-in into the fake store, per-boot reset makes numbering
deterministic (`Person 1` for `Person` fallback when the suite env does
not include first names) — identical per run (SC-004 determinism).

Security (spec edge case 4): the local sign-in path only exists in the
suite's server process; it only issues sessions for the suite's own
approach-listed identity (the suite approves exactly one address — the
suite's own); the production sign-in path (GIS button → real
`verifyGoogleIdToken`) is untouched (FR-004 verified by reading the
unchanged `app/actions.ts` default branch — the injected parameter
defaults to the unchanged real implementation and no call site other
than the internal route can pass the injection).

**Rationale**: The app still grants the session through its own real
code path (real verify → resolveUser → sealSession → cookie set), so
"the screen a signed-in user sees" is verified end-to-end — not a
rendering shortcut (spec US2 acceptance scenario 3). One optional
parameter + one ~30-line route + storageState reuse is the simplest
mechanism that satisfies US2's three acceptance scenarios.

**Alternatives considered**:

- *Manually minting the cookie in the SUITE process using `sealSession`
  imported from `lib/`* — rejected: 011's own research already rejected
  this ("duplicates `sealSession` logic outside the app"); more
  importantly it skips the REAL resolveUser/cookie-set flow — the
  browser would hold a valid cookie but the user record would never be
  created by the app path, breaking `/ranking`/`/winners` realism and
  violating US2-3.
- *A test-only sign-in server action gated by an env flag inside
  `app/actions.ts`* — rejected: 011's research R2 rejected an
  "app-code test hook" of this shape; the code would live in a file the
  production app ships and executes. The 012 spec permits a local
  mechanism only (FR-003) — the agent revisited this: an injected
  dependency is not a backdoor when the production caller never passes
  it and the default IS the production behavior; the delivery route is
  separate rather than embedded in the production action.
- *Keeping Google sign-in but with a test Google account + headed
  browser (011 status quo)* — rejected by the spec itself (FR-003:
  "no Google"); it is the exact brittleness this feature removes.
- *Browser-level fake (route-intercept the GIS iframe and stub
  `window.google`)* — rejected: verifies a rendering shortcut
  (spec US2: the suite must "still start from the real signed-in state
  — not a faked rendering"); also fragile against GIS's own changes to
  its iframe/popup protocol — the exact brittleness being removed, in a
  new costume.

## R3: How is the per-run reset ("created fresh, discarded after") realized?

**Decision**: The mock store is **module-session state inside the dev
server process**, which the suite creates and destroys by construction:
`harness.ts` boots the dev server per run (existing C1.3 behavior) and
kills it at teardown (existing global teardown). A fresh server process
holds an empty store naturally — the reset is the boot itself. The
011-era SCAN+DEL seeding code (which required live Upstash credentials
and network) is removed, as is the SEPARATE `seed.ts` Upstash client —
the file shrinks to a pure marker-var environment loader with the same
C3.2 fail-fast reporting shape. Additional keys that could outlive the
server are impossible: the store lives only in memory of a process
whose lifecycle equals the run. No artifact is discarded because no
artifact persists (FR-002's "discarded afterwards" is satisfied
structurally, not by cleanup code).

For in-run isolation (parallel-ish scenario ordering), nothing
changes from 011: the suite is single-worker (`workers: 1`),
scenarios vote and read within one run and the store holds one user's
data (the suite identity). Determinism (SC-004) is preserved: boot
empty → first sign-in mints uid + display number deterministically →
the vote scripts run exactly as in 011.

**Rationale**: Simplest possible reset semantics — lifecycle-scoped
state; removes 80 lines of seeding code and the possibility of
last-run contamination entirely.

**Alternatives considered**:

- *Reset-by-command (delete keys between scenarios)* — rejected:
  unnecessary machinery for state that dies with the process; extra
  code for an edge that cannot occur.
- *File-backed local store (JSON on disk, cleaned in teardown)* —
  rejected: crash-leaves-garbage edge cases + cleanup code + on-disk
  artifacts; the in-process version has no failure surface (edge case 2
  from the spec: "What happens if the local store mechanism fails to
  start?" — with in-process storage, store-startup failure IS dev
  server startup failure, already reported by the C1.3/C3.2 path).

## R4: How are the new setup failures surfaced distinct from guarantee failures (FR-007)?

**Decision**: Reuse 011's C3.2 contract exactly, plus explicit new
named setup errors. Three categories in `harness.ts` /
`instrumentation.ts` / the internal route:

1. **Missing marker variable** (someone runs the suite with an env
   lacking `VISUAL_MOCK_EXTERNAL=1`): setup error naming the variable
   and the fix (C3.2 shape, same `[visual-setup]` prefix 011 uses).
2. **Mock boot self-check** (can't happen in practice but must fail
   closed): after the server responds, the suite's global-setup
   performs a canary store write/read via the app HTTP surface (the
   internal sign-in POST, which itself performs a real resolveUser
   and therefore a real store write + read) and asserts a
   deterministic response — any deviation is a setup error naming the
   likely fix. Because the marker variable is double-checked by both
   instrumentation and the route handler, this canary asserts the
   full chain end-to-end instead of trusting either guard alone.
3. **Internal sign-in endpoint unreachable / returned non-OK in suite
   mode**: setup error distinct from sign-in guarantee failures and
   naming the fix (verifying the marker variable is set in the dev
   server environment), again C3.2 shape.

The internal route returns 404 with a setup-adjacent JSON body when
called without the marker variable — a hard failure in the suite's
own canary path (it always checks response status), and unreachable
noise for anything else. Port-occupied and server-not-ready messages
are unchanged from 011 (verified: those failures already precede any
mock interaction and keep their exact 011 message text).

**Rationale**: The only NEW failure modes are in setup; the old ones
are unchanged in exactly the format 011 fixed (already audit-cleaned
per 011 T014); FR-007 satisfied without touching any guarantee's
message text (FR-005).

## R5: Marker variable and .env.local reconciliation — a single source of truth

**Decision**: One new environment variable: `VISUAL_MOCK_EXTERNAL`
(uppercase, `1` = suite mode). `harness.ts` loads `PORT` from
`.env.visual` (file stays gitignored but now ships as a committed
template under `tests/visual/env.visual.template`, tracked in git;
011's dynamic-load helper keeps its same fail-fast semantics but the
required-var list shrinks to `PORT` + `VISUAL_MOCK_EXTERNAL` + the
auth chain `APPROVED_EMAILS` / `SESSION_SECRET` — the Upstash URL and
token are replaced by the fixed dummy values the harness sets itself
in the child env, since they are no longer suite inputs), and
`global-setup.ts` produces the child env:

```text
STORE_KEY_PREFIX := 'namewahl-visual-test' (unchanged constant, no longer env-driven in suite mode)
UPSTASH_REDIS_REST_URL := 'https://mock.invalid' (dummy, never I/O)
UPSTASH_REDIS_REST_TOKEN := 'mock-token'        (dummy)
VISUAL_MOCK_EXTERNAL=1
PORT, APPROVED_EMAILS, SESSION_SECRET (from .env.visual; SESSION_SECRET still validated ≥32 bytes)
GOOGLE_CLIENT_ID: not required and not set in suite mode — the GIS login screen is never rendered by a signed-in suite run
```

Deletion of the real-credential rows of `.env.visual` (google client
ID, real Upstash URL/token, test e-mail/password) is safe: those were
never used by anything other than `tests/visual/`; resolved in R2 —
the suite does not touch them. A `.env.local` (the personal dev file)
is never read by the suite: harness sets every child-env key
explicitly, and Next's `.env.local` auto-loading — which could leak
personal credentials into the suite server — is neutralized by the
explicit child-env keys winning (Next gives precedence to variables
already present in the environment — see bundled doc
`01-app/02-guides/environment-variables.md` ordering table: real
environment variables win over `.env.local`). The marker variable
itself is the distinguishing flag for SC-006 (production identical):
`lib/` reads no marker-only value and production never sets it.

**Rationale**: One variable carries the whole suite-mode contract;
everything else is a renamed shell of what 011's env already required,
so no suite user-visible behavior changes beyond removing the
credential burden.

**Alternatives considered**:

- *Auto-detect "no credentials present" → implicitly mock* — rejected:
  implicit behavior split into an accidental contract (SC-006 demands
  production/dev NOT change behavior when config is absent — an
  auto-detect in app code world make presence-vs-absence a lever in
  production too); an explicit flag keeps the two worlds
  independently auditable.
- *Per-suite config file (JSON/YAML) instead of env vars* — rejected:
  Next reads env vars at app boot and the store/auth seams both read
  `process.env`; introducing a second config channel for three values
  adds a parser+sync layer for no isolation gain (Principle V).

## R6: What EXACTLY does the in-memory fake implement? (contract check per command)

**Decision** (verified against SDK 1.40.0 command classes and probed):

| App call site | Command issued (REST body) | Fake behavior |
|---|---|---|
| `recordVote` (store.ts) | pipeline: `xadd <prefix>:votes * <fields…>` + `zincrby <prefix>:scores 1 <winner>` + `zincrby <prefix>:user:<uid>:scores 1 <winner>` | execute in order on the same maps; append `{id, fields}` to a stream array; `zincrby` on missing member initializes at 0 then += 1; return per-command results (pipeline: array of `{result, error}`) |
| `scores()` | `zrange <prefix>:scores 0 -1 withscores` | flat `[member, score, …]` in ascending score order then insertion order for ties (crude: all app readers re-sort via `rankNames` — order irrelevant; determinism via sort at write time) |
| `userScores(uid)` / `userSeen(uid)` | `zrange <prefix>:user:<uid>:scores|seen 0 -1 withscores` | same flat-array shape |
| `bumpUserSeen` | pipeline of N × `zincrby <prefix>:user:<uid>:seen 1 <name>` | same zincrby path |
| `resolveUser` user-store | `hget <prefix>:users <email>` → string or null | object-shaped JSON strings stored as-is in `usersHash = Map<string, string>` |
| `resolveUser` user-store | pipelineless `hset <prefix>:users <email> <json>` | set; return 1 |
| `resolveUser` user-store | `incr <prefix>:users:nextnum` | ++counter; return numeric |
| `findUserById` user-store | `hgetall <prefix>:users` | flat `[field, value, …]`; missing key → empty array (SDK deserializes to `{}` / null identically to prod behavior — verified by probe: returning `{}` object yields `{}`) |
| (defensive) | `del key…` | remove keys; return count |
| (defensive) | unknown verb | throw an explicit internal error naming the verb, loud and immediate (append the C3.2 report; an app using a new verb unbeknownst to the fake is a dev-time failure of the fake, caught within the first suite run — never silent wrong data) |

Stream (`votes`) content is append-only and never read back by app code
in the current production path (audit trail; the ranking reads zsets).
The fake keeps it for fidelity (future xrange support would be a
2-line addition), not because any test needs it.

Beyond the table: no TTL handling, no WATCH/Lua, no pubsub — the app
never issues them (verified across `lib/store.ts`, `lib/user-store.ts`,
suite seed, all actions on the sign-in path). Types: no `any`; the
requester's `UpstashRequest`/`UpstashResponse` types come from the SDK
surface (exported per `nodejs.d.ts` and the root barrel re-export).

**Rationale**: The fake is exactly as wide as the app; nothing more
gets forked or maintained.

## R7: What is verified empirically / what stays as bring-up checks?

**Empirically verified during planning** (probes run, then deleted):

- Custom-`Requester` construction works and pipeline requests carry
  `path: ["pipeline"]` with an array-of-command-arrays body; per-command
  result shape is `{ result, error }` (array result for pipeline).
- `zrange … withscores`, `hgetall` deserialization shapes are as the
  fake must return them.
- `scan` returns `[cursor, keys]` regardless of the source, so a
  one-hop fake is shape-compatible.
- `lib/session.ts` exports cleanly in the Node (non-React) scope —
  instrumentation may import it.

**Left for tasks.md as bring-up verification** (per Constitution III —
test-first, and 011's precedent that a suite validating itself is its
own gate):

- SC-001 network-isolation proof (run with external egress blocked —
  011-era mechanism, unchanged).
- SC-004 10× determinism run.
- SC-003 regression-injection matrix (unchanged — the exact scenarios
  from 011 quickstart C still produce the same failures under mock
  mode because the mock layer does not touch layout or CSS).
- SC-006 manual check that `npm run dev` + human sign-in is unchanged
  (no `VISUAL_MOCK_EXTERNAL` in any non-suite path — code-read
  verification, plus the missing-marker 404 path on the internal
  route).

## Summary of decisions

| # | Decision | Key alternative rejected |
|---|---|---|
| R1 | In-memory fake Upstash Redis behind existing test seam via custom `Requester`, wired in `instrumentation.ts` | docker/local redis, npm emulators, browser-level interception |
| R2 | Real `signIn` action with injectable verifier; suite-only `POST /internal/visual-signin` (marker-gated) issues the REAL session; storageState reuse as in 011; always overwrite per boot | manual cookie minting outside app; app-embedded flag backdoor; kept-Google flow |
| R3 | Per-run reset = dev-server process lifecycle; seed.ts shrinks to env-loader | reset-by-command; file-backed store |
| R4 | C3.2-named new setup errors: missing marker, mock-boot canary, endpoint unreachable | silent fallbacks; overloading guarantee failures |
| R5 | One new env `VISUAL_MOCK_EXTERNAL`; dummy upstash pair; `.env.visual` as tracked template | auto-detection; per-suite config file |
| R6 | Exact 9-verb command surface with documented shapes; loud unknown-verb failure | RESP/Webdis server; TTL/Lua support |
| R7 | Probes deleted; 10×/injection/isolation checks remain bring-up tasks | — |
