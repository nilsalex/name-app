// Next.js instrumentation hook (feature 012, research R1, contract C6.1).
//
// `register()` runs once when a Next.js server instance is initiated and
// must complete before the server is ready to handle requests (pinned
// Next 16.4.3 doc: 01-app/02-guides/instrumentation.md). In mock mode
// (VISUAL_MOCK_EXTERNAL=1, set ONLY by the visual suite's dev-server child
// process) it injects the in-memory fake store BEFORE the first request,
// so every store command executes in-process against empty Map state.
//
// In every other runtime and without the marker variable this file is
// INERT: it returns immediately without loading anything (SC-006 — the
// production app is byte-identical to pre-012 behavior).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VISUAL_MOCK_EXTERNAL !== "1") return;
  // Documented side-effect-import pattern: the module wires the fake store
  // into lib/store.ts / lib/user-store.ts at import time.
  await import("./fake-store").then((m) => m.installFakeStore());
}
