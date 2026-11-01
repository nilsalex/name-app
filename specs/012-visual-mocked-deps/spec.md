# Feature Specification: Self-Contained Visual Suite — No External Credentials

**Feature Branch**: `012-visual-mocked-deps`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "can we not run visual tests with test redis and test auth? there must be good solutions to mock these/provide in-memory solutions/whatever"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run the visual suite with zero credentials (Priority: P1)

As the maintainer, I run the visual verification suite (`npm run visual`)
on a freshly cloned repository — without creating `.env.visual`, without
Upstash credentials, and without a Google account — and the suite runs
the full vote-screen scenario set (the core 008–010 layout guarantees at
the portrait profiles) and exits green or fails exactly as before.

**Why this priority**: This is the entire point of the feature: the
suite currently hard-blocks on credentials the maintainer must hand-fill
(Upstash URL/token, Google client ID, a real Google sign-in identity).
Removing that block makes the suite runnable anywhere, any time, and
unblocks the pending bring-up tasks of feature 011.

**Independent Test**: Delete (or rename) `.env.visual`, run the suite —
it must come up, render the signed-in vote screen, and assert the
guarantees with no network dependency beyond localhost.

**Acceptance Scenarios**:

1. **Given** a repo checkout with no `.env.visual` and no stored browser
   state, **When** the maintainer runs the visual suite, **Then** the
   suite completes all vote-screen scenarios with real rendered output
   and no credential-related setup errors.
2. **Given** the same credential-free environment, **When** the suite
   writes votes/reads pool state during the run, **Then** all data lives
   in an in-process (or local) store that is created fresh per run and
   discarded afterwards — no external service is contacted for storage.
3. **Given** an intentionally broken layout (the existing SC-003-style
   regression injections), **When** the suite runs, **Then** it fails
   with the same guarantee + profile + numbers messages as before —
   mocking the dependencies must not weaken the assertions.

---

### User Story 2 - Sign-in is exercised without Google (Priority: P2)

The suite still verifies what a signed-in user sees, but the sign-in
step no longer depends on Google Identity Services or network access to
accounts.google.com. The suite obtains a valid signed-in browser state
(the session the app itself would set) through a local mechanism, in a
way that keeps the production sign-in path untouched for real users.

**Why this priority**: The visual suite's subject is layout, not auth;
Google sign-in is the most brittle and slowest bring-up step (headless
Chromium challenges, popup flows, consent screens). But the suite must
still start from the real signed-in state — not a faked rendering — so
the vote screen renders exactly as production users see it.

**Independent Test**: Run the suite's sign-in step in isolation: it
produces a browser session state that, when the suite loads the home
page, shows the signed-in vote screen (not the login screen).

**Acceptance Scenarios**:

1. **Given** no Google credentials of any kind, **When** the suite
   performs its sign-in step, **Then** the subsequent scenarios render
   the signed-in vote screen (pair buttons visible), identical to what a
   real signed-in user sees.
2. **Given** the production deployment or `npm run dev` used by humans,
   **When** a user signs in, **Then** the sign-in flow is unchanged —
   the mock/local mechanism is visible to the visual suite only and
   cannot be triggered by normal users or from the deployed app.
3. **Given** the signed-in session obtained by the local mechanism,
   **When** the user casts votes, **Then** votes are recorded (ranking
   and winners screens reflect them) within the same isolated local
   store — the session is a real session, not a rendering shortcut.

---

### User Story 3 - Remaining screens stay covered without external services (Priority: P3)

The full-screen coverage of feature 011 (logged-out home, ranking,
winners, landscape, tablet/desktop, notice stability) keeps working in
the credential-free mode: the screens read from the local store, the
failure-notice scenario still produces real failed votes (through local
request interception, as before), and screenshots for the judgment
review are produced exactly as before.

**Why this priority**: Completes parity with feature 011's assertion
surface so the credential-free run is a full replacement, not a
degraded subset.

**Independent Test**: Run the whole suite credential-free; confirm every
scenario from feature 011's contract table (C2.1–C2.7) executes and
screenshots are written.

**Acceptance Scenarios**:

1. **Given** the credential-free suite, **When** the /ranking and
   /winners scenarios run after ≥1 vote, **Then** they show the user's
   personal tallies from the local store.
2. **Given** the credential-free suite, **When** the notice-stability
   scenario aborts vote requests and then releases them, **Then** the
   persistent notice appears/dismisses and the box-geometry assertions
   hold as before.
