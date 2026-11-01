# Feature Specification: Gmail Login

**Feature Branch**: `004-gmail-login`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "instead of selection person a or b, I want real login with a gmail address"

## Clarifications

### Session 2026-11-02

- Q: Who may use the app after login — any Gmail address, or only a fixed allowlist? → A: B — only the two pre-approved addresses may log in; everyone else sees a friendly "no access" message.
- Q: How should the vote record identify the user — the full Gmail address, or an internal alias? → A: B — votes are attributed to a stable alias (A or B) derived from the logged-in address, so existing ranking/winners data stays meaningful; the app displays only "Person A" / "Person B".
- Q: After signing out, where should the user land? → A: A — back on the login page with no active session; the identity choice (alias A/B) follows automatically from the logged-in address.
- Q: Where do the two approved Gmail addresses live — in committed config or as secret environment variables? → A: Secret environment variables — the addresses are stored like other credentials (never committed); the alias mapping address→A/B is part of that same secret configuration.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Log in with my Gmail address (Priority: P1)

A user opens the app. Instead of picking "Person A" or "Person B" from a
list, they see a login option that lets them sign in with their Gmail
address (Google account). After signing in successfully, they land directly
in the vote screen already identified as their known alias — no extra
identity selection step. The sign-in persists across visits: returning to
the app later, they are still logged in and go straight to voting.

**Why this priority**: This is the entire feature — without working login
there is no identity concept to build on. It replaces the manual identity
selection as the app's entry point.

**Independent Test**: Open the app in a fresh browser session, sign in with
an approved Gmail address, and verify the vote screen appears directly,
attributed to the correct alias; close and reopen the app and verify the
session is still active.

**Acceptance Scenarios**:

1. **Given** an unauthenticated visitor, **When** they open the app, **Then**
   they see a login screen with a "Sign in with Google" option (no Person
   A/B selection buttons anywhere).
2. **Given** the login screen, **When** the user signs in with an approved
   Gmail address, **Then** they land on the vote screen and the app shows
   their stable alias ("Person A" or "Person B") without further prompts.
3. **Given** a signed-in user, **When** they reload or revisit the app,
   **Then** they remain signed in and go straight to voting (no repeated
   login for the same browser session lifecycle until sign-out or expiry).

---

### User Story 2 - Votes are attributed to the real logged-in account (Priority: P2)

When a logged-in user votes, the vote is recorded against their real,
verified account. The alias (A/B) used for ranking display is derived from
their Gmail address, so votes can no longer be attributed to the wrong
person by mis-tapping the identity buttons — and ranking/winners pages
continue to work exactly as before.

**Why this priority**: Correct attribution is the point of replacing manual
selection with login; it is what makes the login more than a cosmetic
change. It builds directly on US1's session.

**Independent Test**: Sign in as alias A, cast a vote, and verify the vote
appears attributed to A in the persisted vote records and rankings; repeat
from an alias-B account and verify B attribution.

**Acceptance Scenarios**:

1. **Given** a signed-in user mapped to alias A, **When** they cast a vote,
   **Then** the recorded vote is attributed to A.
2. **Given** both aliases have voted previously, **When** the ranking or
   winners page is opened, **Then** it renders unchanged in format and
   semantics (same totals and shared-rank behaviour as before login).
3. **Given** a user signs in on a different device, **When** they vote,
   **Then** their alias attribution is identical (derived from the account,
   not the browser).

---

### User Story 3 - Sign out and access control (Priority: P3)

A signed-in user can actively sign out, which ends their session and
returns them to the login screen. Only the two pre-approved Gmail addresses
may proceed past the login screen; anyone else who tries is shown a clear
"no access" message and cannot vote.

**Why this priority**: Trust and hygiene — the ability to consciously end a
session and the guarantee that strangers cannot vote. It is a safety net
around US1 rather than a daily-use capability.

**Independent Test**: Sign in, sign out, verify the login screen returns and
the vote screen is unreachable without re-login; attempt access with a
non-approved Gmail address and verify it is refused with a friendly message.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they choose "Sign out", **Then**
   their session ends and they see the login screen again.
2. **Given** a signed-out user, **When** they attempt to reach the vote
   screen (e.g., via a bookmark), **Then** they are sent back to the login
   screen and cannot vote.
3. **Given** a Google account whose address is not on the approved list,
   **When** they complete the Google sign-in flow, **Then** they see a
   clear, friendly "no access" message and no vote UI is shown.

