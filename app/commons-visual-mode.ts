// Suite identity constants (feature 012, plan.md structure: shared
// mock-mode constants colocated in one tiny module). Imported by
// app/instrumentation.ts, app/internal/visual-signin/route.ts and the
// suite's env loader. Dev-only contract (C6.1/C6.3): the marker variable
// name, the fixed suite identity, and the local sign-in route path.
export const VISUAL_MOCK_EXTERNAL_ENV = "VISUAL_MOCK_EXTERNAL";

/** The suite's fixed identity — an .invalid-TLD address that can never be
 *  a real Google account (data-model.md "Suite test identity"). */
export const VISUAL_SUITE_EMAIL = "visual-suite@nameapp.invalid";
/** Fixed first name captured by resolveUser at each run's first boot. */
export const VISUAL_SUITE_FIRST_NAME = "Visueller Tester";

/** The suite-only local sign-in route (contract C6.4). */
export const VISUAL_SIGNIN_ROUTE = "/internal/visual-signin";
