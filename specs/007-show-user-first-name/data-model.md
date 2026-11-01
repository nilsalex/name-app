# Data Model: Show the User's First Name (007)

Date: 2026-11-01. Only entities this feature creates or changes are listed.
Source of truth for behavior: [spec.md](./spec.md); derivation decisions in
[research.md](./research.md).

## Entities

### UserRecord (CHANGED — one optional field)

Stored in the existing Redis hash `namewahl:users`, field = normalized
email (unchanged shape, value JSON gains an optional key).

| Field | Type | Status | Description |
|---|---|---|---|
| `id` | `string` | unchanged | Internal user ID (22-char base64url), opaque, never email-derived. |
| `num` | `number` | unchanged | Sequential display number; powers fallback "Person N". |
| `createdAt` | `string` | unchanged | ISO timestamp of first sign-in; never displayed. |
| `firstName` | `string` \| absent | **NEW, optional** | Verified given name captured from the sign-in tokeninfo response (research R1/R3). Written **once** at first sign-in (creation path of `resolveUser`); immutable afterwards, matching `id`/`num` semantics. Empty strings are never stored (absence means "no name"). |

Validation rules:
- On capture: derived only from a **verified** token response
  (`given_name`, else first word of `name`, research R3); trimmed;
  non-empty — otherwise the field is left absent (never stored as `""`).
- On display: only rendered for the record matching the current session's
  uid (FR-002); presence of the field alone is not sufficient — the
  session gate is the authorization boundary.
- No backfill: records created before this feature simply lack the field
  and continue rendering "Person N" (research R5).
- Never present in: session payloads, vote records, ranking/seen zsets,
  winners output, logs (FR-008 lineage preserved and extended).

State transitions (record-level, unchanged from 005 except creation):
- *absent* → *created*: first approved sign-in of an address; if the
  verified token carries a name, the created record includes `firstName`.
- No updates after creation (firstName joins `id`/`num` in immutability);
  no deletion flow.

Write/read budget impact: **none at runtime** — one extra JSON property
inside the single `HSET` already performed at first sign-in; zero new
keys; zero new read commands (the vote gate already fetches the record).

### Google tokeninfo response (CHANGED — consumed fields)

Server-side only; still fetched exactly once per sign-in by
`verifyGoogleIdToken`. Newly consumed fields:

| Field | Form (tokeninfo returns all values as strings) | Use |
|---|---|---|
| `given_name` | JSON string or absent | Preferred source for `firstName` (trimmed, non-empty). |
| `name` | JSON string or absent | Fallback: first whitespace-separated word becomes `firstName`. |
| `email`, `email_verified`, `aud`, `exp` | unchanged | Existing checks (004/005); untouched. |

Both name fields are treated as display hints from a verified response —
not security-relevant; presence/absence only toggles the fallback chain.

### Display label (CHANGED rendering rule — `displayLabel`)

Single rendering function, already the label source for `app/page.tsx`
(005 research R6). New precedence:

| Priority | Condition | Rendered |
|---|---|---|
| 1 | non-empty `firstName` on the session's own record | `firstName` |
| 2 | record present, `num` set, no `firstName` | `Person ${num}` (unchanged) |
| 3 | record missing or unresolvable | `Person` (unchanged) |

No new client state: `VoteClient` keeps receiving a plain `label` string
prop; the client component's code is unchanged.

## Relationships / flows

- Sign-in: `signIn(idToken)` → `verifyGoogleIdToken` (now also derives a
  name) → allowlist check (unchanged) → `resolveUser(email, firstName?)`
  creates-or-reads the record, persisting `firstName` **only on the
  create branch** → session cookie (payload unchanged: `uid` + `iat`
  only).
- Render: request → `VoteGate` (`getCurrentUid` → `findUserById` →
  `displayLabel`) → `VoteClient label` prop → text node in the existing
  hint line ("Welcher Name gefällt dir besser, {label}?").

## What does NOT change

- `namewahl:votes` stream, `namewahl:scores` global zset, per-user
  `scores`/`seen` zsets (006): structure and access untouched.
- Session payload shape and signing (005).
- Allowlist config (`APPROVED_EMAILS`), all environment variables (none
  added).
- Ranking, winners, pair drafting, result pages: zero interaction with
  user names.