### Edge Cases

- What happens when the Google sign-in flow is interrupted (user closes the
  popup / cancels consent)? → The app returns to the login screen with no
  partial state; no vote possibility exists.
- What happens when a session expires while mid-voting? → The next action
  leads back to a re-login step; the in-flight UI resets cleanly, no vote is
  recorded under a stale identity.
- What happens to historical votes recorded under aliases A/B before login
  existed? → They remain attributed to A/B unchanged; alias derivation from
  the approved addresses must reproduce the same two identities so history
  stays consistent.
- What happens when the sign-in service is briefly unavailable? → The login
  screen explains the failure and offers a retry; the app never reveals vote
  content while unauthenticated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST replace the manual "Person A / Person B"
  selection screen with a sign-in flow as the only way to obtain a vote
  identity.
- **FR-002**: Users MUST be able to sign in using their Google (Gmail)
  account via the standard Google sign-in experience.
- **FR-003**: The system MUST grant access only to the two pre-approved
  Gmail addresses and MUST show a friendly denial message to any other
  account.
- **FR-004**: Each approved address MUST map deterministically to one fixed
  alias ("A" or "B"); the mapping MUST be an explicit, editable
  configuration (not the order of first login). The approved addresses and
  their alias mapping MUST live as secret environment variables (alongside
  the existing service credentials), never committed to the repository.
  A missing or malformed address configuration MUST fail fast with a clear
  error.
- **FR-005**: Vote records MUST be attributed to the alias derived from the
  logged-in account at vote time; ranking and winners MUST continue to work
  with the existing alias-based data unchanged.
- **FR-006**: The signed-in state MUST persist across reloads and revisits
  within the same browser until sign-out or expiry.
- **FR-007**: The signed-in state MUST NOT outlive a deliberate sign-out;
  after sign-out, no vote UI is reachable without re-login and the open
  session is terminated on the spot.
- **FR-008**: The user's email address or account details MUST NOT be stored
  in vote records or shown anywhere in the app; only "Person A"/"Person B"
  labels are displayed.
- **FR-009**: Unauthenticated access to any voting capability MUST be
  impossible (login gate in front of the vote screen).
- **FR-010**: If the login flow fails or is cancelled, the app MUST show the
  login screen again with a short, honest error hint and lose no state.

### Key Entities *(include if feature involves data)*

- **Account**: A person's real identity behind the login — a Gmail address
  plus the alias ("A" or "B") the app maps it to. Only two exist.
- **Session**: The signed-in state in a browser — exists from successful
  login until sign-out or expiry; determines whether vote UI is reachable.
- **Alias mapping**: Secret configuration (environment variables) that ties
  each of the two approved addresses to exactly one existing alias identity
  ("A" or "B"), preserving all historical vote attribution.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A returning approved user goes from opening the app to seeing
  their vote screen in under 5 seconds with zero identity-selection steps.
- **SC-002**: A first-time approved user completes sign-in within 60
  seconds.
- **SC-003**: 100% of votes after launch are attributed to the alias of the
  actually signed-in account (no vote can be cast under the wrong alias).
- **SC-004**: 100% of non-approved accounts that complete the Google flow
  are stopped at the login screen with the denial message.
- **SC-005**: Sign-out returns the user to the login screen and leaves no
  reachable vote UI in that browser afterwards.
- **SC-006**: Existing ranking and winners pages display identically to
  before the feature (no changes to totals, ranks, or shared-rank rules).

## Assumptions

- Only two real users exist: each is expected to sign in with their own
  Gmail address; the two approved addresses are fixed in configuration.
- The alias meanings ("A"/"B") stay exactly as they are today — login only
  changes *how* an identity is obtained, not what identities exist.
- The approved addresses are treated like other deployment secrets
  (environment variables in `.env.local` locally and the hosting
  platform's secret store in production); they are never committed.
- Google sign-in is used via Google's hosted login experience; the app does
  not build its own email/password system and does not send email.
- No personal data beyond "this address maps to alias X" is stored; vote
  records keep the existing shape (alias, names, timestamp).
- Historical votes remain validated by their existing alias attribution.
- Access control happens after Google's authentication so the approved-list
  check is based on a verified address, not a typed one.
- A missing or misconfigured address secret is an operator error to fix at
  deployment time, not a user-facing state; the app fails fast at startup
  rather than serving a broken login.
