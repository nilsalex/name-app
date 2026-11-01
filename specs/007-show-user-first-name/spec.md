# Feature Specification: Show the User's First Name

**Feature Branch**: `007-show-user-first-name`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "show the users first name"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Signed-in user sees their own first name (Priority: P1)

A signed-in user opens the application and sees their first name displayed
somewhere persistent in the interface (e.g., a greeting or profile area near
the identity/sign-in affordance). The name shown is derived from the identity
the app already knows about — for the Gmail-based sign-in in this project,
that is the given name of the signed-in account. The user can confirm at a
glance that they are signed in as the right person, without opening any
settings or profile page.

**Why this priority**: This is the entire request: put the user's first name
in front of them. Nothing else in this feature matters until the name is
visible to the person it belongs to.

**Independent Test**: Sign in as user X in a fresh session; verify the
interface displays "X's" first name. Sign out and in as user Y; verify the
display switches to Y's first name.

**Acceptance Scenarios**:

1. **Given** user X is signed in, **When** X opens the application, **Then**
   X's first name is visible in the interface on the main view.
2. **Given** user X is signed in, **When** X reloads the page or returns in
   a later session, **Then** X's first name is still shown (not something
   generic).
3. **Given** user Y signs in on the same browser after X, **When** Y opens
   the application, **Then** the displayed first name is Y's, not X's.

---

### User Story 2 - Unauthenticated visitor sees no name (Priority: P2)

A visitor who is not signed in does not see a name. The interface shows the
existing sign-in option instead; no placeholder name, no "unknown user", and
no name belonging to any previous user of the same browser.

**Why this priority**: A correct signed-out state is required for the P1
story to be trustworthy, but it is a narrower slice than the name display
itself.

**Independent Test**: Use a browser with no active account; verify no first
name (and no stale name) is displayed anywhere, and the sign-in path is
still reachable.

**Acceptance Scenarios**:

1. **Given** no user is signed in, **When** a visitor opens the
   application, **Then** no first name is displayed.
2. **Given** user X was previously signed in on a device and has signed
   out, **When** a new visitor opens the application on that device,
   **Then** X's first name is not shown.

---

### User Story 3 - Name degrades gracefully when unavailable (Priority: P3)

Occasionally the app may not receive a usable first name from the sign-in
identity (e.g., the account has no given name on record). In that case the
interface must not show an empty string, raw email address by surprise, or
an error. It falls back to some sensible identity indicator consistent with
what the app already shows for identity.

**Why this priority**: Edge-case handling that keeps P1 honest, but it only
occurs for accounts lacking a given name.

**Independent Test**: Sign in with an account lacking a given name; verify
the interface shows a reasonable fallback (as agreed in Assumptions) rather
than a blank or a broken UI.

**Acceptance Scenarios**:

1. **Given** a signed-in account with no given name on record, **When** the
   user opens the application, **Then** the interface shows a sensible
   fallback identity indicator instead of a blank space or error.
2. **Given** a signed-in account, **When** the name cannot be retrieved due
   to a transient failure, **Then** the rest of the application remains
   fully usable and no error is shown to the user.

---

### Edge Cases

- What happens when the signed-in account has no first name on record? →
  Handled in User Story 3 (fallback, not blank/error).
- What happens when a user signs out and a different user signs in on the
  same device? → The name must always follow the currently signed-in user
  (User Story 1, scenario 3).
- What happens when a visitor has never signed in on a device that once
  displayed another user's name? → No name may be shown (User Story 2,
  scenario 2).
- What happens when the first name cannot be retrieved (transient failure)?
  → No error; the app stays usable (User Story 3, scenario 2).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST display the signed-in user's first name
  in the interface on the main application view.
- **FR-002**: The displayed first name MUST correspond to the currently
  signed-in user; it MUST never show a different (previous or other) user's
  name, and MUST NOT display any name when no user is signed in.
- **FR-003**: The first name MUST be derived from the user's existing
  sign-in identity; the feature MUST NOT require the user to type or confirm
  their name manually.
- **FR-004**: The first name MUST be available on initial page load (that
  is, visible without additional user actions) and on every subsequent page
  load for signed-in users.
- **FR-005**: When the first name is unavailable or cannot be retrieved, the
  application MUST show a sensible fallback identity indicator instead of a
  blank value or an error, and the rest of the application MUST remain fully
  usable.
- **FR-006**: The first name display MUST update when the signed-in session
  changes (after sign-out/sign-in), so the shown name always reflects the
  current session.

### Key Entities *(include if feature involves data)*

- **User**: The already-existing app user, identified by their sign-in
  identity. Relevant attributes: first (given) name, account identifier.
  This feature only reads the first name; it does not define new storage or
  new personal data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of signed-in users see their own first name (not a
  generic label or another user's name) on the first page they open.
- **SC-002**: The first name is visible within the normal initial page
  load — users can confirm who they are signed in as in a single glance,
  with no extra navigation.
- **SC-003**: 0% of signed-out visitors are shown any user's first name
  (no stale names from prior sessions on the same device).
- **SC-004**: In cases where the name is unavailable, 100% of users
  experience a usable interface with a sensible fallback and no error
  message about the missing name.

## Assumptions

- The app already knows the signed-in user's identity (per feature
  004-gmail-login and 005-multi-user-identity); this feature only surfaces
  the first name that identity already provides — no new sign-up or
  name-entry flow is in scope.
- The "first name" is the given name of the signed-in account (for Gmail
  sign-in, the account's given name). Where account systems provide a
  display name but no split first name, the first word of the display name
  is used.
- If no given name is available, the fallback is to show nothing in place
  of the name while keeping the interface consistent (i.e., no blank gap,
  no error); whether to fall back to the email or a generic label in that
  case is left to planning.
- There are exactly two real users (per the project constitution); profile
  editing, nickname preferences, and multi-locale name formatting are out
  of scope.