3. **Given** a green credential-free run, **When** the maintainer opens
   the screenshots directory, **Then** the full expected screenshot set
   exists, overwriting per run.

### Edge Cases

- What happens when the visual port is already occupied? Same named
  setup error as before (unchanged from 011).
- What happens if the local store mechanism fails to start? The suite
  fails fast with a setup error naming the fix (C3.2 format) — it must
  never silently fall back to an external service.
- What happens when the production app is accidentally started with the
  suite-only configuration? The app must behave identically to today
  (its defaults unchanged); the local mechanisms are opt-in via
  suite-only configuration and must not alter behavior when absent.
- Does the sign-in mechanism weaken security? The local sign-in path
  must only exist in the suite's server process (never reachable in the
  deployed app or default dev server), and must only issue sessions for
  the suite's own test identity.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The visual suite MUST run its complete scenario set with
  no external service dependencies: no Upstash Redis, no Google
  services, no network egress beyond localhost.
- **FR-002**: The suite MUST provide storage for votes/tallies/seen/
  user records through an in-process or local-only store that starts
  empty on every suite run (per-run reset equivalent to 011's key-prefix
  reset) and is discarded after the run.
- **FR-003**: The suite MUST obtain a signed-in browser state through a
  local mechanism (no Google), such that all signed-in scenarios render
  the real signed-in UI; the mechanism MUST NOT be reachable from the
  production deployment or from a normally started dev server.
- **FR-004**: The production application code MUST keep its default
  behavior when the suite-only configuration is absent — real users'
  sign-in, storage, and rendering are unchanged.
- **FR-005**: Every scenario and failure format from feature 011's
  assertion contract (C2.1–C2.7, C3.1/C3.2) MUST keep working unchanged
  in credential-free mode; the mock layer must not alter what is
  measured or how failures are reported.
- **FR-006**: The suite MUST continue to write only to its own outputs
  (screenshots, its local store) and never to development or production
  data.
- **FR-007**: Setup failures in the new local mechanisms (store failure,
  sign-in mechanism failure, port occupied) MUST be reported as distinct
  named setup errors (C3.2 format), never as guarantee failures.
- **FR-008**: The single-command entry point MUST remain unchanged
  (`npm run visual`) with no required arguments and no manual
  preparation steps beyond installing dependencies and browsers.

### Key Entities *(include if feature involves data)*

- **Local vote store**: suite-scoped storage for the same logical data
  the app keeps (vote records, per-user win tallies, seen frequencies,
  user records); created empty at run start, discarded afterwards; not
  reachable from any other process.
- **Suite test identity**: the fixed signed-in identity the suite uses
  (a user record with a display label, like any app user); exists only
  inside the suite's store.
- **Local session**: a real app-format signed session for the suite test
  identity, obtained by the local sign-in mechanism; indistinguishable
  from a production-session format so the app renders its true
  signed-in state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a clean checkout with no credential files, the suite
  runs to completion (green on the unchanged layout) with zero network
  egress beyond localhost — verified by running the suite with external
  network access disabled.
- **SC-002**: The credential-free suite completes within the same
  runtime budget as 011 targeted (under 2 minutes, excluding one-time
  bring-up).
- **SC-003**: Injecting each known layout regression still fails the run
  with the exact 011 failure format (guarantee + profile + numbers).
- **SC-004**: The suite passes 10 consecutive runs with identical
  per-profile summaries (determinism preserved).
- **SC-005**: Zero bytes are written to any external store or third
  party during the run (the production Upstash instance and Google are
  never contacted).
- **SC-006**: A human running the app normally (dev or production) sees
  zero behavioral difference: the local mechanisms are undetectable
  outside the suite.

## Assumptions

- The visual suite's subject is rendered layout; mocking storage and
  sign-in does not reduce what the suite verifies, because both mock
  layers produce the same observable app state (real session cookie,
  real store reads/writes) that production would.
- The production sign-in path (Google Identity Services) stays as-is for
  real users; this feature only adds a suite-local way to reach the
  signed-in state.
- The app's existing configuration seam for storage (key prefix from
  environment) and its session format are reused rather than changed;
  any new mechanism must be additive and suite-scoped.
- "Local" means same-machine in-process or localhost-only; no docker or
  external test infrastructure is introduced (free-plan, simplicity
  constitution).
- If a trade-off arises between realism (exercising the real Redis
  client code) and self-containment, self-containment wins: unit and
  integration tests already cover the store logic; the visual suite
  covers layout.
