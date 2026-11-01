// Suite-only local sign-in endpoint (feature 012, contract C6.3/C6.4).
//
// POST issues a REAL app-format session for the fixed suite identity by
// calling the app's real `signIn` action with the injected verified-
// identity dependency (app/actions.ts) — the production sign-in path minus
// only the Google ID-token verification hop. The cookie is set by the
// action's real `cookies().set`.
//
// Guarded twice (C6.1): the marker variable is checked here at request
// time AND the suite env is the only place it is ever set. Without the
// marker the route returns 404 — production and plain `npm run dev` never
// reach the sign-in path (SC-006/C6.6). No parameters are accepted: the
// body is ignored, so no identity other than the fixed suite record can
// ever be minted (C6.3).
import {
  signIn,
  type SignInResult,
} from "@/app/actions";
import type { GoogleVerifyResult } from "@/lib/google-verify";
import {
  VISUAL_MOCK_EXTERNAL_ENV,
  VISUAL_SUITE_EMAIL,
  VISUAL_SUITE_FIRST_NAME,
} from "@/app/commons-visual-mode";

/**
 * The injected verified-identity provider: resolves the fixed suite
 * identity as if Google had verified it (research R2). Only this route
 * ever passes it; production keeps the unchanged default verifier.
 */
function suiteIdentityVerified(): GoogleVerifyResult {
  return {
    ok: true,
    email: VISUAL_SUITE_EMAIL,
    firstName: VISUAL_SUITE_FIRST_NAME,
  };
}

export async function POST(): Promise<Response> {
  if (process.env[VISUAL_MOCK_EXTERNAL_ENV] !== "1") {
    return Response.json(
      {
        error: "not-found",
        detail:
          "This internal endpoint exists only in the visual suite's mock mode.",
      },
      { status: 404 }
    );
  }
  const result: SignInResult = await signIn(
    "visual-suite-local-signin", // never verified — injected below (C6.3)
    undefined, // verifyDeps: unused by the injected path
    async () => suiteIdentityVerified()
  );
  if (!result.ok) {
    // The suite identity is approved by the suite env's APPROVED_EMAILS;
    // reaching this branch means the suite env is misconfigured — fail
    // loudly (C3.2-adjacent; the suite's canary surfaces it).
    return Response.json(
      { error: "signin-failed", reason: result.reason, detail: result.detail },
      { status: 500 }
    );
  }
  return Response.json({ ok: true, label: result.label });
}

export async function GET(): Promise<Response> {
  return Response.json({ error: "method-not-allowed" }, { status: 405 });
}
