
# Name App Constitution

This is a toy project with exactly two users. Simplicity is paramount and the
application MUST fit entirely within the Vercel and Upstash free plans.

## Core Principles

### I. Framework Fidelity

All application code MUST target the Next.js App Router conventions as shipped in
this repository's pinned Next.js version (see `package.json`). Because this Next.js
line may introduce breaking changes relative to older conventions, developers MUST
consult the bundled docs in `node_modules/next/dist/docs/` before using unfamiliar
APIs and MUST NOT rely on stale patterns from other Next.js versions. Deprecated
APIs noted in those docs MUST NOT be used in new code.

**Rationale**: Ignoring version-specific conventions produces code that builds
today and breaks on upgrade; the bundled docs are the single source of truth for
the exact version in use.

### II. TypeScript Strictness

All source files MUST be valid TypeScript that type-checks cleanly under the
project `tsconfig.json` with no errors and no suppressed types (`any` casts,
`@ts-ignore`) unless justified in a code comment explaining why the escape is
necessary. Public module boundaries (exported functions, components, props)
MUST have explicit types.

**Rationale**: Type safety is the first line of automated review in a small
codebase; silent escapes undermine it.

### III. Proportionate Test-First

Every bug fix or new behavior MUST be accompanied by a test written before the
implementation change lands: the test MUST fail against the unmodified code
(red), then pass after the change (green). Tests MUST stay proportionate to a
two-user toy project: one focused test per behavior, and no test scaffolding,
fixtures, or coverage tooling beyond what the tests themselves need. Pure
refactors are exempt when no observable behavior changes and existing tests
still pass. Over-engineered test suites are a Principle V violation.

**Rationale**: Tests-first keeps regressions visible, but in a toy project the
cost of elaborate test infrastructure exceeds its value.

### IV. Proportionate Integration Testing

Integration-level tests are REQUIRED only for critical paths: route handlers
and pages implementing core features, and data persistence against Upstash.
Styling, layout, and secondary UI behavior MUST NOT require integration tests.
When a critical path can be verified with a single unit-level test, that is
sufficient — no additional integration test MAY be added just for coverage.

**Rationale**: Next.js behavior often only manifests across the framework
boundary (routing, rendering, caching), so critical paths need integration
tests — but only critical paths.

### V. Simplicity Is Paramount

Simplicity is the governing principle of this project: when any rule here or in
a feature spec conflicts with keeping the system simple, simplicity wins.
Implementations MUST use the simplest solution that satisfies the current
requirement. No abstractions, dependencies, or configuration MAY be added
without a concrete, present need. Every new dependency MUST be justified in
the pull request describing it.

**Rationale**: This is a toy project for two users; every ounce of complexity
must earn its keep.

## Technology Constraints

- **Framework**: Next.js (pinned version in `package.json`) with the App
  Router; pages-router patterns MUST NOT be introduced.
- **Language**: TypeScript for all application code; strict mode per
  `tsconfig.json`.
- **UI**: React function components only; styling follows the existing
  CSS Modules convention (`*.module.css`) unless a feature spec explicitly
  adopts an alternative.
- **Package management**: npm is the canonical package manager; `package-lock.json`
  MUST be committed and kept in sync.
- **Server components by default**: components MUST be server components unless
  they require client interactivity, in which case `"use client"` is applied at
  the narrowest possible scope.

### Free-Plan Budget

- The entire application MUST run on the **Vercel free (Hobby) plan**: no
  feature MAY require a paid Vercel plan or team-only Vercel features.
- Persistence and caching MUST use **Upstash free-tier** services (e.g.
  Upstash Redis free tier); usage MUST stay within free-tier request and
  storage limits — the project has exactly two users, and no feature MAY
  generate traffic patterns that could exhaust the free quota.
- No other paid service, API, or infrastructure MAY be introduced.
- Any feature whose expected usage cannot be served within these limits MUST
  be redesigned to fit, not upgraded to paid tiers.

## Development Workflow & Quality Gates

- A change is complete only when `npm run build` succeeds with zero type or
  lint errors.
- Every feature begins with a Spec Kit specification (`/speckit.specify`) and a
  plan (`/speckit.plan`) before implementation tasks are authored.
- Pull requests MUST state which constitution principles are exercised and how
  the test-first requirement (Principle III) was satisfied, in proportion to
  the change (Principle V).
- Runtime development guidance lives in project documentation (e.g. `AGENTS.md`
  and `node_modules/next/dist/docs/`); this constitution governs *what* is
  acceptable, not *how* to perform routine tasks.

## Governance

- This constitution supersedes all other practices, conventions, and
  documentation where they conflict.
- Amendments MUST be documented in a Sync Impact Report, committed alongside
  the change, and include a version increment per the rules below.
- Versioning follows semantic versioning: MAJOR for incompatible principle
  removals or redefinitions, MINOR for new principles or materially expanded
  guidance, PATCH for clarifications and non-semantic refinements.
- All reviews and PRs MUST verify compliance with these principles; complexity
  beyond the simplest viable approach MUST be rejected (Principle V).
- Any proposal that would require paid infrastructure MUST be rejected as a
  constitutional violation (Free-Plan Budget).

**Version**: 1.1.0 | **Ratified**: 2026-11-01 | **Last Amended**: 2026-11-01
