# Quickstart: Self-Contained Visual Suite (012)

Date: 2026-11-01. Validation guide for the credential-free visual suite.
Feature 011's quickstart remains the baseline for the guarantee
semantics; this guide covers the changed bring-up path (no
credentials, no Google, no Upstash) and validation of the mock
layer's invariants.

## Prerequisites

- Node 20+, `npm install` (once).
- One-time: `npx playwright install chromium`.
- Nothing may listen on the visual port (default 3111).
- **No `.env.visual` configuration needed** — the committed template in
  the repo contains the complete suite configuration (marker variable,
  port, suite identity, suite session secret). Nothing to fill in.

## A — Run the suite (the daily habit, unchanged command)

1. `npm run visual`.
2. **Pass**: exit 0, per-profile summary (011 contract C3.3),
   `tests/visual/screenshots/` populated (C4.1).
3. What makes this run different from 011:
   - No Upstash credentials anywhere; all data lives in the dev
     server's in-memory store, created empty at boot and gone when the
     run ends (SC-005 structural isolation — the store cannot contact
     or be contacted by any other service).
   - No Google; the sign-in step is one localhost POST that goes
     through the app's real session-granting path (`resolveUser` →
     `sealSession` → real cookie), so every signed-in screen is the
     exact screen a production user sees.

## B — Validate the credential-free invariants (one-time, re-runnable)

1. **Network isolation (SC-001)**: disconnect external network
   (firewall/airplane mode) and re-run — the suite must stay green
   (all traffic is 127.0.0.1: dev server + browser).
2. **Determinism (SC-004)**: run `npm run visual` 10× on the unchanged
   layout; identical per-profile summaries and a fresh, per-run
   implicit store each time (visible: the suite identity is `Person 1`
   / fixed firstName on every run because the store resets per boot).
3. **Regression sensitivity (SC-003)**: repeat 011 quickstart C's
   injection matrix unchanged — same failures, same messages, same
   profiles (the mock layer does not touch layout).
4. **Production invariance (SC-006)**:
   - `npm run build && npm start` (or plain `npm run dev`): the
     internal endpoint returns 404, the login screen uses the real
     Google button, and the store requires real credentials — no
     visible difference to pre-012 behavior.
   - `git grep VISUAL_MOCK_EXTERNAL` shows only: the template env
     file, the suite harness, `app/instrumentation.ts`, and the
     internal route — nothing in production logic branches on it
     being absent (absence = today's behavior, byte-for-byte).

## C — Setup-failure surfaces (C3.2 / FR-007, provoke one)

| Intervention | Expected setup error |
|---|---|
| Remove `VISUAL_MOCK_EXTERNAL` from `.env.visual` | `[visual-setup]` message naming the missing variable and the fix |
| Break the internal route (e.g., rename its directory) | canary setup error naming the endpoint unreachability + fix |
| Occupy port 3111 | the unchanged 011 "port already in use" setup error |
| Shorten `SESSION_SECRET` below 32 bytes | unchanged 011 min-length setup error |

All are distinct from guarantee failures (guarantee failures always
name guarantee + profile + numbers, C3.1).

## D — Agent judgment review (011's C5.1 gate — unchanged, still applies)

After a green run, load `tests/visual/screenshots/*` as images and
judge proportions/balance/coherence as in 011 quickstart D; record the
verdict in the tasks file. Only an agent-approved state completes the
feature.

## Done

Suite green (A) + invariants validated (B) + a provoked setup error
recognized (C) + agent review passed (D) ⇒ `contracts/visual-mocked-
deps.md` C1–C6 hold ⇒ FR-001…FR-008 satisfied.

## Verification record (012 implementation, 2026-11-01)

- **A**: verified — 19/19 green in ~18–25 s (multiple runs; see tasks
  file execution notes for the full per-scenario list).
- **B1**: verified with a browser-level egress block
  (`HTTP(S)_PROXY` dead port + `no_proxy=127.0.0.1,localhost`);
  `unshare -n` is unavailable in the build environment. Green.
- **B2**: verified — 10 consecutive green runs, identical per-profile
  summaries, suite identity re-minted per boot.
- **B3**: verified — the 011 SC-003 injection reproduces the exact
  failure format (tasks file, T020 note).
- **B4**: verified — production build + `next start`: internal route
  404, page 200; `git grep VISUAL_MOCK_EXTERNAL` confined to the suite
  files, the hook, the route, the template, and this feature's docs.
- **C**: all four rows verified (missing marker, renamed endpoint,
  occupied port, short secret) — tasks file T023 note.
- **D**: see the T026 verdict in the tasks file.
